from flask import Flask, render_template, request, jsonify
import json
import os
import RPi.GPIO as GPIO

app = Flask(__name__)

GPIO.setmode(GPIO.BCM)
GPIO.setup(9, GPIO.IN)

CONFIG_FILE = 'webapp_config.json'
DEFAULT_CONFIG = {
    'refFrequency': '',
    'doubler': False,
    'frequencyType': 'CW Frequency',
    'outputFrequency': '1000',
    'minFrequency': '4000',
    'maxFrequency': '7000',
    'stepSize': '100',
    'sweepTime': '1000',
    'filter': '0',
    'bias': '0',
    'chargePump': '350',
    'rfStatus': False
}

def save_config(config):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f)

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            config = json.load(f)
    else:
        config = DEFAULT_CONFIG.copy()

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

@app.route('/set_frequency', methods=['POST'])
def set_frequency():
    data = request.json
    output_frequency = data.get('outputFrequency')
    if output_frequency:
        try:
            frequency = int(output_frequency)
            frequency = frequency * 10**6
            print("-----------------")
            print(frequency)
            if frequency > 16 * 10**9 :
                print("Channel3")
                path = '/sys/bus/iio/devices/iio:device0/out_altvoltage3_frequency'
            elif frequency > 8 * 10**9:
                print("Channel2")
                path = '/sys/bus/iio/devices/iio:device0/out_altvoltage2_frequency'
            else:
                print("Channel0")
                path = '/sys/bus/iio/devices/iio:device0/out_altvoltage0_frequency'

            print("-----------------")

            with open(path, 'w') as file:
                print(frequency)
                file.write(str(frequency))
            return jsonify({"status": "success"})
        except IOError:
            return jsonify({"status": "error", "message": "Failed to write frequency"}), 500
    return jsonify({"status": "error", "message": "Invalid data"}), 400

@app.route('/clear_frequency', methods=['POST'])
def clear_frequency():
    try:
        channels = [
            '/sys/bus/iio/devices/iio:device0/out_altvoltage0_powerdown',
            '/sys/bus/iio/devices/iio:device0/out_altvoltage1_powerdown',
            '/sys/bus/iio/devices/iio:device0/out_altvoltage2_powerdown',
            '/sys/bus/iio/devices/iio:device0/out_altvoltage3_powerdown'
        ]

        for channel in channels:
            print(channel)
            with open(channel, 'w') as file:
                file.write('1')

        return jsonify(status='success', message='All RF channel frequencies turned OFF')
    except Exception as e:
        return jsonify(status='error', message=str(e))

@app.route('/check_lock_status', methods=['GET'])
def check_lock_status():
    try:
        lock_status = GPIO.input(9)
        return jsonify(locked=(lock_status == GPIO.HIGH))
    except Exception as e:
        return jsonify(status='error', message=str(e))

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
