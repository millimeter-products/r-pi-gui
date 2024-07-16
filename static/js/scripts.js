let sweepInterval;
let lockCheckInterval;

window.onload = function() {
    toggleFrequencyInputs();
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
        const lockCircle = document.querySelector('.lock-green-circle');
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