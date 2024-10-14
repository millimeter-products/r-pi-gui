from flask import Flask, render_template, request, jsonify
import json
import os
import RPi.GPIO as GPIO
import adi
from w1thermsensor import W1ThermSensor
import time
import threading

app = Flask(__name__)

# Initialize the ADF4371 device
pll = adi.adf4371()
sensor = W1ThermSensor()

# GPIO setup
GPIO.setmode(GPIO.BCM)
GPIO.setup(9, GPIO.IN)
GPIO.setup(17, GPIO.OUT)  # GPIO 17 for Pin 11
GPIO.setup(27, GPIO.OUT)  # GPIO 27 for Pin 13
GPIO.setup(18, GPIO.OUT)  # GPIO 18 for the temperature sensor
GPIO.setup(26, GPIO.IN) # GPIO 26 for External trigger



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

# Function to map filter and bias values to a hex value for register 0x71
def get_hex_for_filter_bias(filter_value, bias_value):
    if 0 <= filter_value <= 7 and 0 <= bias_value <= 3:
        return (filter_value << 5) | bias_value
    else:
        return None

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

    # Read reference frequency from sysfs entry
    config['refFrequency'] = read_reference_frequency()

    # Ensure values are set correctly in the config for external trigger mode
    

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
    try:
        with open('/proc/device-tree/clocks/clock@0/clock-frequency', 'rb') as f:
            data = f.read(4)

        if len(data) != 4:
            return "Error reading frequency"

        decimal_value = int.from_bytes(data, byteorder='big')
        decimal_value = decimal_value / 10**6
        frequency = str(decimal_value)
        return frequency
    except IOError:
        return "Error reading frequency"

def set_frequency(output_frequency):
    global powered_down_channels

    # Power up channels
    for channel in powered_down_channels:
        with open(channel, 'w') as file:
            file.write('0')

    if output_frequency:
        try:
            # Convert to float for fractional frequencies
            frequency = float(output_frequency)
            frequency_in_hz = frequency * 10**6  # Convert MHz to Hz

            print(f"Setting output frequency: {frequency} MHz ({frequency_in_hz} Hz)")

            if frequency_in_hz > 16 * 10**9:
                path = '/sys/bus/iio/devices/iio:device0/out_altvoltage3_frequency'
                GPIO.output(17, GPIO.LOW)
                GPIO.output(27, GPIO.LOW)
            elif frequency_in_hz > 8 * 10**9:
                path = '/sys/bus/iio/devices/iio:device0/out_altvoltage2_frequency'
                GPIO.output(17, GPIO.LOW)
                GPIO.output(27, GPIO.HIGH)
            else:
                path = '/sys/bus/iio/devices/iio:device0/out_altvoltage0_frequency'
                GPIO.output(17, GPIO.HIGH)
                GPIO.output(27, GPIO.LOW)

            # Write the frequency value
            with open(path, 'w') as file:
                file.write(str(int(frequency_in_hz)))

            return {
                "status": "success",
                "message": f"RF output frequency {frequency} MHz generated"
            }
        except IOError as e:
            print(f"IOError while setting frequency: {str(e)}")
            return {
                "status": "error",
                "message": "Failed to write frequency: " + str(e)
            }
        except ValueError as e:
            print(f"ValueError: {str(e)}")
            return {
                "status": "error",
                "message": "Invalid frequency format: " + str(e)
            }
    else:
        return {
            "status": "error",
            "message": "No frequency data provided"
        }



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

@app.route('/save_config', methods=['POST'])
def save_config_route():
    config = request.get_json()
    save_config(config)
    return jsonify({'status': 'success', 'message': 'Configuration saved'})

@app.route('/load_config', methods=['GET'])
def load_config_route():
    config = load_config()
    return jsonify(config)


# Global variable to track powered down channels
powered_down_channels = []

@app.route('/set_filter_bias', methods=['POST'])
def set_filter_bias():
    try:
        # Get the JSON data sent by the frontend
        data = request.get_json()
        if not data:
            raise ValueError("No data received")

        filter_value = data.get('filter')
        bias_value = data.get('bias')
        frequency_type = data.get('frequencyType')
        output_frequency = data.get('outputFrequency')

        # Log received values for debugging
        print(f"Received filter: {filter_value}, bias: {bias_value}, frequency type: {frequency_type}, output frequency: {output_frequency}")

        # Validate the incoming data
        if not all([filter_value, bias_value, frequency_type, output_frequency]):
            raise ValueError("Missing required data (filter, bias, frequency type, or output frequency)")

        # Ensure proper types (you can customize these checks depending on your needs)
        filter_value = int(filter_value)
        bias_value = int(bias_value)
        output_frequency = float(output_frequency) * 10**6  # Convert MHz to Hz

        # Log validated and converted values
        print(f"Validated filter: {filter_value}, bias: {bias_value}, output frequency in Hz: {output_frequency}")

        # Apply tracking filter logic based on the output frequency
        if 8 * 10**9 <= output_frequency <= 16 * 10**9:
            print("Applying tracking filter ON for frequencies 8-16GHz")
            pll.reg_write(0x23, 0x0)  # Turn on tracking filter
        else:
            print("Applying tracking filter OFF for frequencies outside 8-16GHz")
            pll.reg_write(0x23, 0x2)  # Turn off tracking filter

        # Apply filter and bias values
        hex_value = get_hex_for_filter_bias(filter_value, bias_value)
        if hex_value is None:
            raise ValueError("Invalid filter or bias values")

        # Write the filter and bias settings to the appropriate register
        print(f"Writing filter/bias value {hex_value} to register 0x71")
        pll.reg_write(0x71, hex_value)  # Register write for filter/bias

        # Return success response
        return jsonify({'status': 'success', 'message': 'Filter and bias set successfully'})

    except Exception as e:
        # Catch any errors and print the stack trace for debugging
        print(f"Error in set_filter_bias: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500




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
    global powered_down_channels
    powered_down_channels = []  # Reset the list before clearing frequencies

    try:
        channels = [
            '/sys/bus/iio/devices/iio:device0/out_altvoltage0_powerdown',
            '/sys/bus/iio/devices/iio:device0/out_altvoltage1_powerdown',
            '/sys/bus/iio/devices/iio:device0/out_altvoltage2_powerdown',
            '/sys/bus/iio/devices/iio:device0/out_altvoltage3_powerdown'
        ]

        for channel in channels:
            with open(channel, 'w') as file:
                file.write('1')
            powered_down_channels.append(channel)  # Track the powered-down channel

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
        lock_status = GPIO.input(9)
        return jsonify(locked=(lock_status == GPIO.HIGH))
    except Exception as e:
        return jsonify(status='error', message=str(e))


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


if __name__ == '__main__':
    
    app.run(host='0.0.0.0', port=5000, debug=True)

