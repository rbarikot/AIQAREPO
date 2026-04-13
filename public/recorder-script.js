/**
 * RECORDER & SCENARIO GENERATOR SCRIPT
 * 
 * Handles:
 * - Recording user actions
 * - Generating test scenarios
 * - Displaying scenarios
 * - Sending scenarios to planner
 */

const API_BASE = 'http://localhost:5000';

// Global state
let currentSessionId = null;
let currentScenarios = null;
let selectedScenarios = new Set();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RECORDING FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function startRecording() {
  const baseUrl = document.getElementById('recorderBaseUrl').value.trim();
  
  if (!baseUrl) {
    showToast('Please enter a base URL', 'error');
    return;
  }

  try {
    const btnStart = document.getElementById('btnStartRecording');
    const btnStop = document.getElementById('btnStopRecording');
    const statusBox = document.getElementById('recordingStatusBox');
    
    btnStart.disabled = true;
    btnStart.innerHTML = '<span class="loading-dots"><span></span><span></span><span></span></span> Starting...';

    logRecording('🧹 Cleaning up previous session...');

    // Force cleanup any lingering browser/session before starting
    try {
      await fetch(`${API_BASE}/api/recorder/cleanup`, { method: 'POST' });
    } catch (_) {
      // Ignore cleanup errors
    }

    logRecording('🎬 Starting recorder...');

    const response = await fetch(`${API_BASE}/api/recorder/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl }),
    });

    const data = await response.json();

    if (data.success) {
      currentSessionId = data.sessionId;
      
      btnStart.style.display = 'none';
      btnStop.style.display = 'block';
      statusBox.style.display = 'flex';
      
      logRecording(`✅ Recording started! Session: ${currentSessionId}`);
      logRecording('📱 Browser is open - Perform your actions manually');
      logRecording('🛑 Click "Stop & Generate Scenarios" when done');
      
      showToast('Recording started! Browser is open.', 'success');
    } else {
      throw new Error(data.error || 'Failed to start recording');
    }

  } catch (error) {
    console.error('Recording error:', error);
    logRecording(`❌ Error: ${error.message}`, 'error');
    showToast(`Error: ${error.message}`, 'error');
    
    document.getElementById('btnStartRecording').disabled = false;
    document.getElementById('btnStartRecording').innerHTML = '<span class="btn-icon">🎬</span> Start Recording';
  }
}

async function stopRecording() {
  try {
    const btnStop = document.getElementById('btnStopRecording');
    const statusBox = document.getElementById('recordingStatusBox');
    
    btnStop.disabled = true;
    btnStop.innerHTML = '<span class="loading-dots"><span></span><span></span><span></span></span> Stopping...';

    logRecording('🛑 Stopping recording...');

    // Step 1: Stop recording and get journey
    const stopResponse = await fetch(`${API_BASE}/api/recorder/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const stopData = await stopResponse.json();

    if (!stopData.success) {
      throw new Error('Failed to stop recording');
    }

    const journeyData = stopData.journey;
    logRecording(`✅ Journey recorded: ${journeyData.totalSteps} steps`);

    // Step 2: Generate scenarios from journey
    logRecording('⏳ Generating scenarios...');
    
    const baseUrl = document.getElementById('recorderBaseUrl').value.trim();
    const language = document.getElementById('recorderLanguage').value;

    const scenariosResponse = await fetch(`${API_BASE}/api/scenarios/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        journeyData,
        options: { language, baseUrl }
      }),
    });

    const scenariosData = await scenariosResponse.json();

    if (!scenariosData.success) {
      throw new Error('Failed to generate scenarios');
    }

    currentScenarios = scenariosData.scenarios;

    // Ensure baseUrl is set from recorder input
    if (!currentScenarios.baseUrl && baseUrl) {
      currentScenarios.baseUrl = baseUrl;
    }
    
    logRecording(`✅ Scenarios generated: ${currentScenarios.totalScenarios} total`);
    logRecording(`   ✅ Positive: ${currentScenarios.scenarios.positive.length}`);
    logRecording(`   ❌ Negative: ${currentScenarios.scenarios.negative.length}`);
    logRecording('🎉 Ready to send to Planner!');
    
    displayScenarios(currentScenarios);
    
    showToast(`Generated ${currentScenarios.totalScenarios} scenarios!`, 'success');
    
    // Reset UI
    btnStop.style.display = 'none';
    statusBox.style.display = 'none';
    document.getElementById('btnStartRecording').style.display = 'block';
    document.getElementById('btnStartRecording').disabled = false;
    document.getElementById('btnStartRecording').innerHTML = '<span class="btn-icon">🎬</span> Start Recording';

  } catch (error) {
    console.error('Stop recording error:', error);
    logRecording(`❌ Error: ${error.message}`, 'error');
    showToast(`Error: ${error.message}`, 'error');
    
    // Force cleanup the recorder browser on error
    try {
      await fetch(`${API_BASE}/api/recorder/cleanup`, { method: 'POST' });
      logRecording('🧹 Cleaned up recorder session');
    } catch (_) {}

    document.getElementById('btnStopRecording').disabled = false;
    document.getElementById('btnStopRecording').innerHTML = '<span class="btn-icon">🛑</span> Stop & Generate Scenarios';
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SCENARIO DISPLAY FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function displayScenarios(scenarios) {
  // Hide empty state, show content
  document.getElementById('scenariosOutput').style.display = 'none';
  document.getElementById('scenariosContent').style.display = 'block';
  document.getElementById('scenariosActions').style.display = 'flex';

  // Update stats
  document.getElementById('totalScenariosCount').textContent = scenarios.totalScenarios;
  document.getElementById('positiveScenariosCount').textContent = scenarios.scenarios.positive.length;
  document.getElementById('negativeScenariosCount').textContent = scenarios.scenarios.negative.length;

  // Render scenario cards
  const scenariosList = document.getElementById('scenariosList');
  scenariosList.innerHTML = '';

  // Select all scenarios by default
  selectedScenarios.clear();

  // Render positive scenarios
  scenarios.scenarios.positive.forEach(scenario => {
    const card = createScenarioCard(scenario, 'positive');
    scenariosList.appendChild(card);
    selectedScenarios.add(scenario.scenarioId);
  });

  // Render negative scenarios
  scenarios.scenarios.negative.forEach(scenario => {
    const card = createScenarioCard(scenario, 'negative');
    scenariosList.appendChild(card);
    selectedScenarios.add(scenario.scenarioId);
  });

  updateSelectedCount();
}

function createScenarioCard(scenario, type) {
  const card = document.createElement('div');
  card.className = `scenario-card ${type} selected`;
  card.dataset.scenarioId = scenario.scenarioId;
  
  card.innerHTML = `
    <span class="scenario-type-badge ${type}">${type.toUpperCase()}</span>
    <div style="font-size:0.85rem; color:#666; margin-bottom:5px;">${scenario.scenarioId}</div>
    <div style="font-weight:600; color:#333; margin-bottom:8px;">${scenario.title}</div>
    <div style="font-size:0.9rem; color:#666;">${scenario.description}</div>
    <div style="margin-top:10px; font-size:0.85rem; color:#999;">
      ${scenario.steps.length} steps • Priority: ${scenario.priority}
    </div>
  `;

  card.onclick = () => toggleScenarioSelection(scenario.scenarioId);

  return card;
}

function toggleScenarioSelection(scenarioId) {
  const card = document.querySelector(`[data-scenario-id="${scenarioId}"]`);
  
  if (selectedScenarios.has(scenarioId)) {
    selectedScenarios.delete(scenarioId);
    card.classList.remove('selected');
  } else {
    selectedScenarios.add(scenarioId);
    card.classList.add('selected');
  }

  updateSelectedCount();
  
  // Update "Select All" checkbox
  const selectAllCheckbox = document.getElementById('selectAllScenarios');
  const totalScenarios = currentScenarios.totalScenarios;
  selectAllCheckbox.checked = selectedScenarios.size === totalScenarios;
}

function toggleSelectAll(checked) {
  selectedScenarios.clear();
  
  const cards = document.querySelectorAll('.scenario-card');
  
  if (checked) {
    // Select all
    currentScenarios.scenarios.positive.forEach(s => selectedScenarios.add(s.scenarioId));
    currentScenarios.scenarios.negative.forEach(s => selectedScenarios.add(s.scenarioId));
    cards.forEach(card => card.classList.add('selected'));
  } else {
    // Deselect all
    cards.forEach(card => card.classList.remove('selected'));
  }

  updateSelectedCount();
}

function updateSelectedCount() {
  document.getElementById('selectedCount').textContent = 
    `${selectedScenarios.size} selected`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SEND TO PLANNER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function sendScenariosToPlan() {
  if (selectedScenarios.size === 0) {
    showToast('Please select at least one scenario', 'error');
    return;
  }

  // Get selected scenarios
  const selected = {
    positive: currentScenarios.scenarios.positive.filter(s => 
      selectedScenarios.has(s.scenarioId)
    ),
    negative: currentScenarios.scenarios.negative.filter(s => 
      selectedScenarios.has(s.scenarioId)
    ),
  };

  const scenariosData = {
    ...currentScenarios,
    scenarios: selected,
    totalScenarios: selected.positive.length + selected.negative.length,
  };

  // Switch to planner tab
  switchTab('planner');

  // Select "scenarios mode"
  document.getElementById('plannerModeScenarios').checked = true;
  togglePlannerMode('scenarios');

  // Populate scenarios JSON
  document.getElementById('plannerScenariosJson').value = 
    JSON.stringify(scenariosData, null, 2);
  
  document.getElementById('plannerScenariosCount').textContent = 
    `(${scenariosData.totalScenarios} scenarios)`;

  // Store in global for planner to use
  window.currentPlannerScenarios = scenariosData;

  showToast(`Sent ${scenariosData.totalScenarios} scenarios to Planner!`, 'success');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PLANNER MODE TOGGLE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function togglePlannerMode(mode) {
  const scenariosMode = document.getElementById('plannerScenariosMode');
  const manualMode = document.getElementById('plannerManualMode');

  if (mode === 'scenarios') {
    scenariosMode.style.display = 'block';
    manualMode.style.display = 'none';
  } else {
    scenariosMode.style.display = 'none';
    manualMode.style.display = 'block';
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DOWNLOAD SCENARIOS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function downloadScenarios() {
  if (!currentScenarios) {
    showToast('No scenarios to download', 'error');
    return;
  }

  const blob = new Blob([JSON.stringify(currentScenarios, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `scenarios-${currentSessionId}.json`;
  a.click();
  URL.revokeObjectURL(url);

  showToast('Scenarios downloaded!', 'success');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LOGGING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function logRecording(message, type = 'info') {
  const logBody = document.getElementById('recorderLogBody');
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = message;
  logBody.appendChild(entry);
  logBody.scrollTop = logBody.scrollHeight;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TAB SWITCHING (Enhanced)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Override switchTab from script.js to include recorder
const originalSwitchTab = window.switchTab;
window.switchTab = function(tabName) {
  // Remove active from all tabs
  document.querySelectorAll('.tab-section').forEach(tab => 
    tab.classList.remove('active')
  );
  document.querySelectorAll('.pipeline-step').forEach(step => 
    step.classList.remove('active')
  );

  // Activate selected tab
  const tabId = tabName === 'recorder' ? 'tab-recorder' : 
                tabName === 'planner' ? 'tab-planner' :
                tabName === 'generator' ? 'tab-generator' : 'tab-healer';
  
  const pipeId = tabName === 'recorder' ? 'pipe-0' :
                 tabName === 'planner' ? 'pipe-1' :
                 tabName === 'generator' ? 'pipe-2' : 'pipe-3';

  document.getElementById(tabId).classList.add('active');
  document.getElementById(pipeId).classList.add('active');
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Start on recorder tab
  switchTab('recorder');
});