let sweepInterval;
let lockCheckInterval;
let hopInterval;

window.onload = function() {
    toggleFrequencyInputs();
    loadConfig();
    fetchTemperature(); // Fetch the temperature on page load
    setInterval(fetchTemperature, 5000); // Fetch temperature every 5 seconds
}

// Function to disable/enable CW Frequency input section
function disableCWFrequencySection(disable) {
    const elements = document.querySelectorAll('#cwfreqdiv *');
    elements.forEach(element => element.disabled = disable);
}

// Function to disable/enable Sweep Frequency input section
function disableSweepFrequencySection(disable) {
    const elements = document.querySelectorAll('#sweepfreqdiv *');
    elements.forEach(element => element.disabled = disable);
}

// Function to disable/enable Frequency Hop input section
function disableHopFrequencySection(disable) {
    const elements = document.querySelectorAll('#hopfreqdiv *');
    elements.forEach(element => element.disabled = disable);
}

// Function to disable/enable other parameters input section
function otherParamsSection(disable) {
    const elements = document.querySelectorAll('#otherparamsdiv *');
    elements.forEach(element => element.disabled = disable);
}

// Toggle between CW Frequency and Frequency Sweep sections
function toggleFrequencyInputs() {
    const frequencyType = document.getElementById('frequencyType').value;

    // Hide all sections and labels by default
    document.getElementById('cwfreqdiv').style.display = 'none';
    document.getElementById('sweepfreqdiv').style.display = 'none';
    document.getElementById('hopfreqdiv').style.display = 'none';
    
    // Hide all labels by default
    document.querySelector('label[for="message"][text="CW Frequency"]').style.display = 'none';
    document.querySelector('label[for="message"][text="Frequency Sweep"]').style.display = 'none';
    document.querySelector('label[for="message"][text="Frequency Hop"]').style.display = 'none';

    // Show the relevant section and label based on the selected frequency type
    if (frequencyType === 'CW Frequency') {
        document.getElementById('cwfreqdiv').style.display = 'block';
        document.querySelector('label[for="message"][text="CW Frequency"]').style.display = 'block';
    } else if (frequencyType === 'Frequency Sweep') {
        document.getElementById('sweepfreqdiv').style.display = 'block';
        document.querySelector('label[for="message"][text="Frequency Sweep"]').style.display = 'block';
    } else if (frequencyType === 'Frequency Hop') {
        document.getElementById('hopfreqdiv').style.display = 'block';
        document.querySelector('label[for="message"][text="Frequency Hop"]').style.display = 'block';
    }
}

// Toggle RF on or off
function toggleRF(button) {
    const messagebox = document.getElementById('messagebox');
    const frequencyType = document.getElementById('frequencyType').value;
    const dropdown = document.getElementById('frequencyType');  // Get the dropdown element
    const chargePumpField = document.getElementById('chargePump');  // Get charge pump field

    if (!button) {
        disableCWFrequencySection(false);
        disableSweepFrequencySection(false);
        disableHopFrequencySection(false);
        otherParamsSection(false);
        messagebox.textContent = "RF output frequency turned OFF!";
        dropdown.disabled = false; // Enable dropdown when RF is OFF
        if (sweepInterval) clearInterval(sweepInterval);
        if (hopInterval) clearInterval(hopInterval);
        if (lockCheckInterval) clearInterval(lockCheckInterval);
        clearOutputFrequency();
    } else {
        disableCWFrequencySection(true);
        disableSweepFrequencySection(true);
        disableHopFrequencySection(true);
        otherParamsSection(true);
        dropdown.disabled = true;  // Disable dropdown when RF is ON

        // Set filter and bias values before enabling RF
        const filterValue = document.getElementById('filter').value;
        const biasValue = document.getElementById('bias').value;
        setFilterBias(filterValue, biasValue)
            .then(() => {
                // Set the charge pump current immediately before enabling RF
                const chargePumpCurrent = document.getElementById('chargePump').value;
                return setChargePumpCurrent(chargePumpCurrent);
            })
            .then(() => {
                if (frequencyType === 'Frequency Sweep') {
                    startFrequencySweep();
                } else if (frequencyType === 'Frequency Hop') {
                    startFrequencyHop();
                } else {
                    const outputFrequency = document.getElementById('outputFrequency').value;
                    setOutputFrequency(outputFrequency);
                }

                checkLockStatus();
                lockCheckInterval = setInterval(checkLockStatus, 3000);
            });
    }

    saveConfig();
}

// Clear output frequency on RF turn off
function clearOutputFrequency() {
    fetch('/clear_frequency', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        const messagebox = document.getElementById('messagebox');
        messagebox.textContent = data.status === 'success' ? "RF output frequency cleared." : "Error: " + data.message;
    })
    .catch(error => console.error('Error:', error));
}

// Check lock status periodically
function checkLockStatus() {
    fetch('/check_lock_status', {
        method: 'GET'
    })
    .then(response => response.json())
    .then(data => {
        const lockCircle = document.querySelector('.lock-circle');
        lockCircle.style.backgroundColor = data.locked ? '#00ff00' : '#f44336'; // Green when locked, red when not
    })
    .catch(error => console.error('Error:', error));
}


// Start frequency sweep
function startFrequencySweep() {
    const minFrequency = parseInt(document.getElementById('minFrequency').value);
    const maxFrequency = parseInt(document.getElementById('maxFrequency').value);
    const stepSize = parseInt(document.getElementById('stepSize').value);
    const sweepTime = parseInt(document.getElementById('sweepTime').value);
    const messagebox = document.getElementById('messagebox');
    let currentFrequency = minFrequency;

    messagebox.textContent = `RF output frequency ${currentFrequency} MHz generated...`;

    sweepInterval = setInterval(() => {
        currentFrequency += stepSize;
        if (currentFrequency > maxFrequency) currentFrequency = minFrequency;
        setOutputFrequency(currentFrequency);
    }, sweepTime);
}

// Start frequency hopping
function startFrequencyHop() {
    const frequencies = [];
    const dwellTimes = [];

    for (let i = 1; i <= 10; i++) {
        const frequency = parseInt(document.getElementById(`freq${i}`).value);
        const dwellHr = parseInt(document.getElementById(`dwell_hr${i}`).value) || 0;
        const dwellMin = parseInt(document.getElementById(`dwell_min${i}`).value) || 0;
        const dwellSec = parseInt(document.getElementById(`dwell_sec${i}`).value) || 0;
        const dwellTime = (dwellHr * 3600 + dwellMin * 60 + dwellSec) * 1000; // Convert to milliseconds

        if (!isNaN(frequency) && dwellTime > 0) {
            frequencies.push(frequency);
            dwellTimes.push(dwellTime);
        }
    }

    let currentIndex = 0;
    const messagebox = document.getElementById('messagebox');

    hopInterval = setInterval(() => {
        const frequency = frequencies[currentIndex];
        const dwellTime = dwellTimes[currentIndex];

        messagebox.textContent = `RF output frequency ${frequency} MHz for ${dwellTime / 1000} seconds...`;
        setOutputFrequency(frequency);

        currentIndex = (currentIndex + 1) % frequencies.length;
    }, dwellTimes[currentIndex]);
}

// Set output frequency
function setOutputFrequency(frequency) {
    console.log('Setting output frequency to:', frequency);
    fetch('/set_frequency', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ outputFrequency: frequency })
    })
    .then(response => response.json())
    .then(data => {
        const messagebox = document.getElementById('messagebox');
        messagebox.textContent = data.status === 'success' ? `RF output frequency ${frequency} MHz generated...` : "Error: " + data.message;
    })
    .catch(error => console.error('Error:', error));
}

// Set filter and bias values
function setFilterBias(filter, bias) {
    return fetch('/set_filter_bias', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ filter: filter, bias: bias, frequencyType: document.getElementById('frequencyType').value, outputFrequency: document.getElementById('outputFrequency').value })
    })
    .then(response => response.json())
    .then(data => {
        const messagebox = document.getElementById('messagebox');
        if (data.status === 'success') {
            console.log('Filter set to:', filter, 'Bias set to:', bias);
        } else {
            messagebox.textContent = "Error: " + data.message;
        }
    })
    .catch(error => console.error('Error:', error));
}

// Set charge pump current
function setChargePumpCurrent(current) {
    return fetch('/set_charge_pump_current', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ chargePump: current })
    })
    .then(response => response.json())
    .then(data => {
        const messagebox = document.getElementById('messagebox');
        if (data.status === 'success') {
            console.log('Charge pump current set to hex value:', data.hex_value);
        } else {
            messagebox.textContent = "Error: " + data.message;
        }
    })
    .catch(error => console.error('Error:', error));
}

// Function to fetch and display temperature from DS18B20
function fetchTemperature() {
    fetch('/temperature', {
        method: 'GET'
    })
    .then(response => response.json())
    .then(data => {
        const temperatureElement = document.getElementById('temperature');
        if (data.temperature) {
            temperatureElement.textContent = `${data.temperature} `;
        } else {
            temperatureElement.textContent = 'Error fetching temperature';
        }
    })
    .catch(error => console.error('Error fetching temperature:', error));
}

// Add event listeners
document.addEventListener('DOMContentLoaded', function () {
    const toggleCheckbox = document.getElementById('toggle');

    toggleCheckbox.addEventListener('click', function () {
        if (toggleCheckbox.checked) {
            console.log('RF ON');
            toggleRF(true);
        } else {
            console.log('RF OFF');
            toggleRF(false);
        }
    });

    document.getElementById('applyButton').addEventListener('click', function() {
        applyConfig();
    });
});

// Save configuration settings
function saveConfig() {
    const config = {
        refFrequency: document.getElementById('refFrequency').value,
        frequencyType: document.getElementById('frequencyType').value,
        outputFrequency: document.getElementById('outputFrequency').value,
        minFrequency: document.getElementById('minFrequency').value,
        maxFrequency: document.getElementById('maxFrequency').value,
        stepSize: document.getElementById('stepSize').value,
        sweepTime: document.getElementById('sweepTime').value,
        filter: document.getElementById('filter').value,
        bias: document.getElementById('bias').value,
        chargePump: parseFloat(document.getElementById('chargePump').value),
        rfStatus: document.getElementById('toggle').checked  // Save RF status
    };

    console.log("Saving configuration with Charge Pump value:", config.chargePump);

    fetch('/save_config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
    })
    .then(response => response.json())
    .then(data => {
        const messagebox = document.getElementById('messagebox');
        messagebox.textContent = data.status === 'success' ? "Configuration saved." : "Error: " + data.message;
    })
    .catch(error => console.error('Error:', error));
}

// Apply configuration to the hardware
function applyConfig() {
    fetch('/apply_config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        const messagebox = document.getElementById('messagebox');
        messagebox.textContent = data.status === 'success' ? "Configuration applied to hardware." : "Error: " + data.message;
    })
    .catch(error => console.error('Error:', error));
}

// Load configuration on page load
function loadConfig() {
    fetch('/load_config', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(config => {
        document.getElementById('refFrequency').value = config.refFrequency || '';
        document.getElementById('frequencyType').value = config.frequencyType || 'CW Frequency';
        document.getElementById('outputFrequency').value = config.outputFrequency || '1000';
        document.getElementById('minFrequency').value = config.minFrequency || '4000';
        document.getElementById('maxFrequency').value = config.maxFrequency || '7000';
        document.getElementById('stepSize').value = config.stepSize || '100';
        document.getElementById('sweepTime').value = config.sweepTime || '1000';
        document.getElementById('filter').value = config.filter || '0';
        document.getElementById('bias').value = config.bias || '0';
        document.getElementById('chargePump').value = '1.75'; // Default to lowest value
        document.getElementById('toggle').checked = config.rfStatus || false;  // Load RF status
        toggleFrequencyInputs();
        // Call toggleRF if rfStatus is true
        if (config.rfStatus) {
            toggleRF(true);
        }
    })
    .catch(error => console.error('Error:', error));
}