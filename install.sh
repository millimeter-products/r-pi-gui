#!/bin/bash -e

# Variables
VENV_PATH="${HOME}/MiWaveRFSynthensizer/venv"
APP_PATH="${HOME}/MiWaveRFSynthensizer/webapp"
SERVICE_NAME="miwave-rpi-synthesizer"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"
USERNAME="root"
GROUPNAME="root"

# Create systemd service file
do_create_systemd_service_file()
{
echo "Creating systemd service file..."
sudo bash -c "cat <<EOF > $SERVICE_FILE
[Unit]
Description=\"To start MiWave's RPI synthesizer Flask web Application\"
After=network.target

[Service]
User=$USERNAME
Group=$GROUPNAME
WorkingDirectory=$APP_PATH
Environment=\"PATH=$VENV_PATH/bin\"
ExecStart=$VENV_PATH/bin/python $APP_PATH/app.py
Restart=always

[Install]
WantedBy=multi-user.target
EOF"
}

# setup the python3 virtualenv
do_install_virtualenv()
{
	# Create and activate virtual environment
	echo "Creating virtual environment..."
	python3 -m venv $VENV_PATH
	source $VENV_PATH/bin/activate
	
	# Install Flask
	echo "Installing Flask..."
	pip install flask
	pip install RPi.GPIO
	
	# create systemd service file
	do_create_systemd_service_file

	# Reload systemd daemon
	echo "Reloading systemd daemon..."
	sudo systemctl daemon-reload

	# Enable the Flask app service
	echo "Enabling Flask app service..."
	sudo systemctl enable $SERVICE_NAME.service

	# Start the Flask app service
	echo "Starting Flask app service..."
	sudo systemctl start $SERVICE_NAME.service

	# Check the status of the service
	echo "Checking Flask app service status..."
	sudo systemctl status $SERVICE_NAME.service

	# Deactivate virtual environment
	deactivate
}

# Start of the script
sudo apt update
sudo apt upgrade

if [ -d "${HOME}/MiWaveRFSynthensizer" ]
then
	echo "Removing existing installtion..."
	sudo rm -rf "${HOME}/MiWaveRFSynthensizer"
fi

mkdir "${HOME}/MiWaveRFSynthensizer"

if [ -d ./webapp ]
then
	cp -r ./webapp ${HOME}/MiWaveRFSynthensizer/
else
	echo "Failed to install MiWave's synthensizer application!!!"
	exit -1
fi

do_install_virtualenv
