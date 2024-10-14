let sweepInterval;
let lockCheckInterval;
let hopInterval;
let extTriggerActive = false;
let extFrequencies = [];
let extIndex = 0

window.onload = function() {
    toggleFrequencyInputs();
    loadConfig();
    fetchTemperature(); // Fetch the temperature on page load
    setInterval(fetchTemperature, 5000); // Fetch temperature every 5 seconds
     setInterval(checkServerStatus, 3000); // Check server status every 3 seconds
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

// Hide RF ON/OFF button in external trigger mode
function hideRFButton(hide) {
    const rfToggle = document.querySelector('.rf-toggle-container');
    if (rfToggle) {
        rfToggle.style.display = hide ? 'none' : 'flex'; // Hide or show RF toggle
    }
}



// Toggle between CW Frequency and Frequency Sweep sections
function toggleFrequencyInputs() {
    const frequencyType = document.getElementById('frequencyType').value;

    // Hide all sections and labels by default
    document.getElementById('cwfreqdiv').style.display = 'none';
    document.getElementById('sweepfreqdiv').style.display = 'none';
    document.getElementById('hopfreqdiv').style.display = 'none';
    document.getElementById('externalTriggerDiv').style.display = 'none';
    
    const rfToggle = document.getElementById('rfToggleContainer');
    if (rfToggle) {
        rfToggle.style.display = 'block';  // Show RF ON/OFF by default
    }
    
    // Hide all labels by default
    document.querySelector('label[for="message"][text="CW Frequency"]').style.display = 'none';
    document.querySelector('label[for="message"][text="Frequency Sweep"]').style.display = 'none';
    document.querySelector('label[for="message"][text="Frequency Hop"]').style.display = 'none';
    document.querySelector('label[for="message"][text="External Trigger Mode"]').style.display = 'none';

    // Show the relevant section and label based on the selected frequency type
    if (frequencyType === 'CW Frequency') {
        document.getElementById('cwfreqdiv').style.display = 'block';
    } else if (frequencyType === 'Frequency Sweep') {
        document.getElementById('sweepfreqdiv').style.display = 'block';
    } else if (frequencyType === 'Frequency Hop') {
        document.getElementById('hopfreqdiv').style.display = 'block';
    } else if (frequencyType === 'External Trigger Mode') {
        document.getElementById('externalTriggerDiv').style.display = 'block';
        document.getElementById('toggle').style.display = 'none';  // Hide RF ON/OFF for this mode
        if (rfToggle) {
            rfToggle.style.display = 'none';  // Hide RF ON/OFF for this mode
        }
        document.querySelector('label[for="message"][text="External Trigger Mode"]').style.display = 'block';
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


// Start external trigger mode
document.getElementById('startExternalTrigger').addEventListener('click', function() {
    extFrequencies = [];

    // Gather frequencies from input fields
    for (let i = 1; i <= 30; i++) {
        const freq = parseFloat(document.getElementById(`extFreq${i}`).value);
        if (!isNaN(freq) && freq >= 62 && freq <= 32000) {
            extFrequencies.push(freq);
        }
    }

    if (extFrequencies.length === 0) {
        alert("Please enter valid frequencies.");
        return;
    }

    extTriggerActive = true;
    extIndex = 0;

    // Disable all inputs
    disableExternalTriggerInputs(true);

    // Set filter, bias, and charge pump before starting
    const filterValue = document.getElementById('filter').value;
    const biasValue = document.getElementById('bias').value;
    const chargePumpCurrent = document.getElementById('chargePump').value;

    console.log("External Trigger Mode: Setting Filter: " + filterValue + ", Bias: " + biasValue);
    console.log("External Trigger Mode: Setting Charge Pump: " + chargePumpCurrent);

    // Set filter and bias, then charge pump current
    setFilterBias(filterValue, biasValue, 'External Trigger Mode')  // Pass 'External Trigger Mode'
        .then(() => setChargePumpCurrent(chargePumpCurrent))
        .then(() => {
            document.getElementById('messagebox').textContent = "Waiting for external trigger...";

            // Call the backend to start listening for GPIO triggers
            fetch('/start_external_trigger', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ frequencies: extFrequencies })
            })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    document.getElementById('messagebox').textContent = "External trigger mode started. Waiting for trigger...";
                    
                    // Check lock status
                    checkLockStatus();
                    lockCheckInterval = setInterval(checkLockStatus, 3000);  // Start lock status checking
                } else {
                    document.getElementById('messagebox').textContent = "Error: " + data.message;
                    disableExternalTriggerInputs(false);
                }
            })
            .catch(error => {
                console.error('Error starting external trigger:', error);
                disableExternalTriggerInputs(false);
                document.getElementById('messagebox').textContent = "Error starting external trigger.";
            });
        })
        .catch(error => {
            console.error('Error setting filter, bias, or charge pump:', error);
            disableExternalTriggerInputs(false);
            document.getElementById('messagebox').textContent = "Error setting parameters.";
        });
});

// Stop external trigger mode
document.getElementById('stopExternalTrigger').addEventListener('click', function() {
    extTriggerActive = false;

    // Call the backend to stop listening for GPIO triggers
    fetch('/stop_external_trigger', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            // Clear frequency after stopping the trigger mode
            fetch('/clear_frequency', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            })
            .then(response => response.json())
            .then(clearData => {
                document.getElementById('messagebox').textContent = clearData.message;
                disableExternalTriggerInputs(false); // Re-enable inputs after stopping
            })
            .catch(error => {
                console.error('Error clearing frequency:', error);
                document.getElementById('messagebox').textContent = "Error clearing frequency.";
                disableExternalTriggerInputs(false); // Re-enable inputs after failure
            });
        } else {
            document.getElementById('messagebox').textContent = "Error: " + data.message;
            disableExternalTriggerInputs(false); // Re-enable inputs if an error occurs
        }
    })
    .catch(error => {
        console.error('Error stopping external trigger:', error);
        document.getElementById('messagebox').textContent = "Error stopping external trigger.";
        disableExternalTriggerInputs(false); // Re-enable inputs if an error occurs
    });
});



// Function to disable/enable inputs during external trigger mode
function disableExternalTriggerInputs(disable) {
    document.getElementById('frequencyType').disabled = disable;
    for (let i = 1; i <= 30; i++) {
        document.getElementById(`extFreq${i}`).disabled = disable;
    }
    document.getElementById('filter').disabled = disable;
    document.getElementById('bias').disabled = disable;
    document.getElementById('chargePump').disabled = disable;
}





// Save frequencies and dwell times
document.getElementById('saveFrequencies').addEventListener('click', function() {
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

    // Save to localStorage
    localStorage.setItem('savedFrequencies', JSON.stringify(frequencies));
    localStorage.setItem('savedDwellTimes', JSON.stringify(dwellTimes));

    // Display message
    const messagebox = document.getElementById('messagebox');
    messagebox.textContent = "Frequencies and Dwell Time saved.";
});

// Clear frequencies and dwell times
document.getElementById('clearFrequencies').addEventListener('click', function() {
    localStorage.removeItem('savedFrequencies');
    localStorage.removeItem('savedDwellTimes');

    // Clear input fields
    for (let i = 1; i <= 10; i++) {
        document.getElementById(`freq${i}`).value = '';
        document.getElementById(`dwell_hr${i}`).value = '';
        document.getElementById(`dwell_min${i}`).value = '';
        document.getElementById(`dwell_sec${i}`).value = '';
    }

    // Display message
    const messagebox = document.getElementById('messagebox');
    messagebox.textContent = "Frequencies and Dwell Time cleared.";
});


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
    const minFrequency = parseFloat(document.getElementById('minFrequency').value);
    const maxFrequency = parseFloat(document.getElementById('maxFrequency').value);
    const stepSize = parseFloat(document.getElementById('stepSize').value);
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
        const frequency = parseFloat(document.getElementById(`freq${i}`).value);
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
    .then(response => {
        // Check if the server responded with a success status
        if (!response.ok) {
            return response.text().then(text => {
                throw new Error(`Server responded with error: ${text}`);
            });
        }
        return response.json();
    })
    .then(data => {
        const messagebox = document.getElementById('messagebox');
        if (data.status === 'success') {
            messagebox.textContent = data.message;
        } else {
            messagebox.textContent = "Error: " + data.message;
        }
    })
    .catch(error => {
        console.error('Error:', error);
        const messagebox = document.getElementById('messagebox');
        messagebox.textContent = "Error communicating with the server: " + error.message;
    });
}



// Function to set filter and bias values
function setFilterBias(filter, bias) {
    const frequencyType = document.getElementById('frequencyType').value;
    const outputFrequency = document.getElementById('outputFrequency').value;

    // Add console logs to check the data being passed
    console.log('Sending filter:', filter, 'bias:', bias, 'frequencyType:', frequencyType, 'outputFrequency:', outputFrequency);

    // Check if any value is missing and log it
    if (!filter || !bias || !frequencyType || !outputFrequency) {
        console.error("Missing required data (filter, bias, frequency type, or output frequency).");
        return Promise.reject("Missing required data (filter, bias, frequency type, or output frequency).");
    }

    return fetch('/set_filter_bias', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            filter: filter,
            bias: bias,
            frequencyType: frequencyType,
            outputFrequency: outputFrequency
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            console.log('Filter and bias set successfully');
        } else {
            console.error("Error setting filter and bias:", data.message);
        }
    })
    .catch(error => {
        console.error('Error:', error);
    });
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
document.addEventListener('DOMContentLoaded', function() {
    const toggleCheckbox = document.getElementById('toggle');
    if (toggleCheckbox) {
        toggleCheckbox.addEventListener('click', function() {
            if (toggleCheckbox.checked) {
                console.log('RF ON');
                toggleRF(true);
            } else {
                console.log('RF OFF');
                toggleRF(false);
            }
        });
    }

    const applyButton = document.getElementById('applyButton');
    if (applyButton) {
        applyButton.addEventListener('click', function() {
            applyConfig();
        });
    }
});



// Save configuration settings
function saveConfig() {
    const frequencies = [];
    const dwellTimes = [];
    const extFrequencies = [];

    // Gather hop frequencies and dwell times from the input fields
    for (let i = 1; i <= 10; i++) {
        const frequency = parseFloat(document.getElementById(`freq${i}`).value);  // Use parseFloat for 1Hz resolution
        const dwellHr = parseInt(document.getElementById(`dwell_hr${i}`).value) || 0;
        const dwellMin = parseInt(document.getElementById(`dwell_min${i}`).value) || 0;
        const dwellSec = parseInt(document.getElementById(`dwell_sec${i}`).value) || 0;
        const dwellTime = (dwellHr * 3600 + dwellMin * 60 + dwellSec) * 1000; // Convert to milliseconds

        if (!isNaN(frequency) && dwellTime > 0) {
            frequencies.push(frequency);
            dwellTimes.push(dwellTime);
        }
    }


    // Gather external hop frequencies from input fields
    for (let i = 1; i <= 30; i++) {
        const extFreq = parseFloat(document.getElementById(`extFreq${i}`).value);
        if (!isNaN(extFreq) && extFreq >= 62 && extFreq <= 32000) {
            extFrequencies.push(extFreq);
        }
    }


    const config = {
        refFrequency: parseFloat(document.getElementById('refFrequency').value),  // Use parseFloat for 1Hz resolution
        frequencyType: document.getElementById('frequencyType').value,
        outputFrequency: parseFloat(document.getElementById('outputFrequency').value),  // Use parseFloat
        minFrequency: parseFloat(document.getElementById('minFrequency').value),  // Use parseFloat
        maxFrequency: parseFloat(document.getElementById('maxFrequency').value),  // Use parseFloat
        stepSize: parseFloat(document.getElementById('stepSize').value),  // Use parseFloat
        sweepTime: parseInt(document.getElementById('sweepTime').value),
        filter: document.getElementById('filter').value,
        bias: document.getElementById('bias').value,
        chargePump: parseFloat(document.getElementById('chargePump').value),
        rfStatus: document.getElementById('toggle').checked,  // Save RF status
        hopFrequencies: frequencies,  // Save hop frequencies
        dwellTimes: dwellTimes,  // Save dwell times
        externalHopFrequencies: extFrequencies  // Save external hop frequencies
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
        document.getElementById('refFrequency').value = parseFloat(config.refFrequency) || '';
        document.getElementById('frequencyType').value = config.frequencyType || 'CW Frequency';
        document.getElementById('outputFrequency').value = parseFloat(config.outputFrequency) || '1000';
        document.getElementById('minFrequency').value = parseFloat(config.minFrequency) || '4000';
        document.getElementById('maxFrequency').value = parseFloat(config.maxFrequency) || '7000';
        document.getElementById('stepSize').value = parseFloat(config.stepSize) || '100';
        document.getElementById('sweepTime').value = config.sweepTime || '1000';
        document.getElementById('filter').value = config.filter || '0';
        document.getElementById('bias').value = config.bias || '0';
        document.getElementById('chargePump').value = parseFloat(config.chargePump) || '1.75';  // Default to lowest value
        document.getElementById('toggle').checked = config.rfStatus || false;  // Load RF status

        // Load hop frequencies and dwell times into input fields
        if (config.hopFrequencies && config.dwellTimes) {
            config.hopFrequencies.forEach((frequency, index) => {
                if (index < 10) {
                    document.getElementById(`freq${index + 1}`).value = parseFloat(frequency);
                    const dwellTime = config.dwellTimes[index] || 0;
                    const totalSeconds = Math.floor(dwellTime / 1000);
                    document.getElementById(`dwell_hr${index + 1}`).value = Math.floor(totalSeconds / 3600);
                    document.getElementById(`dwell_min${index + 1}`).value = Math.floor((totalSeconds % 3600) / 60);
                    document.getElementById(`dwell_sec${index + 1}`).value = totalSeconds % 60;
                }
            });
        }
    
        // Load external hop frequencies into input fields
        if (config.externalHopFrequencies) {
            config.externalHopFrequencies.forEach((frequency, index) => {
                if (index < 30) {
                    document.getElementById(`extFreq${index + 1}`).value = parseFloat(frequency);
                }
            });
        }


        toggleFrequencyInputs();

        // Call toggleRF if rfStatus is true
        if (config.rfStatus) {
            toggleRF(true);
        }
    })
    .catch(error => console.error('Error:', error));
}

// Function to check if the server is reachable
function checkServerStatus() {
    fetch('/heartbeat', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        // If the response is not ok, refresh the page
        if (!response.ok) {
            console.warn('Server unreachable, refreshing the page...');
            location.reload(); // Refresh the page if the server is not responding
        }
    })
    .catch(error => {
        console.error('Error connecting to server:', error);
        // Refresh the page if there is an error connecting
        location.reload();
    });
}



