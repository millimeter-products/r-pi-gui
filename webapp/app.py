from flask import Flask, render_template, request, jsonify
import json
import os
import RPi.GPIO as GPIO
import adi
from w1thermsensor import W1ThermSensor
import time
import threading
import logging            
import os
import math

logging.basicConfig(
    filename='app.log',
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

app = Flask(__name__, static_folder='static')

# Initialize the ADF4371 device
pll = adi.adf4371()
sensor = W1ThermSensor()

# GPIO setup
GPIO.setmode(GPIO.BCM)
GPIO.setup(9, GPIO.IN)
GPIO.setup(6, GPIO.OUT) # Pin 31 RF On/OFF
GPIO.setup(12, GPIO.OUT) # TTL4
GPIO.setup(17, GPIO.OUT)  # GPIO 17 for Pin 11 / SP4T TTL1
GPIO.setup(20, GPIO.OUT) # TTL3
GPIO.setup(27, GPIO.OUT)  # GPIO 27 for Pin 13 / SP4T TTL2
GPIO.setup(18, GPIO.OUT)  # GPIO 18 for the temperature sensor
GPIO.setup(26, GPIO.IN) # GPIO 26 for External trigger

# Define paths
DTS_FILE = "/home/miwv/rpi-adf4371-overlay.dts"  # Path to your .dts file
DTBO_FILE = "/home/miwv/rpi-adf4371.dtbo"       # Compiled output .dtbo file
OVERLAY_PATH = "/boot/overlays"                 # Target overlay directory

CONFIG_FILE = 'webapp_config.json'
DEFAULT_CONFIG = {
    'refFrequency': '',
    'frequencyType': 'CW Frequency',
    'outputFrequency': '1000',
    'minFrequency': '4000',
    'maxFrequency': '7000',
    'stepSize': '100',
    'sweepTime': '1000',
    'filter': '0',
    'bias': '0',
    'chargePump': 1.75,  # Default charge pump current value (in mA)
    'rfStatus': False
}


# Global variables for external trigger mode
external_trigger_active = False
ext_frequencies = []
ext_index = 0

# Global variables for reference
ref_freq = 100 # Default value
ref_doubler_enabled = False  # Default state: doubler disabled
divide_by_2_enabled = False # Default state: divider disabled

# Global variable to track powered down channels
powered_down_channels = []

# Global variable to store last known value of 0x25
last_register_0x25_value = None  

# Function to map current values (in mA) to hex register values
def get_hex_for_current(current):
    current_to_hex_map = {
        0.35: 0x8,
        0.70: 0x18,
        1.05: 0x28,
        1.40: 0x38,
        1.75: 0x48,
        2.10: 0x58,
        2.45: 0x68,
        2.80: 0x78,
        3.15: 0x88,
        3.50: 0x98,
        3.85: 0xA8,
        4.20: 0xB8,
        4.55: 0xC8,
        4.90: 0xD8,
        5.25: 0xE8,
        5.60: 0xF8
    }
    return current_to_hex_map.get(current, None)

def save_config(config):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f)

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            config = json.load(f)
    else:
        config = DEFAULT_CONFIG.copy()

    config['chargePump'] = 1.75

    # Read reference frequency from Global variable
    # config['refFrequency'] = read_reference_frequency()
    config['refFrequency'] = config.get('refFrequency', 100)  # Default to 100 MHz if not present

    save_config(config)  # Save the config with the updated reference frequency
    return config

def load_rfsynthesizer_info():
    try:
        with open('rfsynthesizer_info.json', 'r') as f:
            return json.load(f)
    except (IOError, json.JSONDecodeError):
        return {'part_no': 'Unknown', 'serial_no': 'Unknown'}

def load_procedure():
    try:
        with open('rfsynthesizer_procedure.txt', 'r') as f:
            return f.read()
    except IOError:
        return "Error reading procedure file."

def read_reference_frequency():
    global ref_freq
    config = load_config()
    ref_freq = float(config.get('refFrequency', 100))  # Default to 100 MHz if not set
    return str(ref_freq)

# Reference Doubler and Divider setting
def update_register_0x22():

    global ref_doubler_enabled, divide_by_2_enabled

    try:
        # Read the current value of register 0x22
        current_value = pll.reg_read(0x22)
        if isinstance(current_value, str):
            current_value = int(current_value, 16)

        # Start with the current value and modify bits 4 and 5
        current_value &= 0x70

        if ref_doubler_enabled:
            current_value |= 0x20  # Set bit 5 for doubler
        else:
            current_value &= ~0x20  # Clear bit 5

        if divide_by_2_enabled:
            current_value |= 0x10  # Set bit 4 for divider
        else:
            current_value &= ~0x10  # Clear bit 4

        # Write the updated value back to register 0x22
        pll.reg_write(0x22, current_value)

        return current_value  # Optionally return the new value for debugging

    except Exception as e:
        logging.error(f"Error updating register 0x22: {e}")
        raise RuntimeError(f"Failed to update register 0x22: {str(e)}")


def calculate_fpfd(ref_freq_Hz, ref_div_factor, ref_doubler_enabled, max_freq_pfd, divide_by_2_enabled):

    D = 1 if ref_doubler_enabled else 0
    T = 1 if divide_by_2_enabled else 0

    fpfd = ref_freq_Hz * ((1 + D) / (ref_div_factor * (1 + T)))

    if fpfd > max_freq_pfd:
        ref_div_factor = math.ceil(ref_freq_Hz * ((1 + D) / (max_freq_pfd * (1 + T))))
        fpfd = ref_freq_Hz * ((1 + D) / (ref_div_factor * (1 + T)))

        if fpfd > max_freq_pfd:
            raise RuntimeError(f"Recalculated fPFD {fpfd} Hz exceeds maximum allowable {max_freq_pfd} Hz.")

    return fpfd, ref_div_factor


def set_frequency(output_frequency):
    GPIO.output(12, GPIO.HIGH)
    GPIO.output(20, GPIO.HIGH)
    global powered_down_channels
    global last_register_0x25_value  
    global ref_freq, ref_doubler_enabled, divide_by_2_enabled

    # Power up channels
    for channel in powered_down_channels:
        with open(channel, 'w') as file:
            file.write('0')

    # Define constants for modulus and other parameters
    ADF4371_MIN_VCO_FREQ = 4000000000  # 4 GHz
    ADF4371_MAX_VCO_FREQ = 8000000000
    ADF4371_MODULUS1 = 2**25
    ADF4371_MAX_MODULUS2 = 2**14
    max_freq_pfd = 250000000
    channel_spacing = 200e3  # Channel spacing (200 kHz)


    # Convert REF FREQ from MHz to Hz
    ref_freq_Hz = ref_freq * 1e6

    # Convert output frequency to Hz
    try:
        frequency_in_hz = float(output_frequency) * 10**6  # Convert MHz to Hz
        print(f"Output Frequency: {frequency_in_hz} Hz")

    except (ValueError, TypeError) as e:
        return {"status": "error", "message": f"Invalid output frequency: {e}"}

    # Calculate PFD (Phase Frequency Detector) frequency (0x1F)

    ref_div_factor = 1
    fpfd, ref_div_factor = calculate_fpfd(ref_freq_Hz, ref_div_factor, ref_doubler_enabled, max_freq_pfd, divide_by_2_enabled)
    print(f"Initial fPFD: {fpfd}, ref_div_factor: {ref_div_factor}")

    register_0x25_value = 0x03  # Start with max power (0b11 for +5 dBm)

    # Determine filter and bias values based on the original output frequency
    if frequency_in_hz < 18e9:  # Convert to MHz for comparison
        filter_value = 7
        bias_value = 3
    elif 18e9 <= frequency_in_hz < 19e9:
        filter_value = 3
        bias_value = 3
    elif 19e9 <= frequency_in_hz < 20.5e9:
        filter_value = 1
        bias_value = 0
    elif 20.5e9 <= frequency_in_hz < 26e9:
        filter_value = 0
        bias_value = 0
    else:  # frequency_in_hz >= 26e9
        filter_value = 0
        bias_value = 1

    # Set the appropriate path for frequency range
    if frequency_in_hz > ADF4371_MAX_VCO_FREQ * 4:
        raise ValueError("Frequency exceeds maximum supported range (32 GHz).")

    elif frequency_in_hz > ADF4371_MAX_VCO_FREQ * 2:
        # Set for frequencies 16-32 GHz (x4 quadrupler)
        frequency_in_hz /= 4
        rf_div_sel = 2
        GPIO.output(17, GPIO.LOW)
        GPIO.output(27, GPIO.LOW)
        register_0x25_value |= 0x10  # Enable RF32

        # Verify calculated values and write to Register 0x71
        try:
            register_0x71 = (filter_value << 5) | bias_value
            pll.reg_write(0x71, register_0x71)
        except Exception as e:
            raise RuntimeError(f"Failed to write filter and bias values: {e}")

    elif frequency_in_hz > ADF4371_MAX_VCO_FREQ:
        # Set for frequencies 8-16 GHz (x2 doubler)
        frequency_in_hz /= 2
        rf_div_sel = 1
        GPIO.output(17, GPIO.LOW)
        GPIO.output(27, GPIO.HIGH)
        register_0x25_value |= 0x08  # Enable RF16

    else:
        # Set for frequencies 4-8 GHz (no multiplier, direct RF_EN path)
        rf_div_sel = 0
        GPIO.output(17, GPIO.HIGH)
        GPIO.output(27, GPIO.LOW)
        register_0x25_value |= 0x04  # Enable RF8

        # Set DIV_SEL and FB_SEL based on frequency
        rf_div_sel = 0  # Start with no division
        while frequency_in_hz < ADF4371_MIN_VCO_FREQ:
            frequency_in_hz *= 2  # Double the frequency
            rf_div_sel += 1  # Increase the divider selector

    # register_0x25_value |= 0x80  # Set MUTE_LD (OPTIONAL)

    register_0x24_value = (rf_div_sel << 4) | 0x80  # Fundamental feedback with divider
   

    # Calculate integer, fractional, and modulus values for PLL
    N = frequency_in_hz / fpfd  # N value from the example
    integer_part = int(N)  # Get the integer part without rounding

    tmp = frequency_in_hz % fpfd
    fract1_tmp = tmp * ADF4371_MODULUS1
    fract2_tmp = (fract1_tmp % fpfd) * ADF4371_MAX_MODULUS2
    fract1 = int(fract1_tmp // fpfd)
    fract2 = int(fract2_tmp // (ADF4371_MODULUS1 * fpfd))

    mod2 = int(fpfd)

    while mod2 > ADF4371_MAX_MODULUS2:
        mod2 >>= 1
        fract2 >>= 1

    gcd = math.gcd(fract2, mod2)
    fract2 //= gcd
    mod2 //= gcd

    reg_0x17 = (fract2 & 0x7F) | (fract1 >> 24) # very important step

    # Calculate and apply cp_bleed (0x26)

    cp_bleed = max(1, min(255, math.ceil((400 * 1750) / (integer_part * 375))))


    # VCO Band Division,SYNTH_LOCK_TIMEOUT, TIMEOUT, and VCO_ALC_TIMEOUT
    
                       # VCO Band Division
    vco_band_div = math.ceil(fpfd / 2400000)

                       # Initialize timeouts
    timeout = 2
    synth_timeout = 0
    vco_alc_timeout = 1

                       # Calculate TIMEOUT and SYNTH_LOCK_TIMEOUT
    tmp = round(fpfd / 1000000)
    while True:
        timeout += 1
        if timeout > 1023:
            timeout = 2
            synth_timeout += 1
        if synth_timeout * 1024 + timeout > 20 * tmp:
            break

                       # Calculate VCO_ALC_TIMEOUT
    while vco_alc_timeout * 1024 - timeout <= 50 * tmp:
        vco_alc_timeout += 1

                       # ADC clock divider for Register 0x35
    target_adc_clk = 100000  # 100 kHz
    adc_clk_div = int(((fpfd / target_adc_clk) / 4) - 0.5)

    # Update register 0x22
    updated_value = update_register_0x22()

    # Store the last written value of register 0x25
    last_register_0x25_value = register_0x25_value  

    # Calculated Registers
    calc_data = [
        (0x35, adc_clk_div & 0xFF),
        (0x34, vco_alc_timeout & 0xFF),
        (0x33, synth_timeout & 0xFF),
        (0x32, (timeout >> 8) & 0xFF),
        (0x31, timeout & 0xFF),
        (0x30, vco_band_div & 0xFF),
        (0x2B, 0x01 if (fract1 == 0 and fract2 == 0) else 0x00),
        (0x26, cp_bleed),
        (0x25, register_0x25_value), 
        (0x24, register_0x24_value),
        (0x1F, ref_div_factor), 
        (0x1A, (mod2 >> 8) & 0x3F),
        (0x19, mod2 & 0xFF),
        (0x18, (fract2 >> 7) & 0xFF),
        (0x17, reg_0x17),
        (0x16, (fract1 >> 16) & 0xFF),
        (0x15, (fract1 >> 8) & 0xFF),
        (0x14, fract1 & 0xFF),
	(0x12, 0x40),
        (0x11, (integer_part >> 8) & 0xFF)
    ]

    for reg, value in calc_data:
        pll.reg_write(reg, value)

    pll.reg_write(0x10, integer_part & 0xFF)
    GPIO.output(6, GPIO.HIGH)  # RF ON LED

    return {
        "status": "success",
        "message": f"Frequency {output_frequency} MHz set"
    }


def set_attenuation(attenuation_db):
    """
    Set attenuation for ADRF5730 
    """

    if attenuation_db == "disable_rf":
        return disable_rf_output()  # Call function to write 0x00 to Register 0x25

    if attenuation_db == "reset_rf":
        return restore_last_rf_setting()  # Restores last value of Register 0x25

    if not (0 <= attenuation_db <= 31):
        return "Invalid attenuation value. Must be between 0 and 31 dB."

    try:
        with open("/sys/bus/iio/devices/iio:device0/out_voltage0_hardwaregain", "w") as f:
            f.write(f"-{attenuation_db}\n")
        return f"Attenuation set to {attenuation_db} dB"
    except Exception as e:
        return f"Error setting attenuation: {str(e)}"

def disable_rf_output():
    """
    Write 0x00 to ADF4371 register 0x25 - MAX Attenuation.
    """
    try:
        pll.reg_write(0x25, 0x00)  # RF_EN = 0, x2 = 0, x4 = 0, Power Level = 0
        return "MAX Attenuation 60dB"
    except Exception as e:
        return f"Error disabling RF output: {str(e)}"


def restore_last_rf_setting():
    """
    Restore the last known value of Register 0x25 -Clear ATT.
    """
    global last_register_0x25_value  # Access the stored value

    if last_register_0x25_value is None:
        return "No previous value available for Register 0x25."

    try:
        pll.reg_write(0x25, last_register_0x25_value)
        return f"Attenuation restored to last configuration"
    except Exception as e:
        return f"Error restoring RF setting: {str(e)}"




@app.route('/set_attenuation', methods=['POST'])
def set_attenuation_route():
    """
    API to set attenuation via HTTP request from Web GUI.
    """
    try:
        data = request.json  # Get JSON data from frontend
        attenuation_db = data.get("attenuation")

        if attenuation_db is None:
            return jsonify({"status": "error", "message": "Missing 'attenuation' parameter"}), 400

        response = set_attenuation(attenuation_db)  # Call function to set attenuation
        return jsonify({"status": "success", "message": response})

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/get_attenuation', methods=['GET'])
def get_attenuation():
    """
    Read the current attenuation value from sysfs.
    """
    try:
        attenuation_file = "/sys/bus/iio/devices/iio:device0/out_voltage0_hardwaregain"

        # Check if the file exists
        if not os.path.exists(attenuation_file):
            return jsonify({"status": "error", "message": "Attenuation file not found"}), 500

        with open(attenuation_file, "r") as f:
            raw_value = f.read().strip()  # Read raw string

        # Remove " dB" and convert to float
        attenuation_value = float(raw_value.replace(" dB", "").strip())

        # Convert -5.0000 dB to 5 dB (remove negative sign)
        attenuation_value = abs(attenuation_value)

        return jsonify({"status": "success", "attenuation": attenuation_value})

    except ValueError:
        return jsonify({"status": "error", "message": "Invalid attenuation value"}), 500

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500




@app.route('/start_sweep', methods=['POST'])
def start_sweep():
    try:
        # Parse request JSON
        data = request.get_json()
        min_frequency = float(data.get('minFrequency'))
        max_frequency = float(data.get('maxFrequency'))
        step_size = float(data.get('stepSize'))
        sweep_time = int(data.get('sweepTime'))  # in milliseconds

        # Validate inputs
        if min_frequency >= max_frequency or step_size <= 0 or sweep_time <= 0:
            return jsonify({"status": "error", "message": "Invalid sweep parameters"}), 400

        current_frequency = min_frequency
        while current_frequency <= max_frequency:
            # Set the frequency
            result = set_frequency(current_frequency)
            if result['status'] != 'success':
                return jsonify({"status": "error", "message": f"Failed to set frequency: {current_frequency} MHz"}), 500

            # Wait for the specified sweep time
            time.sleep(sweep_time / 1000)  # Convert milliseconds to seconds
            current_frequency += step_size

        return jsonify({"status": "success", "message": "Frequency sweep completed"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# Function to set the frequency when the trigger is received
def set_next_frequency():
    global ext_index
    if ext_frequencies:
        frequency = ext_frequencies[ext_index]
        # Logic to set the frequency in the synthesizer goes here
        print(f"Setting frequency to {frequency} MHz")
        ext_index = (ext_index + 1) % len(ext_frequencies)  # Cycle through frequencies


# Poll GPIO 26 for rising edge
def poll_gpio():
    global ext_index, external_trigger_active
    
    try:
        while external_trigger_active:
            if GPIO.input(26) == GPIO.HIGH:
                print("GPIO 26 trigger detected. Setting frequency:", ext_frequencies[ext_index])

                # Set the next frequency and loop back if necessary
                set_frequency(ext_frequencies[ext_index])
                ext_index = (ext_index + 1) % len(ext_frequencies)

                # Prevent multiple triggers from a single pulse
                while GPIO.input(26) == GPIO.HIGH:
                    time.sleep(0.01)

                print("Frequency set, waiting for the next trigger.")
            time.sleep(0.01)
    except Exception as e:
        print("Error in external trigger polling:", str(e))




@app.route('/')
def index():
    config = load_config()
    rfsynthesizer_info = load_rfsynthesizer_info()
    procedure = load_procedure()
    return render_template('index.html', config=config, rfsynthesizer_info=rfsynthesizer_info, procedure=procedure)

@app.route('/help')
def help():
    config = load_config()
    rfsynthesizer_info = load_rfsynthesizer_info()
    return render_template('help.html', config=config, rfsynthesizer_info=rfsynthesizer_info)


@app.route('/save_config', methods=['POST'])
def save_config_route():
    config = request.get_json()
    save_config(config)
    return jsonify({'status': 'success', 'message': 'Configuration saved'})

@app.route('/load_config', methods=['GET'])
def load_config_route():
    config = load_config()
    return jsonify(config)


@app.route('/set_charge_pump_current', methods=['POST'])
def set_charge_pump_current():
    try:
        data = request.get_json()
        charge_pump_value = float(data.get('chargePump'))

        # Map the charge pump current to the hex value
        hex_value = get_hex_for_current(charge_pump_value)
        if hex_value is None:
            return jsonify({'status': 'error', 'message': 'Invalid charge pump current value'}), 400
        
        # Apply the charge pump current immediately
        pll.reg_write(0x1E, hex_value)

        # Return success message with the mapped hex value
        return jsonify({'status': 'success', 'hex_value': hex_value, 'message': 'Charge pump current applied successfully'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/clear_frequency', methods=['POST'])
def clear_frequency():
    GPIO.output(12, GPIO.LOW)
    GPIO.output(20, GPIO.LOW)
    global powered_down_channels
    powered_down_channels = []  # Reset the list before clearing frequencies

    try:
        # Register 0x25 configuration
        # Bits [4:2]: Disable RF_EN, x2, and x4
        # Bits [1:0]: Set power level to minimum (-4 dBm, value 0b00)
        register_0x25_value = 0x00  # RF_EN = 0, x2 = 0, x4 = 0, Power Level = 0

        # Write to register 0x25 to disable all channels
        pll.reg_write(0x25, register_0x25_value)

        pll.reg_write(0x72, 0x32)  # Auxiliary RF output off
        
        for reg in range(0x10, 0x1B):
            pll.reg_write(reg, 0x00)

        GPIO.output(17, GPIO.HIGH)
        GPIO.output(27, GPIO.HIGH)
        GPIO.output(6, GPIO.LOW)   # RF OFF LED

        # Track powered-down channels for logging or further operations
        powered_down_channels = ['RF_EN', 'x2', 'x4']  # Logical representation of disabled channels

        lock_register = int(pll.reg_read(0x7C), 0)
        lock_status = (lock_register & 0x01) == 0x01  # Check lock bit

        return jsonify(status='success', message='All RF channel frequencies turned OFF')
    except Exception as e:
        return jsonify(status='error', message=str(e))


@app.route('/set_frequency', methods=['POST'])
def set_frequency_route():
    try:
        data = request.json
        output_frequency = data.get('outputFrequency')
        # Call the set_frequency function
        result = set_frequency(output_frequency)

        lock_register = int(pll.reg_read(0x7C), 0)
        lock_status = (lock_register & 0x01) == 0x01  # Check lock bit

        return jsonify(result)
    except Exception as e:
        print(f"Unhandled error: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/start_external_trigger', methods=['POST'])
def start_external_trigger():
    global ext_frequencies, external_trigger_active, ext_index
    
    try:
        # Retrieve frequencies from the request
        data = request.get_json()
        ext_frequencies = data['frequencies']
        ext_index = 0
        external_trigger_active = True

        # Set up GPIO if it's not already set
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(26, GPIO.IN)

        print("External trigger mode activated with frequencies:", ext_frequencies)

        # Start the polling loop for GPIO 26
        thread = threading.Thread(target=poll_gpio, daemon=True)
        thread.start()

        return jsonify({"status": "success", "message": "External trigger mode started, waiting for trigger."})
    except Exception as e:
        print("Error starting external trigger mode:", str(e))
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/stop_external_trigger', methods=['POST'])
def stop_external_trigger():
    global external_trigger_active
    external_trigger_active = False
    return jsonify({"status": "success", "message": "External trigger mode stopped"})


@app.route('/check_lock_status', methods=['GET'])
def check_lock_status():
    try:
        # Check lock status from register 0x7C
        lock_register = int(pll.reg_read(0x7C), 0)  
        reg_lock_status = (lock_register & 0x01) == 0x01  

        # Check GPIO9 lock status
        gpio9_status = GPIO.input(9) == GPIO.HIGH  

        # Combine both statuses
        lock_status = reg_lock_status and gpio9_status

        return jsonify({"locked": lock_status, "status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})


# New route for DS18B20 temperature sensor
@app.route('/temperature', methods=['GET'])
def get_temperature():
    try:
        # Read temperature from DS18B20 sensor connected to GPIO 18
        temp_data = sensor.get_temperature()
        temperature = round(temp_data, 2)
        return jsonify({'temperature': temperature})
    except IOError:
        return jsonify({'status': 'error', 'message': 'Temperature sensor not found'})
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Error reading temperature'})


@app.route('/heartbeat', methods=['GET'])
def heartbeat():
    return jsonify({'status': 'alive'}), 200

@app.route('/set_ref_freq', methods=['POST'])
def set_ref_freq():
    global ref_freq
    try:
        # Get the new ref_freq value from the request
        data = request.get_json()
        new_ref_freq = data.get('ref_freq')

        # Check if new_ref_freq is provided
        if new_ref_freq is None:
            return jsonify({"status": "error", "message": "Reference frequency is missing"}), 400

        # Validate the input
        if not (10 <= new_ref_freq <= 500):  # Valid range is 10 MHz to 500 MHz
            return jsonify({"status": "error", "message": "Reference frequency out of range"}), 400

        # Update the global ref_freq value
        ref_freq = new_ref_freq

        config = load_config()
        config['refFrequency'] = ref_freq
        save_config(config)

        return jsonify({"status": "success", "message": f"Reference frequency updated to {new_ref_freq} MHz."})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/update_ref_doubler', methods=['POST'])
def update_ref_doubler():
    global ref_doubler_enabled
    try:
        # Get the new state from the request
        data = request.get_json()
        ref_doubler_enabled = data.get('ref_doubler_enabled', False)

        if ref_freq > 125 and ref_doubler_enabled:
            return jsonify({"status": "error", "message": "Reference Doubler can only be enabled for frequencies up to 125 MHz."}), 400

        # Update register 0x22
        updated_value = update_register_0x22()

        return jsonify({"status": "success", "message": "Reference doubler state updated successfully."})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/update_ref_divide_by_2', methods=['POST'])
def update_ref_divide_by_2():
    global divide_by_2_enabled
    try:
        # Get the new state from the request
        data = request.get_json()
        divide_by_2_enabled = data.get('divide_by_2_enabled', False)

        # Update register 0x22
        updated_value = update_register_0x22()


        return jsonify({"status": "success", "message": "Reference divide by 2 state updated successfully."})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500



@app.route('/get_doubler_status', methods=['GET'])
def get_doubler_status():
    try:
        global ref_doubler_enabled  # Ensure the global variable is accessible
        return jsonify({"doubler_enabled": ref_doubler_enabled, "status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

@app.route('/get_divider_status', methods=['GET'])
def get_divider_status():
    try:
        global divide_by_2_enabled  # Ensure the global variable is accessible
        return jsonify({"divide_by_2_enabled": divide_by_2_enabled, "status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})



@app.route('/reboot', methods=['POST'])
def reboot():
    try:
        os.environ["PATH"] += os.pathsep + "/sbin"  # Add /sbin to PATH
        os.system("reboot")
        return jsonify({"message": "Rebooting the system..."}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/shutdown', methods=['POST'])
def shutdown():
    try:
        import os
        os.environ["PATH"] += os.pathsep + "/sbin"  # Ensure /sbin is in the PATH
        os.system("shutdown now")
        return jsonify({"message": "System shutting down..."}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/set_phase', methods=['POST'])
def set_phase():

    try:
        data = request.json
        phase_deg = float(data.get('phase'))

        output_frequency = int(float(data.get('outputFrequency')) * 1e6)  # Convert MHz to Hz

        if not (0.00002 <= phase_deg <= 360):
            return jsonify({"status": "error", "message": "Invalid phase value. Must be between 0.00002 and 360 degrees."}), 400

        # Calculate the phase word
        phase_word = int((phase_deg / 360) * (2 ** 24))
 
        # Disable autocalibration (bit 6 of register 0x12)
        pll.reg_write(0x12, 0x0)

        # Enable phase adjustment (bit 6 of register 0x1A)
        # pll.reg_write(0x1A, 0x40)
        reg_1A_value = pll.reg_read(0x1A)
        reg_1A_value = int(reg_1A_value, 16)  
        new_reg1A_value = reg_1A_value | 0x40  # Set bit 6 to 1 (0b01000000)
        pll.reg_write(0x1A, new_reg1A_value)

        # Write the phase word to registers 0x1B, 0x1C, and 0x1D
        pll.reg_write(0x1B, (phase_word & 0xFF))         # Least significant byte
        pll.reg_write(0x1C, (phase_word >> 8) & 0xFF)   # Middle byte
        pll.reg_write(0x1D, (phase_word >> 16) & 0xFF)  # Most significant byte

        # Write to register 0x10 (reinitialize with INT value)
        int_value = pll.reg_read(0x10)  # Read the integer division word
        pll.reg_write(0x10, int_value)  # Write the same value back to 0x10

        # Display the message in the GUI message box
        message = f"Phase {phase_deg:.4f}° set successfully."

        return jsonify({"status": "success", "message": message}), 200

    except Exception as e:
        # Handle exceptions and return an error response
        return jsonify({"status": "error", "message": f"Failed to set phase. Error: {str(e)}"}), 500


@app.route('/set_time', methods=['POST'])
def set_time():

    try:
        data = request.json
        time_value = float(data.get('time'))
        time_unit = data.get('timeUnit')  # Unit can be ms, us, ns, ps, fs
        output_frequency = int(float(data.get('outputFrequency')) * 1e6)  # Convert MHz to Hz

        # Validate time unit
        time_unit_multiplier = {
            'ms': 1e-3,
            'us': 1e-6,
            'ns': 1e-9,
            'ps': 1e-12,
            'fs': 1e-15
        }

        if time_unit not in time_unit_multiplier:
            return jsonify({"status": "error", "message": "Invalid time unit."}), 400

        # Convert time to seconds based on the selected unit
        time_in_seconds = time_value * time_unit_multiplier[time_unit]

        # Calculate the phase in degrees
        phase_deg = (time_in_seconds * output_frequency) * 360
        phase_deg = phase_deg % 360  # Ensure phase stays within 0 to 360 degrees

        # Calculate the phase word
        phase_word = int((phase_deg / 360) * (2 ** 24))

        # Disable autocalibration (bit 6 of register 0x12)
        pll.reg_write(0x12, 0x0)

        # Enable phase adjustment (bit 6 of register 0x1A)
        pll.reg_write(0x1A, 0x40)

        # Write the phase word to registers 0x1B, 0x1C, and 0x1D
        pll.reg_write(0x1B, (phase_word & 0xFF))         # Least significant byte
        pll.reg_write(0x1C, (phase_word >> 8) & 0xFF)   # Middle byte
        pll.reg_write(0x1D, (phase_word >> 16) & 0xFF)  # Most significant byte

        # Write to register 0x10 (reinitialize with INT value)
        int_value = pll.reg_read(0x10)  # Read the integer division word
        pll.reg_write(0x10, int_value)  # Write the same value back to 0x10

        # Successful response
        message = (
            f"Time delay {time_value} {time_unit} set successfully "
            f"(Phase equivalent: {phase_deg:.4f}°)."
        )
        return jsonify({"status": "success", "message": message}), 200

    except KeyError as e:
        return jsonify({"status": "error", "message": f"Missing key: {str(e)}"}), 400
    except ValueError as e:
        return jsonify({"status": "error", "message": f"Invalid value: {str(e)}"}), 400
    except Exception as e:
        return jsonify({"status": "error", "message": f"Failed to set time delay. Error: {str(e)}"}), 500



@app.route('/convert_time_to_phase', methods=['POST'])
def convert_time_to_phase():

    data = request.json
    time_value = float(data.get('time'))
    time_unit = data.get('timeUnit')  # Unit can be ms, us, ns, ps, fs
    output_frequency = float(data.get('outputFrequency')) * 1e6  # Convert MHz to Hz

    time_unit_multiplier = {
        'ms': 1e-3,
        'us': 1e-6,
        'ns': 1e-9,
        'ps': 1e-12,
        'fs': 1e-15
    }

    if time_unit not in time_unit_multiplier:
        return jsonify({"error": "Invalid time unit."}), 400

    time_in_seconds = time_value * time_unit_multiplier[time_unit]
    phase_deg = (time_in_seconds * output_frequency) * FULL_CIRCLE_DEGREES
    phase_deg = phase_deg % 360  # Ensure phase stays within 0 to 360 degrees

    return jsonify({"phase": phase_deg})


@app.route('/convert_phase_to_time', methods=['POST'])
def convert_phase_to_time():

    data = request.json
    phase_deg = float(data.get('phase'))
    output_frequency = float(data.get('outputFrequency')) * 1e6  # Convert MHz to Hz

    if not (0.00002 <= phase_deg <= 360):
        return jsonify({"error": "Invalid phase value. Must be between 0.00002 and 360 degrees."}), 400

    time_in_seconds = (phase_deg / 360) / output_frequency

    # Convert time to appropriate units
    time_units = {
        'ms': time_in_seconds * 1e3,
        'us': time_in_seconds * 1e6,
        'ns': time_in_seconds * 1e9,
        'ps': time_in_seconds * 1e12,
        'fs': time_in_seconds * 1e15
    }

    return jsonify({"timeUnits": time_units})

@app.route('/set_ip_mode', methods=['POST'])
def set_ip_mode():
    try:
        data = request.get_json()
        mode = data.get('mode')
        static_ip = data.get('static_ip')

        config_path = "/etc/dhcpcd.conf"
        os.system(f"cp {config_path} {config_path}.bak")

        if mode == "dhcp":
            config_text = """
interface eth0
dhcp4: true

interface wlan0
dhcp4: true
            """
        elif mode == "static" and static_ip:
            config_text = f"""
interface eth0
static ip_address={static_ip}/24
dhcp4: true

interface wlan0
static ip_address={static_ip}/24
dhcp4: true
            """
        else:
            return jsonify({"status": "error", "message": "Static IP is required for static mode"}), 400

        with open(config_path, "w") as f:
            f.write(config_text)

        os.system("sudo systemctl restart dhcpcd")
        return jsonify({"status": "success", "message": f"{mode.capitalize()} IP configuration applied."})

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500



if __name__ == '__main__':
    
    app.run(host='0.0.0.0', port=5000, debug=True)


@app.route('/start_pwm', methods=['POST'])
def start_pwm():
    global pwm_thread, pwm_active
    try:
        data = request.get_json()
        frequency = float(data.get('frequency'))
        mode = data.get('mode')
        burst_mode = data.get('burstMode', False)
        burst_count = int(data.get('burstCount', 10))
        burst_pause = int(data.get('burstPause', 100))
        pwm_active = True

        if frequency < 62 or frequency > 32000:
            return jsonify({'status': 'error', 'message': 'Invalid frequency'}), 400

        result = set_frequency(frequency)
        if result['status'] != 'success':
            return jsonify(result), 400

        ttl17 = GPIO.input(17)
        ttl27 = GPIO.input(27)

        if mode == 'duty':
            duty = float(data.get('dutyCycle')) / 100.0
            pwm_freq = float(data.get('pwmRate'))
            period = 1.0 / pwm_freq
            high_time = period * duty
            low_time = period * (1 - duty)
        elif mode == 'prt':
            high_time = float(data.get('pulseWidth')) / 1e6
            low_time = (float(data.get('prt')) - float(data.get('pulseWidth'))) / 1e6
        else:
            return jsonify({'status': 'error', 'message': 'Invalid PWM mode'}), 400

        def pwm_loop():
            while pwm_active:
                if burst_mode:
                    for _ in range(burst_count):
                        GPIO.output(17, ttl17)
                        GPIO.output(27, ttl27)
                        time.sleep(high_time)
                        GPIO.output(17, GPIO.HIGH)
                        GPIO.output(27, GPIO.HIGH)
                        time.sleep(low_time)
                    time.sleep(burst_pause / 1000.0)
                else:
                    GPIO.output(17, ttl17)
                    GPIO.output(27, ttl27)
                    time.sleep(high_time)
                    GPIO.output(17, GPIO.HIGH)
                    GPIO.output(27, GPIO.HIGH)
                    time.sleep(low_time)

        pwm_thread = threading.Thread(target=pwm_loop, daemon=True)
        pwm_thread.start()
        return jsonify({'status': 'success', 'message': 'PWM started'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/stop_pwm', methods=['POST'])
def stop_pwm():
    global pwm_active
    pwm_active = False
    GPIO.output(17, GPIO.HIGH)
    GPIO.output(27, GPIO.HIGH)
    return jsonify({'status': 'success', 'message': 'PWM stopped'})
