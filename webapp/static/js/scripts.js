let sweepInterval;
let lockCheckInterval;

window.onload = function() {
    toggleFrequencyInputs();
    loadConfig();
}

function disableCWFrequencySection(disable) {
    var div = document.getElementById('cwfreqdiv');
    var elements = div.querySelectorAll('*');
    elements.forEach(function(element) {
        element.disabled = disable;
    });
}

function disableSweepFrequencySection(disable) {
    var div = document.getElementById('sweepfreqdiv');
    var elements = div.querySelectorAll('*');
    elements.forEach(function(element) {
        element.disabled = disable;
    });
}

function otherParamsSection(disable) {
    var div = document.getElementById('otherparamsdiv');
    var elements = div.querySelectorAll('*');
    elements.forEach(function(element) {
        element.disabled = disable;
    });
}

function toggleFrequencyInputs() {
    const frequencyType = document.getElementById('frequencyType').value;

    if (frequencyType === 'CW Frequency') {
        disableCWFrequencySection(false);
        disableSweepFrequencySection(true);
    } else {
        disableCWFrequencySection(true);
        disableSweepFrequencySection(false);
    }
}

function disableInputParamsElements(disable) {
    const inputs = document.querySelectorAll('.input-section input, .input-section select');
    inputs.forEach(input => {
        input.disabled = disable;
    });
}

function toggleRF(button) {
    const messagebox = document.getElementById('messagebox');
    const frequencyType = document.getElementById('frequencyType').value;

    if (!button) {
        disableCWFrequencySection(false);
        disableSweepFrequencySection(false);
        otherParamsSection(false);
        messagebox.textContent = "RF output frequency turned OFF!";
        if (sweepInterval) {
            clearInterval(sweepInterval);
        }
        if (lockCheckInterval) {
            clearInterval(lockCheckInterval);
        }
        clearOutputFrequency();
    } else {
        disableCWFrequencySection(true);
        disableSweepFrequencySection(true);
        otherParamsSection(true);

        if (frequencyType == 'Frequency Sweep') {
            startFrequencySweep();
        } else {
            const outputFrequency = document.getElementById('outputFrequency').value;
            setOutputFrequency(outputFrequency);
        }

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
        if (data.status === 'success') {
            messagebox.textContent = "RF output frequency cleared.";
        } else {
            messagebox.textContent = "Error: " + data.message;
        }
    })
    .catch(error => {
        console.error('Error:', error);
    });
}

function checkLockStatus() {
    fetch('/check_lock_status', {
        method: 'GET'
    })
    .then(response => response.json())
    .then(data => {
        const lockCircle = document.querySelector('.lock-circle');
        if (data.locked) {
            lockCircle.style.backgroundColor = '#4CAF50'; // Green when locked
        } else {
            lockCircle.style.backgroundColor = '#f44336'; // Red when not locked
        }
    })
    .catch(error => {
        console.error('Error:', error);
    });
}

function startFrequencySweep() {
    const minFrequency = parseInt(document.getElementById('minFrequency').value);
    const maxFrequency = parseInt(document.getElementById('maxFrequency').value);
    const stepSize = parseInt(document.getElementById('stepSize').value);
    const sweepTime = parseInt(document.getElementById('sweepTime').value);
    const messagebox = document.getElementById('messagebox');
    let currentFrequency = minFrequency;

    messagebox.textContent = "RF output frequency " + currentFrequency + " MHz generated...";

    sweepInterval = setInterval(() => {
        currentFrequency += stepSize;
        if (currentFrequency > maxFrequency) {
            currentFrequency = minFrequency;
        }
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
        if (data.status === 'success') {
            messagebox.textContent = "RF output frequency " + frequency + " MHz generated...";
        } else {
            messagebox.textContent = "Error: " + data.message;
        }
    })
    .catch(error => {
        console.error('Error:', error);
    });
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
        chargePump: document.getElementById('chargePump').value,
        rfStatus: document.getElementById('toggle').checked  // Save RF status
    };

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
        if (data.status === 'success') {
            messagebox.textContent = "Configuration saved.";
        } else {
            messagebox.textContent = "Error: " + data.message;
        }
    })
    .catch(error => {
        console.error('Error:', error);
    });
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
        document.getElementById('chargePump').value = config.chargePump || '350';
        document.getElementById('toggle').checked = config.rfStatus || false;  // Load RF status
        toggleFrequencyInputs();
    })
    .catch(error => {
        console.error('Error:', error);
    });
}
