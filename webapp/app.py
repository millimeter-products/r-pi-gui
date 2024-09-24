from flask import Flask, render_template, request, jsonify
import json
import os
import RPi.GPIO as GPIO
import adi
from w1thermsensor import W1ThermSensor

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
        data = request.get_json()
        filter_value = int(data.get('filter'))
        bias_value = int(data.get('bias'))
        frequency_type = data.get('frequencyType')
        output_frequency = int(data.get('outputFrequency')) * 10**6

        if frequency_type == 'CW Frequency':
            # Apply tracking filter logic
            if 8 * 10**9 <= output_frequency <= 16 * 10**9:
                pll.reg_write(0x23, 0x0)
            else:
                pll.reg_write(0x23, 0x2)

            # Apply filter and bias values
            hex_value = get_hex_for_filter_bias(filter_value, bias_value)
            if hex_value is not None:
                pll.reg_write(0x71, hex_value)
            else:
                return jsonify({'status': 'error', 'message': 'Invalid filter or bias value'}), 400

        return jsonify({'status': 'success', 'message': 'Filter and bias set successfully'})
    except Exception as e:
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
def set_frequency():
    # Ensure that channels are powered back on
    global powered_down_channels
    try:
        for channel in powered_down_channels:
            with open(channel, 'w') as file:
                file.write('0')  # Power up the channel

        # Rest of the code for setting the frequency remains the same
        data = request.json
        output_frequency = data.get('outputFrequency')
        if output_frequency:
            try:
                frequency = int(output_frequency)
                frequency = frequency * 10**6
                print("-----------------")
                print(frequency)
                if frequency > 16 * 10**9:
                    print("Channel3")
                    path = '/sys/bus/iio/devices/iio:device0/out_altvoltage3_frequency'
                    GPIO.output(17, GPIO.LOW)  # Pin 11 low
                    GPIO.output(27, GPIO.LOW)  # Pin 13 low
                elif frequency > 8 * 10**9:
                    print("Channel2")
                    path = '/sys/bus/iio/devices/iio:device0/out_altvoltage2_frequency'
                    GPIO.output(17, GPIO.LOW)   # Pin 11 low
                    GPIO.output(27, GPIO.HIGH)  # Pin 13 high
                else:
                    print("Channel0")
                    path = '/sys/bus/iio/devices/iio:device0/out_altvoltage0_frequency'
                    GPIO.output(17, GPIO.HIGH)  # Pin 11 high
                    GPIO.output(27, GPIO.LOW)   # Pin 13 low


                print("-----------------")

                with open(path, 'w') as file:
                    print(frequency)
                    file.write(str(frequency))
                return jsonify({"status": "success"})
            except IOError:
                return jsonify({"status": "error", "message": "Failed to write frequency"}), 500
        return jsonify({"status": "error", "message": "Invalid data"}), 400
    except IOError as e:
        return jsonify({"status": "error", "message": str(e)}), 500

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


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
