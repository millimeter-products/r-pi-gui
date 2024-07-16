let sweepInterval;
let lockCheckInterval;

function toggleFrequencyInputs() {
    const frequencyType = document.getElementById('frequencyType').value;
    const singleFrequencyInputs = document.getElementById('singleFrequencyInputs');
    const frequencySweepInputs = document.getElementById('frequencySweepInputs');
    
    if (frequencyType === 'Single Frequency') {
        singleFrequencyInputs.style.display = 'flex';
        frequencySweepInputs.style.display = 'none';
    } else {
        singleFrequencyInputs.style.display = 'none';
        frequencySweepInputs.style.display = 'flex';
    }
}

function disableInputParamsElements(disable) {
    const inputs = document.querySelectorAll('.input-section input, .input-section select');
    inputs.forEach(input => {
        input.disabled = disable;
    });
}

function toggleRF(button) {
    const lockButton = document.querySelector('.lock-button');
    const messagebox = document.getElementById('messagebox');
    const frequencyType = document.getElementById('frequencyType').value;

    if (!button) {
        disableInputParamsElements(false);
        messagebox.textContent = "RF output frequency turned OFF!";
        if (sweepInterval) {
            clearInterval(sweepInterval);
        }
        if (lockCheckInterval) {
            clearInterval(lockCheckInterval);
        }
        //clearOutputFrequency();
    } else {
        disableInputParamsElements(true);

        if (frequencyType === 'Frequency Sweep') {
            startFrequencySweep();
        } else {
            const outputFrequency = document.getElementById('outputFrequency').value;
            setOutputFrequency(outputFrequency);
        }

        lockCheckInterval = setInterval(checkLockStatus, 3000); // Start checking lock status every 3 seconds
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
        const lockButton = document.querySelector('.lock-button');
        if (data.locked) {
            lockButton.style.backgroundColor = '#4CAF50'; // Green when locked
        } else {
            lockButton.style.backgroundColor = '#f44336'; // Red when not locked
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
    const messagebox = document.getElementById('messagebox');
    let currentFrequency = minFrequency;

    messagebox.textContent = "RF output frequency " + currentFrequency + " MHz generated...";

    sweepInterval = setInterval(() => {
        currentFrequency += stepSize;
        if (currentFrequency > maxFrequency) {
            currentFrequency = minFrequency;
        }
        //setOutputFrequency(currentFrequency);
    }, 5000);
}

function setOutputFrequency(frequency) {
    console.log('Setting output frequency to:', frequency); // Debugging log
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