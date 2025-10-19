let sweepInterval;
let lockCheckInterval;
let hopInterval;
let extTriggerActive = false;
let extFrequencies = [];
let extIndex = 0

window.onload = function() {
	renderHopInputs();
	renderExternalTriggerGrid(); 
    toggleFrequencyInputs();
    loadConfig();
    fetchTemperature(); // Fetch the temperature on page load
    //setInterval(fetchTemperature, 5000); // Fetch temperature every 5 seconds
    //setInterval(checkServerStatus, 3000); // Check server status every 3 seconds
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



// Function to disable/enable Phase and Time input fields
function disablePhaseTimeInputs(disable) {
    const phaseInputs = document.querySelectorAll('#phase, #setPhase');
    const timeInputs = document.querySelectorAll('#time, #timeUnit, #setTime');

    phaseInputs.forEach(element => element.disabled = disable);
    timeInputs.forEach(element => element.disabled = disable);
}

// Function to disable/enable inputs during external trigger mode
function disableExternalTriggerInputs(disable) {
    document.getElementById('frequencyType').disabled = disable;
    for (let i = 1; i <= 60; i++) {
        document.getElementById(`extFreq${i}`).disabled = disable;
    }

    document.getElementById('chargePump').disabled = disable;
}

// Hide RF ON/OFF button in external trigger mode
function hideRFButton(hide) {
    const rfToggle = document.querySelector('.rf-toggle-container');
    if (rfToggle) {
        rfToggle.style.display = hide ? 'none' : 'flex'; // Hide or show RF toggle
    }
}

// ---- External Trigger: render 60 inputs (IDs extFreq1..extFreq60) ----
function renderExternalTriggerGrid() {
  const section = document.getElementById('externalTriggerDiv');
  if (!section) return;

  // Ensure a container exists
  let container = section.querySelector('.frequency-table-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'frequency-table-container';
    section.prepend(container);
  }

  // Build a 6-column table: 1–10, 11–20, …, 51–60 (matches old Jinja)
  const makeCell = (id) =>
    `<td><input type="number" id="extFreq${id}" min="62" max="32000" step="0.000001" placeholder="MHz"></td>`;

  const header =
    `<thead><tr>
       <th>Frequency 1-10</th><th>Frequency 11-20</th><th>Frequency 21-30</th>
       <th>Frequency 31-40</th><th>Frequency 41-50</th><th>Frequency 51-60</th>
     </tr></thead>`;

  let body = '<tbody>';
  for (let r = 0; r < 10; r++) {
    const c1 = 1 + r,   c2 = 11 + r, c3 = 21 + r,
          c4 = 31 + r,  c5 = 41 + r, c6 = 51 + r;
    body += `<tr>${makeCell(c1)}${makeCell(c2)}${makeCell(c3)}${makeCell(c4)}${makeCell(c5)}${makeCell(c6)}</tr>`;
  }
  body += '</tbody>';

  container.innerHTML = `<table>${header}${body}</table>`;

  // Respect current disable state if External Trigger mode is active
  const disable = document.getElementById('frequencyType')?.value === 'External Trigger Mode';
  for (let i = 1; i <= 60; i++) {
    const el = document.getElementById(`extFreq${i}`);
    if (el) el.disabled = !!disable;
  }
}

function renderHopInputs() {
  const container = document.querySelector('#hopfreqdiv .frequency-hop-container');
  if (!container) return;

  container.innerHTML = Array.from({ length: 10 }, (_, k) => {
    const i = k + 1;
    return `
      <div class="frequency-hop-input-group">
        <label for="freq${i}">Frequency ${i} (MHz)</label>
        <input type="number" id="freq${i}" class="frequency-input"
               min="62" max="32000" step="0.000001" placeholder="MHz">

        <label for="dwell${i}">Dwell Time ${i}</label>
        <div class="time-input-container">
          <input type="number" id="dwell_hr${i}" min="0" max="23" placeholder="HH">
          <input type="number" id="dwell_min${i}" min="0" max="59" placeholder="MM">
          <input type="number" id="dwell_sec${i}" min="0" max="59" placeholder="SS">
        </div>
      </div>`;
  }).join('');
}

// Toggle between CW Frequency and Frequency Sweep sections
function toggleFrequencyInputs() {
    const frequencyType = document.getElementById('frequencyType').value;

    // Hide all sections and labels by default
    const sections = {
        'CW Frequency': 'cwfreqdiv',
        'Frequency Sweep': 'sweepfreqdiv',
        'Frequency Hop': 'hopfreqdiv',
        'External Trigger Mode': 'externalTriggerDiv'
    };

    const labels = {
        'CW Frequency': 'CW Frequency',
        'Frequency Sweep': 'Frequency Sweep',
        'Frequency Hop': 'Frequency Hop',
        'External Trigger Mode': 'External Trigger Mode'
    };

    Object.keys(sections).forEach(key => {
        // Hide all sections
        document.getElementById(sections[key]).style.display = 'none';
        // Hide all labels
        document.querySelector(`label[for="message"][text="${labels[key]}"]`).style.display = 'none';
    });

    // Show the relevant section and label based on the selected frequency type
    if (sections[frequencyType]) {
        document.getElementById(sections[frequencyType]).style.display = 'block';
        document.querySelector(`label[for="message"][text="${labels[frequencyType]}"]`).style.display = 'block';
    }

    if (frequencyType === 'PWM Mode') {
        const cwInput = document.getElementById('outputFrequency');
        if (cwInput) cwInput.value = '';
    }

    // Handle RF ON/OFF toggle visibility for External Trigger Mode
    const rfToggle = document.getElementById('rfToggleContainer');
    if (rfToggle) {
        rfToggle.style.display = frequencyType === 'External Trigger Mode' ? 'none' : 'flex';
    }
}

// Toggle RF on or off
function toggleRF(button) {
    const messagebox = document.getElementById('messagebox');
    const frequencyType = document.getElementById('frequencyType').value;
    const dropdown = document.getElementById('frequencyType');  // Get the dropdown element
    const chargePumpField = document.getElementById('chargePump');  // Get charge pump field
    const refFreqInput = document.getElementById('refFreq'); // Reference frequency input
    const refDoublerCheckbox = document.getElementById('enableRefDoubler'); // Doubler checkbox
    const refDividerCheckbox = document.getElementById('enableRefDivideBy2'); // Divider checkbox
    
    if (!button) {
        disableCWFrequencySection(false);
        disableSweepFrequencySection(false);
        disableHopFrequencySection(false);
        otherParamsSection(false);
        disablePhaseTimeInputs(true);

        messagebox.textContent = "RF output frequency turned OFF!";
        dropdown.disabled = false; // Enable dropdown when RF is OFF

        if (refFreqInput) refFreqInput.disabled = false;
        if (refDoublerCheckbox) refDoublerCheckbox.disabled = false;
        if (refDividerCheckbox) refDividerCheckbox.disabled = false;

        const refFreqValue = parseFloat(refFreqInput.value);
        if (!isNaN(refFreqValue)) {
            validateRefDoubler(refFreqValue); // Validate doubler based on refFreqValue
        }

        if (sweepInterval) clearInterval(sweepInterval);
        if (hopInterval) clearInterval(hopInterval);
        if (lockCheckInterval) clearInterval(lockCheckInterval);
		
        clearOutputFrequency();
		
		if (document.getElementById('frequencyType')?.value === 'PWM Mode') {
		try { await stopPWM(); } catch(e) { /* ignore if not connected */ }
		togglePWMInputs(false);
}
		
    } else {
        disableCWFrequencySection(true);
        disableSweepFrequencySection(true);
        disableHopFrequencySection(true);
        otherParamsSection(true);
        disablePhaseTimeInputs(false);

        if (refFreqInput) refFreqInput.disabled = true;
        if (refDoublerCheckbox) refDoublerCheckbox.disabled = true;
        if (refDividerCheckbox) refDividerCheckbox.disabled = true;

        dropdown.disabled = true;  // Disable dropdown when RF is ON

        // Set the charge pump current immediately before enabling RF
        const chargePumpCurrent = document.getElementById('chargePump').value;
        setChargePumpCurrent(chargePumpCurrent)
            .then(() => {
                if (frequencyType === 'Frequency Sweep') {
                    startFrequencySweep();
                } else if (frequencyType === 'Frequency Hop') {
                    startFrequencyHop();
				
				} else if (frequencyType === 'PWM Mode') {
				  togglePWMInputs(true);
				  (async () => {
					try {
					  requireSerialOrThrow();
					  await startPWM();
					} catch (e) {
					  document.getElementById('messagebox').textContent = 'Failed to start PWM: ' + e.message;
					  togglePWMInputs(false);
					  // Also revert the RF button to OFF if you visually toggle it there
					  try {
						const rfBtn = document.getElementById('toggleRFButton');
						if (rfBtn && rfBtn.classList.contains('active')) rfBtn.classList.remove('active');
					  } catch(_) {}
					}
				  })();
				
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
    for (let i = 1; i <= 60; i++) {
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

    // Set charge pump before starting
    const chargePumpCurrent = document.getElementById('chargePump').value;

    console.log("External Trigger Mode: Setting Charge Pump: " + chargePumpCurrent);

    // Set charge pump current
    setChargePumpCurrent(chargePumpCurrent)

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
async function clearOutputFrequency() {
  if (typeof sendLine !== 'function') {
    alert("Not connected: use Connect before clearing/stopping.");
    return;
  }

  const modeEl = document.getElementById('frequencyType');
  const mode = modeEl ? modeEl.value : 'CW Frequency';
  const msg  = document.getElementById('messagebox');

  try {
    if (mode === 'Frequency Sweep') {
      // Stop device-controlled sweep
      await sendLine('SWP STOP');
	  await sendLine('CLR');
      // (Optional) stop any legacy UI timers if they exist
      if (typeof sweepInterval !== 'undefined' && sweepInterval) clearInterval(sweepInterval);

      if (msg) msg.textContent = 'Sweep stopped.';
    } else if (mode === 'CW Frequency') {
      // Clear CW frequency
      await sendLine('CLR');
      if (msg) msg.textContent = 'CW frequency cleared.';
	  
	} else if (mode === 'Frequency Hop') {
	  if (hopInterval) { clearTimeout(hopInterval); hopInterval = null; }
      await sendLine('CLR');
      if (msg) msg.textContent = 'Hop stopped.';
	
	} else if (mode === 'PWM Mode') {
	  try { await stopPWM(); } catch(e) {}
      if (msg) msg.textContent = "PWM stopped.";
	
    } else {
      // Leave other modes untouched (or handle them explicitly if needed)
      if (msg) msg.textContent = `${mode}: no clear/stop action defined.`;
    }
  } catch (e) {
    if (msg) msg.textContent = 'Action failed: ' + e.message;
  }
}

// Check lock status periodically
function checkLockStatus() {
    fetch('/check_lock_status', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
    })
        .then(response => response.json())
        .then(data => {
            const lockCircle = document.querySelector('.lock-circle');
            if (lockCircle) {
                lockCircle.style.backgroundColor = data.locked ? '#00ff00' : 'red'; // Green if locked, red otherwise
            }
        })
        .catch(error => console.error('Error fetching lock status:', error));
}


// Start frequency sweep
async function startFrequencySweep() {
  // (Optional) clear any legacy intervals
  if (sweepInterval) clearInterval(sweepInterval);

  const minF   = parseFloat(document.getElementById('minFrequency').value, 10);
  const maxF   = parseFloat(document.getElementById('maxFrequency').value, 10);
  const step   = parseFloat(document.getElementById('stepSize').value, 10);
  const dwell  = parseInt(document.getElementById('sweepTime').value, 10); // ms
  const msg    = document.getElementById('messagebox');

  // Basic validation (match your ranges elsewhere in the UI)
  if (!Number.isFinite(minF) || !Number.isFinite(maxF) || !Number.isFinite(step) || !Number.isFinite(dwell)) {
    msg.textContent = 'Fill all sweep fields.';
    return;
  }
  
  if (step <= 0 || dwell <= 0) {
    msg.textContent = 'Step and dwell must be > 0.';
    return;
  }
  if (typeof sendLine !== 'function') {
    msg.textContent = 'Not connected: use Connect before starting sweep.';
    return;
  }

  // Send one command (device handles looping)
  await sendLine(`SWP ${minF} ${maxF} ${step} ${dwell}`);
  msg.textContent = `Device sweep started: ${minF}→${maxF} MHz, step ${step} MHz, dwell ${dwell} ms.`;
}

// Start frequency hopping
// Start frequency hopping (variable dwell per hop, loops forever until RF OFF)
function startFrequencyHop() {
  // Clear any previous timer/interval
  if (hopInterval) { clearTimeout(hopInterval); hopInterval = null; }

  const messagebox = document.getElementById('messagebox');
  const freqs = [];
  const dwells = [];

  // Collect up to 10 hops (already in your UI)
  for (let i = 1; i <= 10; i++) {
    const f = parseFloat(document.getElementById(`freq${i}`).value);
    const hr  = parseInt(document.getElementById(`dwell_hr${i}`).value)  || 0;
    const min = parseInt(document.getElementById(`dwell_min${i}`).value) || 0;
    const sec = parseInt(document.getElementById(`dwell_sec${i}`).value) || 0;
    const dwellMs = (hr * 3600 + min * 60 + sec) * 1000;

    if (Number.isFinite(f) && f >= 62 && f <= 32000 && dwellMs > 0) {
      freqs.push(f);
      dwells.push(dwellMs);
    }
  }

  if (freqs.length === 0) {
    messagebox.textContent = 'Enter at least one valid hop (freq + dwell).';
    return;
  }
  if (typeof sendLine !== 'function') {
    messagebox.textContent = 'Not connected: use Connect before starting hop.';
    return;
  }

  let i = 0; // current hop index

  const hopOnce = async () => {
    // Stop if RF got turned OFF elsewhere
    const rfOn = document.getElementById('toggle')?.checked;
    if (!rfOn) return;

    const f = freqs[i];
    const dwellMs = dwells[i];

    try {
      await sendLine('F ' + f);
      messagebox.textContent = `HOP: ${f} MHz for ${Math.round(dwellMs/1000)} s`;
    } catch (e) {
      messagebox.textContent = 'Hop failed: ' + e.message;
      return;
    }

    // advance index and schedule next hop with its *own* dwell
    i = (i + 1) % freqs.length;
    hopInterval = setTimeout(hopOnce, dwellMs);
  };

  // kick off
  hopOnce();
}


// Set output frequency
// Set output frequency (accepts an optional numeric argument)
async function setOutputFrequency(valueOptional) {
  if (typeof sendLine !== 'function') {
    alert("Not connected: use Connect before setting frequency.");
    return;
  }

  const msg = document.getElementById('messagebox');
  const inp = document.getElementById('outputFrequency');

  let v = (typeof valueOptional === 'number' && Number.isFinite(valueOptional))
            ? valueOptional
            : parseFloat(inp?.value);

  if (!Number.isFinite(v) || v < 62 || v > 32000) {
    if (msg) msg.textContent = 'Please enter a valid CW frequency.';
    return;
  }

  await sendLine('F ' + v);
  if (msg) msg.textContent = `CW frequency set to ${v} MHz.`;
}




// Set charge pump current
async function setChargePumpCurrent(current_mA) {
  const uA = Math.round(parseFloat(current_mA) * 1000);
  if (!Number.isFinite(uA) || uA <= 0) {
    const messagebox = document.getElementById('messagebox');
    if (messagebox) messagebox.textContent = 'Enter a valid CP current.';
    return;
  }
  await sendLine(`C ${uA}`); // same command style as index.html
  const messagebox = document.getElementById('messagebox');
  if (messagebox) messagebox.textContent = `Charge Pump current set to ${uA} µA.`;
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
    checkLockStatus();
    setInterval(checkLockStatus, 2000);

    const toggleCheckbox = document.getElementById('toggle');
    if (toggleCheckbox) {
        toggleCheckbox.addEventListener('click', function() {
            if (toggleCheckbox.checked) {

                toggleRF(true);
            } else {

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
    for (let i = 1; i <= 60; i++) {
        const extFreq = parseFloat(document.getElementById(`extFreq${i}`).value);
        if (!isNaN(extFreq) && extFreq >= 62 && extFreq <= 32000) {
            extFrequencies.push(extFreq);
        }
    }


    const config = {
        refFrequency: parseFloat(document.getElementById('refFreq').value) || 100, // Save refFreq
        frequencyType: document.getElementById('frequencyType').value,
        outputFrequency: parseFloat(document.getElementById('outputFrequency').value),  // Use parseFloat
        minFrequency: parseFloat(document.getElementById('minFrequency').value),  // Use parseFloat
        maxFrequency: parseFloat(document.getElementById('maxFrequency').value),  // Use parseFloat
        stepSize: parseFloat(document.getElementById('stepSize').value),  // Use parseFloat
        sweepTime: parseInt(document.getElementById('sweepTime').value),
        chargePump: parseFloat(document.getElementById('chargePump').value),
        rfStatus: document.getElementById('toggle').checked,  // Save RF status
        hopFrequencies: frequencies,  // Save hop frequencies
        dwellTimes: dwellTimes,  // Save dwell times
        externalHopFrequencies: extFrequencies  // Save external hop frequencies
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
        document.getElementById('refFreq').value = config.refFrequency || 100; // Load refFreq
        document.getElementById('frequencyType').value = config.frequencyType || 'CW Frequency';
        document.getElementById('outputFrequency').value = parseFloat(config.outputFrequency) || '1000';
        document.getElementById('minFrequency').value = parseFloat(config.minFrequency) || '4000';
        document.getElementById('maxFrequency').value = parseFloat(config.maxFrequency) || '7000';
        document.getElementById('stepSize').value = parseFloat(config.stepSize) || '100';
        document.getElementById('sweepTime').value = config.sweepTime || '1000';
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
                if (index < 60) {
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




document.addEventListener('DOMContentLoaded', function () {

    const messagebox = document.getElementById('messagebox');



    const toggleCheckbox = document.getElementById('toggle');
    if (toggleCheckbox) {
        toggleCheckbox.addEventListener('click', function () {
            const refFreqValue = parseFloat(document.getElementById('refFreq').value); // Get current REF frequency
            if (toggleCheckbox.checked) {
                toggleRF(true);
            } else {
                toggleRF(false);
                // Call validateRefDoubler when RF is OFF
                
            }
        });
    }







   



    // Reboot Event Listener
    const rebootButton = document.getElementById('rebootButton');
    if (rebootButton) {
        rebootButton.addEventListener('click', function () {
            if (confirm('Are you sure you want to reboot the Synthesizer?')) {
                messagebox.textContent = 'Reboot initiated. Please wait for the system to come back online.';

                fetch('/reboot', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                }).catch(error => console.error('Reboot request error:', error));
            }
        });
    }

    // Shutdown Event Listener
    const shutdownButton = document.getElementById('shutdownButton');
    if (shutdownButton) {
        shutdownButton.addEventListener('click', function () {
            if (confirm('Are you sure you want to shutdown the Synthesizer?')) {
                messagebox.textContent = 'Shutdown initiated. The system will power off shortly.';

                fetch('/shutdown', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                }).catch(error => console.error('Shutdown request error:', error));
            }
        });
    }
});


/**
 * ----------------------------------------------------------------------------------------------------------------------------------
 * Phase Shifter Section
 */


document.getElementById('setPhase').addEventListener('click', () => {
    const phaseInput = parseFloat(document.getElementById('phase').value);
    const timeUnit = document.getElementById('timeUnit').value;
    const outputFrequency = parseFloat(document.getElementById('outputFrequency').value); // Frequency in MHz
    const messageBox = document.getElementById('messagebox'); // Message box element

    // Reset message box
    messageBox.textContent = '';

    if (isNaN(phaseInput) || phaseInput < 0.00002 || phaseInput > 360) {
        messageBox.textContent = 'Invalid Phase value. Enter between 0.00002° and 360°.';
        return;
    }

    if (isNaN(outputFrequency) || outputFrequency <= 0) {
        messageBox.textContent = 'Invalid Output Frequency. Please set a valid frequency.';
        return;
    }

    // Calculate time equivalent
    const timeSeconds = (phaseInput / 360) * (1 / (outputFrequency * 1e6)); // Convert to microseconds
    const timeConverted = convertTime(timeSeconds, timeUnit);

    // Update the Time field
    document.getElementById('time').value = timeConverted.toFixed(6);

    // Send Phase to the backend
    fetch('/set_phase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: phaseInput, outputFrequency })
    })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                messageBox.textContent = data.message; // Display success message in the message box
            } else {
                messageBox.textContent = `Error: ${data.message}`; // Display error message
            }
        })
        .catch(error => {
            messageBox.textContent = 'Error setting phase. Please try again.';
            console.error('Error setting phase:', error);
        });
});

document.getElementById('setTime').addEventListener('click', () => {
    const timeInput = parseFloat(document.getElementById('time').value);
    const timeUnit = document.getElementById('timeUnit').value;
    const outputFrequency = parseFloat(document.getElementById('outputFrequency').value); // Frequency in MHz
    const messageBox = document.getElementById('messagebox'); // Message box element

    // Reset message box
    messageBox.textContent = '';

    if (isNaN(timeInput) || timeInput <= 0) {
        messageBox.textContent = 'Invalid Time value. Please enter a valid number.';
        return;
    }

    if (isNaN(outputFrequency) || outputFrequency <= 0) {
        messageBox.textContent = 'Invalid Output Frequency. Please set a valid frequency.';
        return;
    }

    // Convert time to seconds and calculate phase equivalent
    const timeSeconds = convertTimeToSeconds(timeInput, timeUnit);
    const phaseEquivalent = (timeSeconds * (outputFrequency * 1e6)) * 360;

    if (phaseEquivalent > 360) {
        messageBox.textContent = 'Time value results in a phase greater than 360°. Adjust the input.';
        return;
    }

    // Update the Phase field
    document.getElementById('phase').value = phaseEquivalent.toFixed(4);

    // Send Time to the backend
    fetch('/set_time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ time: timeInput, timeUnit, outputFrequency })
    })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                messageBox.textContent = data.message; // Display success message in the message box
            } else {
                messageBox.textContent = `Error: ${data.message}`; // Display error message
            }
        })
        .catch(error => {
            messageBox.textContent = 'Error setting time delay. Please try again.';
            console.error('Error setting time delay:', error);
        });
});

/**
 * Converts time in seconds to the specified time unit.
 * @param {number} timeSeconds - Time in seconds.
 * @param {string} unit - Target time unit (ms, µs, ns, ps, fs).
 * @returns {number} - Time converted to the target unit.
 */
function convertTime(timeSeconds, unit) {
    const units = { ms: 1e-3, us: 1e-6, ns: 1e-9, ps: 1e-12, fs: 1e-15 };
    return timeSeconds / units[unit];
}

/**
 * Converts time from a specific unit to seconds.
 * @param {number} time - Time value in the given unit.
 * @param {string} unit - Current time unit (ms, µs, ns, ps, fs).
 * @returns {number} - Time converted to seconds.
 */
function convertTimeToSeconds(time, unit) {
    const units = { ms: 1e-3, us: 1e-6, ns: 1e-9, ps: 1e-12, fs: 1e-15 };
    return time * units[unit];
}

/**
 * ----------------------------------------------------------------------------------------------------------------------------------
 * Digital Step Attenuator Section
 */


document.addEventListener("DOMContentLoaded", function () {
    const attenuationInput = document.getElementById("attenuation");
    const setAttenuationButton = document.getElementById("setAttenuation");
    const maxAttenuationButton = document.getElementById("maxAttenuation");
    const clearAttenuationButton = document.getElementById("clearAttenuation");
    const messagebox = document.getElementById("messagebox");

    function setAttenuation(value) {
        fetch("/set_attenuation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attenuation: value })
        })
        .then(response => response.json())
        .then(data => {
            messagebox.textContent = data.message; // Display response message
        })
        .catch(error => {
            console.error("Error:", error);
            messagebox.textContent = "Error setting attenuation.";
        });
    }

    // Set Attenuation Button Click
    setAttenuationButton.addEventListener("click", function () {
        let attenuationValue = parseFloat(attenuationInput.value);
        if (isNaN(attenuationValue) || attenuationValue < 0 || attenuationValue > 31) {
            messagebox.textContent = "Invalid Attenuation Value. Enter between 0 and 31 dB.";
            return;
        }

	attenuationValue = Math.round(attenuationValue * 2) / 2;
        attenuationInput.value = attenuationValue.toFixed(1);

        setAttenuation(attenuationValue);
    });

    maxAttenuationButton.addEventListener("click", function () {
        fetch("/set_attenuation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attenuation: "disable_rf" })  // Send special command
        })
        .then(response => response.json())
        .then(data => {
            messagebox.textContent = data.message; // Display response message
        })
        .catch(error => {
            console.error("Error:", error);
            messagebox.textContent = "Error disabling RF output.";
        });
    });

    // Clear Attenuation Button Click (Restores Last Register 0x25 Value)
    clearAttenuationButton.addEventListener("click", function () {
        fetch("/set_attenuation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attenuation: "reset_rf" })  // Send special command

        })
        .then(response => response.json())
        .then(data => {
            messagebox.textContent = data.message; // Display response message
        })
        .catch(error => {
            console.error("Error:", error);
            messagebox.textContent = "Error resetting attenuation.";
        });
    }); 

});

function updateAttenuationDisplay() {
    fetch("/get_attenuation")
        .then(response => response.json())
        .then(data => {
            if (data.status === "success") {
                document.getElementById("currentAttenuation").textContent = data.attenuation.toFixed(1);
            } else {
                document.getElementById("currentAttenuation").textContent = "Error";
            }
        })
        .catch(error => {
            console.error("Error fetching attenuation:", error);
            document.getElementById("currentAttenuation").textContent = "Error";
        });
}

// Call update function every 3 seconds (adjust as needed)
setInterval(updateAttenuationDisplay, 1000);

// Update once when the page loads
document.addEventListener("DOMContentLoaded", updateAttenuationDisplay);

// Toggle Frequency Input Sections to include PWM
const originalToggleFrequencyInputs = toggleFrequencyInputs;
toggleFrequencyInputs = function () {
    originalToggleFrequencyInputs();  // Call existing logic

    const frequencyType = document.getElementById('frequencyType').value;
    document.getElementById('pwmdiv').style.display = frequencyType === 'PWM Mode' ? 'block' : 'none';
};

// Show/hide duty cycle or PRT inputs
document.addEventListener('DOMContentLoaded', () => {
    const pwmMode = document.getElementById('pwmMode');
    const dutyGroup = document.getElementById('dutyCycleGroup');
    const prtGroup = document.getElementById('prtGroup');

                        Mode.addEventListener('change', () => {
        if (pwmMode.value === 'duty') {
            dutyGroup.style.display = 'block';
            prtGroup.style.display = 'none';
        } else {
            dutyGroup.style.display = 'none';
            prtGroup.style.display = 'block';
        }
    });

function togglePWMInputs(disable) {
    const ids = [
        'pwmFrequency', 'pwmMode', 'pwmDutyCycle', 'pwmFrequencyRate',
        'pwmPRT', 'pwmPulseWidth'
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = disable;
    });
}

const originalToggleRFWithPWM = toggleRF;
toggleRF = function(button) {
    const frequencyType = document.getElementById('frequencyType').value;
    const messagebox = document.getElementById('messagebox');

    originalToggleRFWithPWM(button); // preserve existing behavior

    const isPWM = frequencyType === 'PWM Mode';
    togglePWMInputs(button && isPWM);  // Disable on RF ON, enable on RF OFF

    if (button && isPWM) {
        const payload = {
            frequency: parseFloat(document.getElementById('pwmFrequency').value),
            mode: document.getElementById('pwmMode').value,
            dutyCycle: parseFloat(document.getElementById('pwmDutyCycle').value),
            pwmRate: parseFloat(document.getElementById('pwmFrequencyRate').value),
            prt: parseFloat(document.getElementById('pwmPRT').value),
            pulseWidth: parseFloat(document.getElementById('pwmPulseWidth').value)
        };

        fetch('/start_pwm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(resp => resp.json())
        .then(data => {
            messagebox.textContent = data.message || "PWM started.";
        })
        .catch(err => {
            console.error("PWM start error:", err);
            messagebox.textContent = "Failed to start PWM.";
        });

    } else if (!button) {
        fetch('/stop_pwm', {
            method: 'POST'
        })
        .then(resp => resp.json())
        .then(data => {
            messagebox.textContent = data.message || "PWM stopped.";
        })
        .catch(err => {
            console.error("PWM stop error:", err);
            messagebox.textContent = "Failed to stop PWM.";
        });

        togglePWMInputs(false); // Enable PWM fields on RF OFF
    }
};

});

document.getElementById('ipMode').addEventListener('change', function () {
    const staticIPInput = document.getElementById('staticIP');
    staticIPInput.disabled = this.value === 'dhcp';
    if (staticIPInput.disabled) {
        staticIPInput.value = '';  // Clear the box when switching to Dynamic
    }
});

document.getElementById('applyNetwork').addEventListener('click', () => {
    const mode = document.getElementById('ipMode').value;
    const ip = document.getElementById('staticIP').value;

    fetch('/set_ip_mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, static_ip: ip })
    })
    .then(response => response.json())
    .then(data => {
         document.getElementById('messagebox').textContent = data.message;
	 if (data.status === "success") {
            alert("Press reboot to change IP");
        }
    })
    .catch(error => {
        document.getElementById('messagebox').textContent = 'Error applying network config';
        console.error(error);
    });
});

// ===== Web Serial integration (non-breaking) =====
(() => {
  'use strict';
  if (window.__webSerialInstalled) return; // prevent double-install
  window.__webSerialInstalled = true;

  const $ = (sel) => document.querySelector(sel);
  const statusEl = $('#serialStatus');
  const portNameEl = $('#portName');
  const consoleEl = $('#console');

  function log(msg){
    if (!consoleEl) return;
    const line = document.createElement('div');
    line.textContent = String(msg);
    consoleEl.appendChild(line);
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }
  function setStatus(txt){ if(statusEl) statusEl.textContent = txt; }
  function setPortName(txt){ if(portNameEl) portNameEl.textContent = txt; }

  let port, reader, writer;
  let inputDone, outputDone;
  let inputStream, outputStream;

  async function connect(){
    try {
      if (!('serial' in navigator)) {
        setStatus('Unsupported (use Chrome/Edge on desktop)');
        log('Web Serial not supported.');
        return;
      }
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      try { await port.setSignals({ dataTerminalReady: true, requestToSend: true }); } catch {}
      const info = port.getInfo?.() || {};
      setPortName(`VID: ${info.usbVendorId||'—'} PID: ${info.usbProductId||'—'}`);
      setStatus('Connected');
      window.__serialConnected = true;

      const textDecoder = new TextDecoderStream();
      inputDone = port.readable.pipeTo(textDecoder.writable);
      inputStream = textDecoder.readable;
      reader = inputStream.getReader();

      const textEncoder = new TextEncoderStream();
      outputDone = textEncoder.readable.pipeTo(port.writable);
      outputStream = textEncoder.writable;
      writer = outputStream.getWriter();

      readLoop();
    } catch (e){
      log('Connect error: ' + e.message);
      setStatus('Error');
    }
  }

  async function disconnect(){
    try {
      window.__serialConnected = false;
      setStatus('Disconnected');
      setPortName('—');
      if (reader) { try { await reader.cancel(); } catch {} }
      if (inputDone) { try { await inputDone; } catch {} }
      reader = null; inputDone = null; inputStream = null;

      if (writer) { try { await writer.close(); } catch {} }
      if (outputDone) { try { await outputDone; } catch {} }
      writer = null; outputDone = null; outputStream = null;

      if (port) { try { await port.close(); } catch {} }
      port = null;
    } catch(e){
      log('Disconnect error: ' + e.message);
    }
  }



	function maybeParseStatusFromChunk(text) {
	  const m = text.match(/REF:\s*DOUB=(\d)\s+DIV2=(\d)/i);
	  if (m) {
		const chkD = document.getElementById('enableRefDoubler');
		const chkV = document.getElementById('enableRefDivideBy2');
		if (chkD) chkD.checked = (m[1] === '1');
		if (chkV) chkV.checked = (m[2] === '1');
		
	  }
	}

  async function readLoop(){
    if (!reader) return;
    try {
      while (true){
        const { value, done } = await reader.read();
        if (done) break;
        if (value) { log(value); maybeParseStatusFromChunk(String(value));}
      }
    } catch(e){ /* reader canceled */ }
  }

  async function writeLine(str){
    if (!writer){
      log('Not connected.');
      return;
    }
    try { await writer.write(String(str) + '\r\n'); }
    catch(e){ log('Write error: ' + e.message); }
  }

  window.sendLine = writeLine;
  
  document.addEventListener('DOMContentLoaded', () => {
    const btnConnect = $('#btnConnect');
    const btnDisconnect = $('#btnDisconnect');
    const btnClear = $('#btnClear');

    if (btnConnect){
      btnConnect.addEventListener('click', async () => {
        await connect();
        if (window.__serialConnected){
          btnConnect.setAttribute('disabled', 'disabled');
          btnDisconnect?.removeAttribute('disabled');
        }
      });
    }
    if (btnDisconnect){
      btnDisconnect.addEventListener('click', async () => {
        await disconnect();
        btnDisconnect.setAttribute('disabled', 'disabled');
        btnConnect?.removeAttribute('disabled');
      });
    }
    
  });
})();
// ===== /Web Serial integration =====
// --- FINAL BIND: Set Reference Frequency via WebSerial ---
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('setRefFreq');
  const inp = document.getElementById('refFreq');
  const indicator = document.getElementById('refFrequency');
  const msg = document.getElementById('messagebox');
  if (!btn || !inp) return;

  btn.addEventListener('click', async () => {
    const v = parseFloat(inp.value);
    if (!Number.isFinite(v) || v < 10 || v > 500) {
      msg.textContent = 'Please enter a valid Reference Frequency between 10 and 500 MHz.';
      return;
    }

    // send exactly like index.html
    if (typeof sendLine === 'function') {
      await sendLine('R ' + v);
    }

    // update the right-panel indicator and message box
    if (indicator) indicator.textContent = `${v} MHz`;
    msg.textContent = `Ref frequency set to ${v} MHz`;
	
    // keep your existing doubler validation if present
    validateRefDoubler(v);
    if (typeof sendRefToggles === 'function') { await sendRefToggles(); updateRefIndicators();}
  });
});



document.getElementById('btnSetCP')?.addEventListener('click', async () => {
  const mA = document.getElementById('chargePump')?.value;
  await setChargePumpCurrent(mA);
});



document.addEventListener('DOMContentLoaded', () => {
  const chkD = document.getElementById('enableRefDoubler');
  const chkV = document.getElementById('enableRefDivideBy2');

  if (chkD) chkD.addEventListener('change', sendRefToggles);
  if (chkV) chkV.addEventListener('change', sendRefToggles);

  // paint initial state
  
});	

// === REF Doubler/Divider glue (add-on to match index.html) ===

// Paint the right-side indicators to reflect checkbox state
function updateRefIndicators() {
  const chkD = document.getElementById('enableRefDoubler');
  const chkV = document.getElementById('enableRefDivideBy2');
  const doublerIndicator = document.getElementById('doublerIndicator');
  const dividerIndicator  = document.getElementById('dividerIndicator');

  if (doublerIndicator && chkD) {
    doublerIndicator.style.backgroundColor = chkD.checked ? '#00ff00' : 'lightgray';
  }
  if (dividerIndicator && chkV) {
    dividerIndicator.style.backgroundColor = chkV.checked ? '#00ff00' : 'lightgray';
  }
}

// Send the current toggles to firmware and update indicators
async function sendRefToggles() {
  const chkD = document.getElementById('enableRefDoubler');
  const chkV = document.getElementById('enableRefDivideBy2');
  if (!chkD || !chkV) return;

  const doub = chkD.checked ? 1 : 0;
  const div2 = chkV.checked ? 1 : 0;

  if (typeof sendLine === 'function') {
    await sendLine(`REF DOUB=${doub} DIV2=${div2}`);
  }
  
}

// Optional: disable Doubler above 125 MHz (keeps your prior rule)
function validateRefDoubler(refMHz) {
  const chkD = document.getElementById('enableRefDoubler');
  const msg  = document.getElementById('messagebox');
  const doublerIndicator = document.getElementById('doublerIndicator');
  if (!chkD) return;

  if (Number.isFinite(refMHz) && refMHz > 125) {
    chkD.checked = false;
    chkD.disabled = true;
    if (doublerIndicator) doublerIndicator.style.backgroundColor = 'lightgray';
    if (msg) msg.textContent = 'Reference Doubler is unavailable for frequencies above 125 MHz.';
  } else {
    chkD.disabled = false;
  }
}

// If firmware prints status like: "REF: DOUB=1 DIV2=0", mirror it to UI
function maybeParseStatusFromChunk(text) {
  const m = String(text).match(/REF:\s*DOUB=(\d)\s+DIV2=(\d)/i);
  if (m) {
    const chkD = document.getElementById('enableRefDoubler');
    const chkV = document.getElementById('enableRefDivideBy2');
    if (chkD) chkD.checked = (m[1] === '1');
    if (chkV) chkV.checked = (m[2] === '1');
    
  }
}

// Hook up checkbox changes + initial paint
document.addEventListener('DOMContentLoaded', () => {
  const chkD = document.getElementById('enableRefDoubler');
  const chkV = document.getElementById('enableRefDivideBy2');
  if (chkD) chkD.addEventListener('change', sendRefToggles);
  if (chkV) chkV.addEventListener('change', sendRefToggles);
  
});

function requireSerialOrThrow() {
  if (!(typeof window.sendLine === 'function' && window.__serialConnected)) {
    const err = 'Web Serial not connected. Click Connect and select the CDC port.';
    const msg = document.getElementById('messagebox');
    if (msg) msg.textContent = err;
    throw new Error(err);
  }
}

// Show/hide PWM sub-forms and enable/disable inputs when RF toggles
function updatePWMModeVisibility() {
  const mode = document.getElementById('pwmMode')?.value || 'duty';
  const dutyGroup = document.getElementById('dutyCycleGroup');
  const prtGroup  = document.getElementById('prtGroup');
  if (dutyGroup) dutyGroup.style.display = (mode === 'duty') ? 'block' : 'none';
  if (prtGroup)  prtGroup.style.display  = (mode === 'prt')  ? 'block' : 'none';
}

function togglePWMInputs(disable) {
  const ids = [
    'pwmFrequency','pwmMode','pwmDutyCycle','pwmFrequencyRate',
    'pwmPRT','pwmPulseWidth'
  ];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.disabled = !!disable; });
}

document.getElementById('pwmMode')?.addEventListener('change', updatePWMModeVisibility);
document.addEventListener('DOMContentLoaded', updatePWMModeVisibility);

// Build and send PWM over Web Serial ONLY
async function startPWM() {
  requireSerialOrThrow();
  const f    = parseFloat(document.getElementById('pwmFrequency')?.value);
  const mode = document.getElementById('pwmMode')?.value || 'duty';
  const msg  = document.getElementById('messagebox');

  if (!Number.isFinite(f) || f < 62 || f > 32000) {
    if (msg) msg.textContent = 'Enter valid PWM RF frequency (62–32000 MHz).';
    throw new Error('Invalid PWM frequency');
  }

  // Set carrier first (same grammar used elsewhere)
  await sendLine('F ' + f);

  if (mode === 'duty') {
    const duty = parseFloat(document.getElementById('pwmDutyCycle')?.value);
    const prf  = parseFloat(document.getElementById('pwmFrequencyRate')?.value);
    if (!Number.isFinite(duty) || duty < 0 || duty > 100 || !Number.isFinite(prf) || prf <= 0) {
      if (msg) msg.textContent = 'Enter Duty (%) 0–100 and PRF (Hz) > 0.';
      throw new Error('Invalid duty/PRF');
    }
    // Command grammar: PWM D <freq_MHz> <prf_Hz> <duty_%>
    await sendLine(`PWM D ${f} ${prf} ${duty}`);
    if (msg) msg.textContent = `PWM (Duty) started: f=${f} MHz, PRF=${prf} Hz, Duty=${duty}%`;
  } else {
    const prtUs = parseFloat(document.getElementById('pwmPRT')?.value);
    const pwUs  = parseFloat(document.getElementById('pwmPulseWidth')?.value);
    if (!Number.isFinite(prtUs) || prtUs <= 0 || !Number.isFinite(pwUs) || pwUs <= 0 || pwUs >= prtUs) {
      if (msg) msg.textContent = 'Enter PRT (µs) > 0 and Pulse Width (µs) < PRT.';
      throw new Error('Invalid PRT/PulseWidth');
    }
    // Command grammar: PWM P <freq_MHz> <prt_us> <pulsewidth_us>
    await sendLine(`PWM P ${f} ${prtUs} ${pwUs}`);
    if (msg) msg.textContent = `PWM (PRT) started: f=${f} MHz, PRT=${prtUs} µs, PW=${pwUs} µs`;
  }
}

async function stopPWM() {
  requireSerialOrThrow();
  const msg = document.getElementById('messagebox');
  await sendLine('PWM STOP');
  if (msg) msg.textContent = 'PWM stopped.';
}

function updatePWMModeVisibility() {
  const mode = document.getElementById('pwmMode')?.value || 'duty';
  const dutyGroup = document.getElementById('dutyCycleGroup');
  const prtGroup  = document.getElementById('prtGroup');
  if (dutyGroup) dutyGroup.style.display = (mode === 'duty') ? 'block' : 'none';
  if (prtGroup)  prtGroup.style.display  = (mode === 'prt')  ? 'block' : 'none';
}

function togglePWMInputs(disable) {
  ['pwmFrequency','pwmMode','pwmDutyCycle','pwmFrequencyRate','pwmPRT','pwmPulseWidth']
    .forEach(id => { const el = document.getElementById(id); if (el) el.disabled = !!disable; });
}

document.getElementById('pwmMode')?.addEventListener('change', updatePWMModeVisibility);
document.addEventListener('DOMContentLoaded', updatePWMModeVisibility);
