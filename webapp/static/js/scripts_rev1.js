let sweepInterval;
let lockCheckInterval;

window.onload = function() {
    toggleFrequencyInputs();
    loadConfig();
}

function disableCWFrequencySection(disable) {
    const elements = document.querySelectorAll('#cwfreqdiv *');
    elements.forEach(element => element.disabled = disable);
}

function disableSweepFrequencySection(disable) {
    const elements = document.querySelectorAll('#sweepfreqdiv *');
    elements.forEach(element => element.disabled = disable);
}

function otherParamsSection(disable) {
    const elements = document.querySelectorAll('#otherparamsdiv *');
    elements.forEach(element => element.disabled = disable);
}

function toggleFrequencyInputs() {
    const frequencyType = document.getElementById('frequencyType').value;
    disableCWFrequencySection(frequencyType !== 'CW Frequency');
    disableSweepFrequencySection(frequencyType === 'CW Frequency');
}

function toggleRF(button) {
    const messagebox = document.getElementById('messagebox');
    const frequencyType = document.getElementById('frequencyType').value;

    if (!button) {
        disableCWFrequencySection(false);
        disableSweepFrequencySection(false);
        otherParamsSection(false);
        messagebox.textContent = "RF output frequency turned OFF!";
        if (sweepInterval) clearInterval(sweepInterval);
        if (lockCheckInterval) clearInterval(lockCheckInterval);
        clearOutputFrequency();
    } else {
        disableCWFrequencySection(true);
        disableSweepFrequencySection(true);
        otherParamsSection(true);

        if (frequencyType === 'Frequency Sweep') {
            startFrequencySweep();
        } else {
            const outputFrequency = document.getElementById('outputFrequency').value;
            setOutputFrequency(outputFrequency);
        }

        // Set the charge pump current only when RF is turned on
        const chargePumpCurrent = document.getElementById('chargePump').value;
        setChargePumpCurrent(chargePumpCurrent);

        checkLockStatus();
        lockCheckInterval = setInterval(checkLockStatus, 3000);
    }

    saveConfig();
}

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

function checkLockStatus() {
    fetch('/check_lock_status', {
        method: 'GET'
    })
    .then(response => response.json())
    .then(data => {
        const lockCircle = document.querySelector('.lock-circle');
        lockCircle.style.backgroundColor = data.locked ? '#4CAF50' : '#f44336'; // Green when locked, red when not
    })
    .catch(error => console.error('Error:', error));
}

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

function setChargePumpCurrent(current) {
    console.log('Setting charge pump current to:', current);
    fetch('/set_charge_pump_current', {
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
            applyChargePumpCurrent(data.hex_value);
        } else {
            messagebox.textContent = "Error: " + data.message;
        }
    })
    .catch(error => console.error('Error:', error));
}

function applyChargePumpCurrent(hexValue) {
    console.log('Applying charge pump current hex value:', hexValue);
    fetch('/apply_charge_pump_current', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ hexValue: hexValue })
    })
    .then(response => response.json())
    .then(data => {
        const messagebox = document.getElementById('messagebox');
        messagebox.textContent = data.status === 'success' ? "Charge pump current applied successfully." : "Error: " + data.message;
    })
    .catch(error => console.error('Error:', error));
}

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

function saveConfig() {
    const config = {
        refFrequency: document.getElementById('refFrequency').value,
        doubler: document.getElementById('doubler').checked,
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
        document.getElementById('doubler').checked = config.doubler || false;
        document.getElementById('frequencyType').value = config.frequencyType || 'CW Frequency';
        document.getElementById('outputFrequency').value = config.outputFrequency || '1000';
        document.getElementById('minFrequency').value = config.minFrequency || '4000';
        document.getElementById('maxFrequency').value = config.maxFrequency || '7000';
        document.getElementById('stepSize').value = config.stepSize || '100';
        document.getElementById('sweepTime').value = config.sweepTime || '1000';
        document.getElementById('filter').value = config.filter || '0';
        document.getElementById('bias').value = config.bias || '0';
        document.getElementById('chargePump').value = config.chargePump || '0.35'; // Default to lowest value
        document.getElementById('toggle').checked = config.rfStatus || false;  // Load RF status
        toggleFrequencyInputs();
        // Call toggleRF if rfStatus is true
        if (config.rfStatus) {
            toggleRF(true);
        }
    })
    .catch(error => console.error('Error:', error));
}
