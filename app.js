/* -------------------------------------------------------------
   STROKE RISK ANALYZER - APPLICATION LOGIC (app.js)
   Features: Web Bluetooth BLE sync, LocalStorage, Gemini API client
------------------------------------------------------------- */

// State Object
const state = {
  activeTab: 'dashboard-tab',
  apiKey: '',
  selectedModel: 'gemini-3.6-flash',
  bleDeviceName: 'ESP32-Stroke-Monitor',
  bleCustomCharacteristicUuid: '',
  bleDevice: null,
  bleCharacteristic: null,
  isBleConnecting: false,
  evalHistory: [],
  activeChatHistory: []
};

// Default BLE UUIDs (standard clinical telemetry profiles or generic UART)
const TELEMETRY_SERVICE_UUID = '0000180d'; // Heart Rate Service (standard) or custom
const HEART_RATE_SERVICE_UUID = 'heart_rate';
// Custom/UART RX characteristic commonly used on ESP32 BLE
const GENERIC_CHARACTERISTIC_UUID = '00002a37'; // Heart Rate Measurement characteristic

// -------------------------------------------------------------
// APP INITIALIZATION
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  initNavigation();
  initBleSync();
  initFormSubmit();
  initChatbot();
  initSettingsActions();
  renderHistoryTable();
  updateDashboardStats();
  
  // Set current date on dashboard
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('current-date').innerText = new Date().toLocaleDateString('en-US', options);
});

// -------------------------------------------------------------
// SETTINGS & STORAGE MANAGEMENT
// -------------------------------------------------------------
function loadSettings() {
  // Keep the field for compatibility with existing local settings; the server owns the API key.
  state.apiKey = localStorage.getItem('cg_api_key') || '';
  
  let savedModel = localStorage.getItem('cg_model_choice') || 'gemini-3.6-flash';
  if (savedModel.includes('1.5')) {
    savedModel = savedModel.replace('1.5', '2.5');
    localStorage.setItem('cg_model_choice', savedModel);
  }
  state.selectedModel = savedModel;
  state.bleDeviceName = localStorage.getItem('cg_ble_name') || 'ESP32-Stroke-Monitor';
  state.bleCustomCharacteristicUuid = localStorage.getItem('cg_ble_uuid') || '';
  
  try {
    state.evalHistory = JSON.parse(localStorage.getItem('cg_eval_history')) || [];
  } catch (e) {
    state.evalHistory = [];
  }

  // Populate UI inputs with saved settings (with safe null-guards)
  const apiKeyField = document.getElementById('settings-api-key');
  if (apiKeyField) apiKeyField.value = state.apiKey;
  
  const modelChoiceField = document.getElementById('settings-model-choice');
  if (modelChoiceField) modelChoiceField.value = state.selectedModel;
  
  const bleNameField = document.getElementById('settings-ble-name');
  if (bleNameField) bleNameField.value = state.bleDeviceName;
  
  const bleUuidField = document.getElementById('settings-ble-uuid');
  if (bleUuidField) bleUuidField.value = state.bleCustomCharacteristicUuid;

  // Toggle API key alert banner on Dashboard (if it exists)
  const apiWarning = document.getElementById('api-key-warning');
  if (apiWarning) {
    if (state.apiKey) {
      apiWarning.style.display = 'none';
    } else {
      apiWarning.style.display = 'flex';
    }
  }
}

function saveGeneralSettings() {
  const apiKeyField = document.getElementById('settings-api-key');
  if (apiKeyField) {
    const apiKeyInput = apiKeyField.value.trim();
    localStorage.setItem('cg_api_key', apiKeyInput);
    state.apiKey = apiKeyInput;
  }
  
  const modelChoiceField = document.getElementById('settings-model-choice');
  if (modelChoiceField) {
    const modelChoice = modelChoiceField.value;
    localStorage.setItem('cg_model_choice', modelChoice);
    state.selectedModel = modelChoice;
  }

  const apiWarning = document.getElementById('api-key-warning');
  if (apiWarning) {
    if (state.apiKey) {
      apiWarning.style.display = 'none';
    } else {
      apiWarning.style.display = 'flex';
    }
  }

  showToast('AI configuration saved successfully!', 'success');
}

function saveBleSettings() {
  const bleNameInput = document.getElementById('settings-ble-name').value.trim();
  const bleUuidInput = document.getElementById('settings-ble-uuid').value.trim();

  localStorage.setItem('cg_ble_name', bleNameInput);
  localStorage.setItem('cg_ble_uuid', bleUuidInput);
  state.bleDeviceName = bleNameInput;
  state.bleCustomCharacteristicUuid = bleUuidInput;

  showToast('Bluetooth settings updated!', 'success');
}

function wipeLocalStorage() {
  if (confirm('Are you sure you want to wipe all stored patient data, API keys, and device configurations? This action is irreversible.')) {
    localStorage.clear();
    loadSettings();
    renderHistoryTable();
    updateDashboardStats();
    showToast('Application cache cleared.', 'info');
  }
}

// Helper to show visual toast alert
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast-banner ${type}`;
  toast.style.position = 'fixed';
  toast.style.bottom = '20px';
  toast.style.right = '20px';
  toast.style.padding = '12px 24px';
  toast.style.borderRadius = '8px';
  toast.style.color = '#fff';
  toast.style.fontWeight = '600';
  toast.style.zIndex = '9999';
  toast.style.fontSize = '0.9rem';
  toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  toast.style.animation = 'fadeIn 0.2s ease-out';

  if (type === 'success') toast.style.backgroundColor = '#10b981';
  else if (type === 'error') toast.style.backgroundColor = '#ef4444';
  else if (type === 'info') toast.style.backgroundColor = '#0ea5e9';

  toast.innerText = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease-in';
    setTimeout(() => toast.remove(), 280);
  }, 3000);
}

// -------------------------------------------------------------
// ROUTING & NAVIGATION
// -------------------------------------------------------------
function initNavigation() {
  const menuButtons = document.querySelectorAll('.menu-item');
  menuButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      navigateToTab(target);
    });
  });
}

function navigateToTab(tabId) {
  // Toggle sidebar button active classes
  const menuButtons = document.querySelectorAll('.menu-item');
  menuButtons.forEach(btn => {
    if (btn.getAttribute('data-target') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Toggle active views
  const tabs = document.querySelectorAll('.tab-content');
  tabs.forEach(tab => {
    if (tab.id === tabId) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  state.activeTab = tabId;
}

// Expose routing function globally for onclick triggers
window.navigateToTab = navigateToTab;

// -------------------------------------------------------------
// BLUETOOTH BLE SYNC CONTROLLER
// -------------------------------------------------------------
function logToBleConsole(message, type = 'system') {
  const consoleEl = document.getElementById('ble-log-console');
  const entry = document.createElement('p');
  entry.className = `log-entry ${type}`;
  
  const now = new Date();
  const timeStr = `[${now.toTimeString().split(' ')[0]}] `;
  entry.innerText = timeStr + message;
  
  consoleEl.appendChild(entry);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function updateBleConnectionUI(status) {
  const statusBadge = document.getElementById('ble-status-badge');
  const statusDot = document.getElementById('ble-status-dot');
  const globalDot = document.getElementById('global-device-status-dot');
  const globalText = document.getElementById('global-device-status-text');
  const connectBtnText = document.getElementById('btn-ble-text');
  const spinner = document.getElementById('ble-icon-spinner');
  const btIcon = document.getElementById('ble-icon-bt');
  const dashboardSyncStatus = document.getElementById('stat-active-sync');

  // Reset classes
  statusDot.className = 'pulse-dot';
  globalDot.className = 'pulse-dot';

  if (status === 'connected') {
    statusBadge.innerText = 'Connected';
    statusBadge.className = 'badge badge-connected';
    statusDot.classList.add('green');
    globalDot.classList.add('green');
    globalText.innerText = 'ESP32 Sync Active';
    connectBtnText.innerText = 'Disconnect ESP32';
    spinner.style.display = 'none';
    btIcon.style.display = 'inline-block';
    dashboardSyncStatus.innerText = 'Sync Active';
    dashboardSyncStatus.parentElement.parentElement.querySelector('.stat-icon').style.backgroundColor = '#e6fcf5';
  } else if (status === 'connecting') {
    statusBadge.innerText = 'Connecting...';
    statusBadge.className = 'badge';
    statusDot.classList.add('blue');
    globalDot.classList.add('blue');
    globalText.innerText = 'Connecting BLE...';
    connectBtnText.innerText = 'Connecting...';
    spinner.style.display = 'inline-block';
    btIcon.style.display = 'none';
    dashboardSyncStatus.innerText = 'Connecting...';
  } else {
    statusBadge.innerText = 'Disconnected';
    statusBadge.className = 'badge badge-disconnected';
    statusDot.classList.add('grey');
    globalDot.classList.add('grey');
    globalText.innerText = 'ESP32 Offline';
    connectBtnText.innerText = 'Connect BLE Device';
    spinner.style.display = 'none';
    btIcon.style.display = 'inline-block';
    dashboardSyncStatus.innerText = 'Inactive';
    dashboardSyncStatus.parentElement.parentElement.querySelector('.stat-icon').style.backgroundColor = '#f1f5f9';
  }
}

function initBleSync() {
  const connectBtn = document.getElementById('btn-ble-connect');
  const simulateBtn = document.getElementById('btn-simulate-ble');

  connectBtn.addEventListener('click', () => {
    if (state.bleDevice && state.bleDevice.gatt.connected) {
      disconnectBle();
    } else {
      connectToBleDevice();
    }
  });

  simulateBtn.addEventListener('click', () => {
    simulateBleSync();
  });
}

async function connectToBleDevice() {
  if (!navigator.bluetooth) {
    logToBleConsole('Web Bluetooth API is not supported in this browser. Please use Chrome/Edge or run via HTTPS/Localhost.', 'error');
    showToast('Bluetooth not supported in browser', 'error');
    return;
  }

  try {
    state.isBleConnecting = true;
    updateBleConnectionUI('connecting');
    logToBleConsole(`Scanning for Bluetooth devices starting with: "${state.bleDeviceName}"...`, 'system');

    const filters = [{ services: [HEART_RATE_SERVICE_UUID] }];
    if (state.bleDeviceName) filters.push({ namePrefix: state.bleDeviceName });
    const options = {
      filters,
      optionalServices: [TELEMETRY_SERVICE_UUID, HEART_RATE_SERVICE_UUID]
    };

    // Prompt user to select device
    state.bleDevice = await navigator.bluetooth.requestDevice(options);
    
    logToBleConsole(`Device selected: ${state.bleDevice.name}. Connecting to GATT server...`, 'system');
    
    // Connect to GATT
    const server = await state.bleDevice.gatt.connect();
    
    logToBleConsole('GATT Server connected! Discovering primary services...', 'success');
    
    // Auto handle device disconnection
    state.bleDevice.addEventListener('gattserverdisconnected', onBleDisconnected);

    // Try to get primary service
    let service;
    try {
      service = await server.getPrimaryService(TELEMETRY_SERVICE_UUID);
      logToBleConsole(`Primary Service [${TELEMETRY_SERVICE_UUID}] discovered.`, 'success');
    } catch (e) {
      // Fallback: try heart_rate standard service
      service = await server.getPrimaryService('heart_rate');
      logToBleConsole('Primary Service [heart_rate] discovered.', 'success');
    }

    // Try to discover characteristics
    const characteristicUuid = state.bleCustomCharacteristicUuid.toLowerCase() || GENERIC_CHARACTERISTIC_UUID;
    try {
      state.bleCharacteristic = await service.getCharacteristic(characteristicUuid);
      logToBleConsole(`Characteristic [${characteristicUuid}] discovered.`, 'success');
    } catch (e) {
      // Fallback: try reading the first readable/notifiable characteristic
      const characteristics = await service.getCharacteristics();
      if (characteristics.length > 0) {
        state.bleCharacteristic = characteristics[0];
        logToBleConsole(`Auto-discovered characteristic: ${state.bleCharacteristic.uuid}`, 'system');
      } else {
        throw new Error('No Bluetooth characteristics found on the device.');
      }
    }

    // Start receiving sensor logs
    await state.bleCharacteristic.startNotifications();
    state.bleCharacteristic.addEventListener('characteristicvaluechanged', onBleDataReceived);
    
    logToBleConsole('Active notification stream configured. Waiting for sensor transmission...', 'success');
    updateBleConnectionUI('connected');
    showToast('ESP32 BLE connected successfully!', 'success');
    
  } catch (error) {
    console.error('BLE Connection error:', error);
    logToBleConsole(`Connection Failed: ${error.message}`, 'error');
    disconnectBle();
  } finally {
    state.isBleConnecting = false;
  }
}

function disconnectBle() {
  if (state.bleDevice && state.bleDevice.gatt.connected) {
    logToBleConsole('Initiating clean disconnect from GATT server...', 'system');
    state.bleDevice.gatt.disconnect();
  } else {
    onBleDisconnected();
  }
}

function onBleDisconnected() {
  logToBleConsole('Device disconnected from app. Interface offline.', 'error');
  state.bleDevice = null;
  state.bleCharacteristic = null;
  updateBleConnectionUI('disconnected');
}

// Read and parse BLE packages
function onBleDataReceived(event) {
  const value = event.target.value;

  try {
    const decodedText = new TextDecoder('utf-8', { fatal: true }).decode(value).trim();
    const data = JSON.parse(decodedText);
    logToBleConsole(`Data packet: ${decodedText}`, 'data');
    populateTelemetryForm(data);
  } catch (error) {
    if (value.byteLength >= 2) {
      const flags = value.getUint8(0);
      const bpm = (flags & 0x01) !== 0 ? value.getUint16(1, true) : value.getUint8(1);
      populateTelemetryForm({ heartRate: bpm });
      logToBleConsole(`Raw BPM Extracted: ${bpm}`, 'data');
    } else {
      logToBleConsole(`Parsing error on incoming stream: ${error.message}`, 'error');
    }
  }
}

function populateTelemetryForm(data) {
  if (data.age) document.getElementById('patient-age').value = data.age;
  if (data.heartRate) document.getElementById('patient-heartrate').value = data.heartRate;
  if (data.avgGlucose) document.getElementById('patient-glucose').value = data.avgGlucose;
  if (data.bmi) document.getElementById('patient-bmi').value = data.bmi;
  
  if (data.hypertension !== undefined) {
    const val = data.hypertension === 1 || data.hypertension === true || data.hypertension === 'Yes' ? 'Yes' : 'No';
    document.getElementById('patient-hypertension').value = val;
  }
  
  if (data.smokingStatus) {
    const val = data.smokingStatus.toLowerCase();
    const select = document.getElementById('patient-smoking');
    if (val.includes('never')) select.value = 'Never Smoked';
    else if (val.includes('form')) select.value = 'Formerly Smoked';
    else if (val.includes('reg') || val.includes('smok')) select.value = 'Regularly Smokes';
  }

  showToast('Patient health forms updated via BLE!', 'info');
}

// -------------------------------------------------------------
// ESP32 MOCK SIMULATOR
// -------------------------------------------------------------
function simulateBleSync() {
  updateBleConnectionUI('connecting');
  logToBleConsole('Scanning for local ESP32 broadcasters...', 'system');
  
  setTimeout(() => {
    logToBleConsole('Found broadcast signal: "ESP32-Stroke-Monitor" [MAC: AA:BB:CC:00:11:22]', 'system');
    logToBleConsole('Connecting to device Gatt Server...', 'system');
    
    setTimeout(() => {
      updateBleConnectionUI('connected');
      logToBleConsole('GATT Connection: OK', 'success');
      logToBleConsole('Discovering Primary Telemetry Service: OK', 'success');
      logToBleConsole('Active notification stream: ENGAGED', 'success');
      
      // Send mock packet 1
      setTimeout(() => {
        const mockPayload = {
          age: 72,
          heartRate: 88,
          avgGlucose: 242,
          bmi: 31.2,
          hypertension: 1,
          smokingStatus: 'formerly'
        };
        logToBleConsole(`Incoming Data: ${JSON.stringify(mockPayload)}`, 'data');
        populateTelemetryForm(mockPayload);
      }, 1000);
      
    }, 1000);
  }, 1000);
}

// -------------------------------------------------------------
// STROKE ASSESSMENT & GEMINI API IMPLEMENTATION
// -------------------------------------------------------------
function initFormSubmit() {
  const form = document.getElementById('patient-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await executeStrokeAnalysis();
  });
}

async function executeStrokeAnalysis() {
  // Grab form inputs
  const pName = document.getElementById('patient-name').value.trim() || 'Anonymous Patient';
  const pAge = document.getElementById('patient-age').value;
  const pGender = document.getElementById('patient-gender').value;
  const pHeart = document.getElementById('patient-heartrate').value;
  const pGlucose = document.getElementById('patient-glucose').value;
  const pBmi = document.getElementById('patient-bmi').value;
  const pHypert = document.getElementById('patient-hypertension').value;
  const pSmoke = document.getElementById('patient-smoking').value;

  // Show spinner overlay
  document.getElementById('analyzer-spinner').style.display = 'flex';
  document.getElementById('result-pane-container').classList.add('loading-blur');

  // Prompt Construction
  const prompt = `You are a clinical decision support AI specializing in cardiovascular health and stroke risk management.
Evaluate this patient's stroke risk using established clinical correlations (e.g., correlations of age, hypertension, glucose, BMI, and smoking status with stroke incidence).

Patient parameters:
- Name/Ref ID: ${pName}
- Age: ${pAge} Years
- Gender: ${pGender}
- Heart Rate: ${pHeart} BPM
- Average Glucose Level: ${pGlucose} mg/dL
- BMI: ${pBmi}
- History of Hypertension: ${pHypert}
- Smoking Status: ${pSmoke}

Provide a structured assessment containing:
1. "STROKE RISK ESTIMATE": Output a single number representing the estimated percentage risk (0 to 100).
2. "RISK CATEGORY": Return exactly one of the following words: "LOW", "MODERATE", or "HIGH".
3. "RISK CONTRIBUTING FACTORS": List the key patient parameters driving this risk assessment.
4. "CLINICAL RECOMMENDATIONS": List specific, actionable medical/preventive recommendations for this patient.

Formatting requirement:
Use clean Markdown formatting. Make sure the first line of your response contains the estimated percentage risk and category badge formatted exactly like this:
RISK_PERCENT: [Number]% | RISK_LEVEL: [LOW/MODERATE/HIGH]

Keep the findings concise and easy to read.`;

  try {
    const rawResult = await callGeminiAPI(prompt);
    
    // Parse result values
    const parsedData = parseGeminiResponse(rawResult);
    
    // Render report UI
    displayReport(pName, parsedData.percentage, parsedData.level, parsedData.markdownBody);
    
    // Save to LocalStorage history
    saveEvaluationToHistory({
      name: pName,
      age: pAge,
      gender: pGender,
      heartRate: pHeart,
      glucose: pGlucose,
      bmi: pBmi,
      hypertension: pHypert,
      smoking: pSmoke,
      riskPercentage: parsedData.percentage,
      riskLevel: parsedData.level,
      rawAnalysis: parsedData.markdownBody,
      timestamp: new Date().toLocaleString()
    });

  } catch (error) {
    console.error('Gemini Analysis Failed:', error);
    showToast(`Gemini error: ${error.message}`, 'error');
  } finally {
    // Hide spinner
    document.getElementById('analyzer-spinner').style.display = 'none';
    document.getElementById('result-pane-container').classList.remove('loading-blur');
  }
}

async function callGeminiAPI(prompt, chatHistory = []) {
  // Build request body contents
  let contents = [];
  
  // If we have chat context, add history
  if (chatHistory.length > 0) {
    contents = chatHistory.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));
  }
  
  // Append current prompt
  contents.push({
    role: 'user',
    parts: [{ text: prompt }]
  });

  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ contents, model: state.selectedModel })
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error?.message || 'Network communication issue with Gemini API.');
  }

  const resData = await response.json();
  const textResponse = resData.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!textResponse) throw new Error('API returned empty candidate tokens.');
  return textResponse;
}

// Extract risk metrics from raw response
function parseGeminiResponse(responseText) {
  let percentage = 0;
  let level = 'LOW';
  
  // Match lines like RISK_PERCENT: 65% | RISK_LEVEL: HIGH
  const match = responseText.match(/RISK_PERCENT:\s*(\d+)%\s*\|\s*RISK_LEVEL:\s*(LOW|MODERATE|HIGH)/i);
  if (match) {
    percentage = parseInt(match[1]);
    level = match[2].toUpperCase();
  } else {
    // Fallback search heuristics
    const pctMatch = responseText.match(/(\d+)\s*%/);
    if (pctMatch) percentage = parseInt(pctMatch[1]);
    
    if (responseText.toUpperCase().includes('HIGH')) level = 'HIGH';
    else if (responseText.toUpperCase().includes('MODERATE')) level = 'MODERATE';
  }

  // Strip the meta line from report text
  const cleanBody = responseText.replace(/RISK_PERCENT:.*|RISK_LEVEL:.*/gi, '').trim();

  return {
    percentage,
    level,
    markdownBody: cleanBody
  };
}

// Render Markdown helper
function parseMarkdown(text) {
  let html = text;
  
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Lists
  html = html.replace(/^\s*-\s+(.*)$/gmi, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  
  // Linebreaks to paragraphs
  html = html.split('\n\n').map(p => {
    if (p.startsWith('<ul>') || p.startsWith('<li>')) return p;
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).join('');
  
  return html;
}

// Render dynamic elements to the clinical report pane
function displayReport(name, percent, level, markdownContent) {
  // Hide empty state and show report container
  document.getElementById('report-empty-placeholder').style.display = 'none';
  const reportView = document.getElementById('report-view-content');
  reportView.style.display = 'block';

  // Fill in display values
  document.getElementById('report-timestamp').innerText = `Generated on: ${new Date().toLocaleString()}`;
  document.getElementById('patient-display-summary').innerText = `Patient Ref: ${name}`;
  document.getElementById('risk-score-percent').innerText = `${percent}%`;
  
  const badge = document.getElementById('risk-category-badge');
  badge.innerText = `${level} RISK`;
  badge.className = 'risk-badge';
  badge.classList.add(level.toLowerCase());

  // Render Gauge circle
  const ring = document.getElementById('gauge-fill-ring');
  ring.className = `gauge-fill ${level.toLowerCase()}`;
  
  // Dash offset calculations (circumference = 2 * PI * r = 2 * 3.14 * 40 = 251.2)
  const offset = 251.2 - (251.2 * percent) / 100;
  ring.style.strokeDashoffset = offset;

  // Insert AI findings
  document.getElementById('findings-container').innerHTML = parseMarkdown(markdownContent);

  // Configure export hooks
  document.getElementById('btn-export-csv').onclick = () => exportReportCSV(name, percent, level, markdownContent);
  document.getElementById('btn-print-report').onclick = () => window.print();
}

function saveEvaluationToHistory(record) {
  state.evalHistory.unshift(record);
  if (state.evalHistory.length > 20) state.evalHistory.pop(); // Cap history list
  
  localStorage.setItem('cg_eval_history', JSON.stringify(state.evalHistory));
  
  renderHistoryTable();
  updateDashboardStats();
}

// -------------------------------------------------------------
// HISTORY TABLE & STATS (DASHBOARD)
// -------------------------------------------------------------
function renderHistoryTable() {
  const tbody = document.querySelector('#history-table tbody');
  tbody.innerHTML = '';

  if (state.evalHistory.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="6">No patient evaluations recorded yet. Run a Stroke Analyzer sync to start.</td>
      </tr>`;
    return;
  }

  state.evalHistory.forEach((rec, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <span class="time-stamp">${rec.timestamp.split(',')[0]}</span>
        <div class="sub-detail">${rec.timestamp.split(',')[1] || ''}</div>
      </td>
      <td>
        <strong>${rec.name}</strong>
        <div class="sub-detail">Age: ${rec.age} | ${rec.gender}</div>
      </td>
      <td>${rec.heartRate} BPM</td>
      <td>${rec.glucose} mg/dL</td>
      <td>
        <span class="risk-label ${rec.riskLevel.toLowerCase()}">${rec.riskLevel} (${rec.riskPercentage}%)</span>
      </td>
      <td>
        <button class="btn btn-text" onclick="loadHistoryToReport(${index})">View Report</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function loadHistoryToReport(index) {
  const rec = state.evalHistory[index];
  if (!rec) return;

  // Populate inputs to match the records
  document.getElementById('patient-name').value = rec.name;
  document.getElementById('patient-age').value = rec.age;
  document.getElementById('patient-gender').value = rec.gender;
  document.getElementById('patient-heartrate').value = rec.heartRate;
  document.getElementById('patient-glucose').value = rec.glucose;
  document.getElementById('patient-bmi').value = rec.bmi;
  document.getElementById('patient-hypertension').value = rec.hypertension;
  document.getElementById('patient-smoking').value = rec.smoking;

  displayReport(rec.name, rec.riskPercentage, rec.riskLevel, rec.rawAnalysis);
  navigateToTab('analyzer-tab');
}

// Make globally accessible
window.loadHistoryToReport = loadHistoryToReport;

function updateDashboardStats() {
  document.getElementById('stat-total-patients').innerText = state.evalHistory.length;
  
  const highRiskCount = state.evalHistory.filter(rec => rec.riskLevel === 'HIGH').length;
  document.getElementById('stat-high-risk').innerText = highRiskCount;
}

// -------------------------------------------------------------
// CHATBOT INTERACTIVE INTERFACE
// -------------------------------------------------------------
function initChatbot() {
  const form = document.getElementById('chat-input-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inputEl = document.getElementById('chat-input-text');
    const msg = inputEl.value.trim();
    if (!msg) return;

    inputEl.value = '';
    await handleUserMessage(msg);
  });
}

async function handleUserMessage(messageText) {
  // 1. Add user bubble
  addChatBubble(messageText, 'user');
  
  // Store chat history context
  state.activeChatHistory.push({ role: 'user', text: messageText });
  if (state.activeChatHistory.length > 10) state.activeChatHistory.shift();

  // 2. Add loader bubble
  const loaderId = addChatBubble('Analyzing request...', 'assistant loading-pulse');

  try {
    // 3. Request AI response
    const contextPrompt = `You are a clinical cardiology and stroke prevention chatbot assistant. Give clear, professional advice.`;
    const response = await callGeminiAPI(messageText, [
      { role: 'user', text: contextPrompt },
      ...state.activeChatHistory.slice(0, -1) // Excluding the latest double-add
    ]);

    // Update loader bubble with parsed content
    const bubbleContent = parseMarkdown(response);
    document.getElementById(loaderId).className = 'message assistant';
    document.getElementById(loaderId).querySelector('.message-bubble').innerHTML = bubbleContent;
    
    // Save response to history
    state.activeChatHistory.push({ role: 'assistant', text: response });
  } catch (error) {
    document.getElementById(loaderId).className = 'message assistant';
    document.getElementById(loaderId).querySelector('.message-bubble').innerHTML = 
      `<p style="color:var(--risk-high)"><strong>Error calling Gemini API:</strong> ${error.message}</p>`;
  }
}

function addChatBubble(text, senderClass) {
  const container = document.getElementById('chat-messages-container');
  const bubbleId = `bubble-${Date.now()}`;
  
  const msgDiv = document.createElement('div');
  msgDiv.id = bubbleId;
  msgDiv.className = `message ${senderClass}`;

  const avatar = senderClass.includes('assistant') ? 'AI' : 'Dr';

  msgDiv.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-bubble">
      <p>${text}</p>
    </div>
  `;

  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
  return bubbleId;
}

function sendSuggestion(promptText) {
  handleUserMessage(promptText);
}

// Make globally accessible
window.sendSuggestion = sendSuggestion;

// -------------------------------------------------------------
// REPORT EXPORTS (CSV Spreadsheet)
// -------------------------------------------------------------
function exportReportCSV(name, percentage, level, findingsText) {
  const headers = ['Metric', 'Value'];
  const rows = [
    ['Patient Name', name],
    ['Analysis Timestamp', new Date().toLocaleString()],
    ['Calculated Stroke Risk', `${percentage}%`],
    ['Risk Classification', level],
    ['Age (Years)', document.getElementById('patient-age').value],
    ['Gender', document.getElementById('patient-gender').value],
    ['Heart Rate (BPM)', document.getElementById('patient-heartrate').value],
    ['Avg Glucose Level', document.getElementById('patient-glucose').value],
    ['BMI', document.getElementById('patient-bmi').value],
    ['Hypertension', document.getElementById('patient-hypertension').value],
    ['Smoking Status', document.getElementById('patient-smoking').value],
    ['AI Findings', findingsText.replace(/\n/g, ' ')]
  ];

  let csvContent = "data:text/csv;charset=utf-8," 
    + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(','))].join('\n');

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Stroke_Risk_Report_${name.replace(/\s+/g, '_')}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// -------------------------------------------------------------
// SETTINGS VIEWS INTERACTION LOGIC
// -------------------------------------------------------------
function initSettingsActions() {
  const toggleBtn = document.getElementById('btn-toggle-key-visibility');
  const apiInput = document.getElementById('settings-api-key');

  if (toggleBtn && apiInput) {
    toggleBtn.addEventListener('click', () => {
      if (apiInput.type === 'password') {
        apiInput.type = 'text';
        toggleBtn.innerText = 'Hide';
      } else {
        apiInput.type = 'password';
        toggleBtn.innerText = 'Show';
      }
    });
  }

  const saveSettingsBtn = document.getElementById('btn-save-settings');
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', saveGeneralSettings);
  }

  const saveBleSettingsBtn = document.getElementById('btn-save-ble-settings');
  if (saveBleSettingsBtn) {
    saveBleSettingsBtn.addEventListener('click', saveBleSettings);
  }

  const wipeStorageBtn = document.getElementById('btn-wipe-storage');
  if (wipeStorageBtn) {
    wipeStorageBtn.addEventListener('click', wipeLocalStorage);
  }

  const clearHistoryBtn = document.getElementById('btn-clear-history');
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', () => {
      if (confirm('Clear all patient logs in the local table?')) {
        state.evalHistory = [];
        localStorage.setItem('cg_eval_history', JSON.stringify([]));
        renderHistoryTable();
        updateDashboardStats();
        showToast('Evaluation history cleared.', 'info');
      }
    });
  }
}
