// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPLETE script.js - WITH ALL UTILITY FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * AI QA Agent System - Unified Interface
 * 
 * This is the COMPLETE file with:
 * - Base utility functions (showToast, switchTab, etc.)
 * - Recorder functions
 * - Planner functions
 * - Generator functions
 * - Healer functions
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GLOBAL STATE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

window.currentPlan = null;
window.currentPlannerScenarios = null;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTILITY FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function switchTab(tabName) {
  // Remove active from all tabs
  document.querySelectorAll('.tab-section').forEach(tab => 
    tab.classList.remove('active')
  );
  document.querySelectorAll('.pipeline-step').forEach(step => 
    step.classList.remove('active')
  );

  // Activate selected tab
  const tabMap = {
    'recorder': { tab: 'tab-recorder', pipe: 'pipe-0' },
    'planner': { tab: 'tab-planner', pipe: 'pipe-1' },
    'generator': { tab: 'tab-generator', pipe: 'pipe-2' },
    'healer': { tab: 'tab-healer', pipe: 'pipe-3' }
  };

  const selected = tabMap[tabName];
  if (selected) {
    const tabEl = document.getElementById(selected.tab);
    const pipeEl = document.getElementById(selected.pipe);
    if (tabEl) tabEl.classList.add('active');
    if (pipeEl) pipeEl.classList.add('active');
  }
}

function syncLanguage(value) {
  const selects = ['globalLanguage', 'generatorLanguage', 'healerLanguage'];
  selects.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  });
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) {
    console.warn('Toast element not found');
    return;
  }
  
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function copyToClipboard(elementId) {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  const text = element.textContent;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard!', 'success');
  }).catch(err => {
    console.error('Failed to copy:', err);
    showToast('Failed to copy', 'error');
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PLANNER AGENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function runPlanner() {
  const btn = document.getElementById('plannerRunBtn');
  
  // Prevent double-click
  if (btn && btn.disabled) {
    console.log('⚠️ Planner already running, ignoring double-click');
    showToast('Planner is already running...', 'warning');
    return;
  }
  
  try {
    // Determine mode
    const mode = document.getElementById('plannerModeScenarios')?.checked ? 'scenarios' : 'manual';

    let requestBody = {};

    if (mode === 'scenarios') {
      // ═══ SCENARIOS MODE ═══
      if (!window.currentPlannerScenarios) {
        showToast('No scenarios loaded. Use Recorder first.', 'error');
        return;
      }

      const baseUrl = window.currentPlannerScenarios.baseUrl;
      
      if (!baseUrl) {
        showToast('No base URL found in scenarios', 'error');
        return;
      }

      logPlanner('📊 Creating test plan from scenarios...');
      logPlanner(`   Total scenarios: ${window.currentPlannerScenarios.totalScenarios}`);
      logPlanner(`   Base URL: ${baseUrl}`);

      requestBody = {
        scenarios: window.currentPlannerScenarios,
        baseUrl: baseUrl,
        language: document.getElementById('globalLanguage')?.value || 'typescript',
      };

    } else {
      // ═══ MANUAL MODE ═══
      const feature = document.getElementById('plannerFeature')?.value.trim();
      const baseUrl = document.getElementById('plannerUrl')?.value.trim();

      if (!feature || !baseUrl) {
        showToast('Please enter both feature and URL', 'error');
        return;
      }

      logPlanner('🧠 Running planner with manual input...');
      logPlanner(`   Feature: ${feature.substring(0, 50)}...`);
      logPlanner(`   URL: ${baseUrl}`);

      const customInstructions = [
        feature,
        document.getElementById('plannerNegative')?.checked ? 'Include negative test cases' : '',
        document.getElementById('plannerEdge')?.checked ? 'Include edge cases' : '',
      ].filter(Boolean).join('. ');

      requestBody = {
        baseUrl: baseUrl,
        customInstructions: customInstructions,
        testType: document.getElementById('plannerTestType')?.value || 'e2e',
        headed: document.getElementById('plannerHeaded')?.value === 'true',
        language: document.getElementById('globalLanguage')?.value || 'typescript',
      };
    }

    // Disable button
    btn.disabled = true;
    btn.innerHTML = '<span class="loading-dots"><span></span><span></span><span></span></span> Running...';

    // Clear previous output
    document.getElementById('plannerOutput').innerHTML = 
      '<div class="loading-state"><div class="loading-icon">🧠</div><p>Planner Agent is working...</p></div>';

    console.log('🚀 Calling planner with:', requestBody);

    // Call planner endpoint
    const response = await fetch('http://localhost:5000/agent/planner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    console.log('📡 Response status:', response.status, response.statusText);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Handle streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let planData = null;

    console.log('📖 Reading stream...');

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log('✅ Stream complete');
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            console.log('📦 Received:', data.type, data);
            
            if (data.type === 'done') {
              planData = data.plan;
              logPlanner('✅ Planner completed successfully!');
            } else if (data.type === 'error') {
              throw new Error(data.message);
            } else if (data.type === 'status') {
              logPlanner(`📝 ${data.message}`);
            }
          } catch (parseError) {
            console.error('❌ Parse error:', parseError, 'Line:', line);
          }
        }
      }
    }

    if (!planData) {
      throw new Error('No plan data received from server');
    }

    console.log('✅ Plan data received:', planData);

    // Store plan globally
    window.currentPlan = planData;
    
    // Display plan
    displayPlannerOutput(planData);
    
    showToast('Plan created successfully!', 'success');
    
    // Enable actions
    const actionsEl = document.getElementById('plannerActions');
    if (actionsEl) {
      actionsEl.style.display = 'flex';
    }

  } catch (error) {
    console.error('❌ Planner error:', error);
    logPlanner(`❌ Error: ${error.message}`, 'error');
    showToast(`Error: ${error.message}`, 'error');
    
    // Show error in output
    document.getElementById('plannerOutput').innerHTML = `
      <div style="padding:20px; color:#dc3545;">
        <h3>❌ Error</h3>
        <p>${error.message}</p>
        <p style="margin-top:10px; color:#666;">Check server console for more details.</p>
      </div>
    `;
  } finally {
    // Always reset button
    console.log('🔄 Resetting button...');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="btn-icon">▶</span> Run Planner Agent';
    }
  }
}

function displayPlannerOutput(plan) {
  const output = document.getElementById('plannerOutput');
  if (!output) {
    console.error('❌ plannerOutput element not found');
    return;
  }
  
  console.log('🎨 Displaying plan:', plan);
  console.log('📊 Plan structure:', {
    hasTestPlans: !!plan.testPlans,
    hasSummary: !!plan.summary,
    totalPlans: plan.totalPlans,
    positive: plan.testPlans?.positive?.length,
    negative: plan.testPlans?.negative?.length
  });
  
  // Check if it's a scenarios-based plan or manual plan
  if (plan.testPlans) {
    // Scenarios-based plan (has multiple test plans)
    const totalPlans = plan.totalPlans || 0;
    const positivePlans = plan.testPlans.positive?.length || 0;
    const negativePlans = plan.testPlans.negative?.length || 0;
    
    // Generate a better summary
    const summary = plan.summary || `Created ${totalPlans} detailed test plans from recorded scenarios (${positivePlans} positive scenarios testing valid flows, ${negativePlans} negative scenarios testing error handling and edge cases)`;
    
    console.log(`📊 Rendering: ${totalPlans} total (${positivePlans} positive, ${negativePlans} negative)`);
    console.log(`📝 Summary: ${summary}`);
    
    output.innerHTML = `
      <div style="padding:20px;">
        <h3 style="color:#28a745; margin-bottom:20px;">✅ Test Plans Created (${totalPlans} total)</h3>
        
        <div style="display:flex; gap:15px; margin:20px 0;">
          <div style="flex:1; background:#d4edda; padding:20px; border-radius:8px; text-align:center; border:2px solid #28a745;">
            <div style="font-size:2.5rem; font-weight:700; color:#155724;">${positivePlans}</div>
            <div style="color:#155724; font-weight:600; margin-top:5px;">✅ Positive Plans</div>
            <div style="color:#666; font-size:0.85rem; margin-top:5px;">Valid flows & success cases</div>
          </div>
          <div style="flex:1; background:#f8d7da; padding:20px; border-radius:8px; text-align:center; border:2px solid #dc3545;">
            <div style="font-size:2.5rem; font-weight:700; color:#721c24;">${negativePlans}</div>
            <div style="color:#721c24; font-weight:600; margin-top:5px;">❌ Negative Plans</div>
            <div style="color:#666; font-size:0.85rem; margin-top:5px;">Error handling & edge cases</div>
          </div>
        </div>
        
        <div style="margin-top:20px; padding:20px; background:#f8f9fa; border-radius:8px; border-left:4px solid #667eea;">
          <div style="font-weight:600; color:#333; margin-bottom:10px;">📋 Summary</div>
          <div style="color:#555; line-height:1.6;">${summary}</div>
        </div>
        
        <div style="margin-top:20px; padding:15px; background:#fff3cd; border-radius:8px; border-left:4px solid #ffc107;">
          <div style="font-weight:600; color:#856404; margin-bottom:8px;">⚡ Next Steps</div>
          <div style="color:#856404; font-size:0.9rem;">
            Click <strong>"Send to Generator →"</strong> above to generate Page Object Model and test spec files for all ${totalPlans} test plans.
          </div>
        </div>
        
        <details style="margin-top:20px;">
          <summary style="cursor:pointer; padding:12px; background:#e9ecef; border-radius:8px; font-weight:600; color:#333;">
            📄 View Full Plan JSON (${totalPlans} plans)
          </summary>
          <pre style="margin-top:10px; background:#1e1e1e; padding:15px; border-radius:8px; color:#fff; overflow:auto; max-height:400px; font-size:0.85rem; font-family:'JetBrains Mono', monospace;">${JSON.stringify(plan, null, 2)}</pre>
        </details>
      </div>
    `;
  } else {
    // Manual plan (single plan)
    const summary = plan.summary || 'Test plan created successfully';
    
    console.log('📄 Single manual plan');
    console.log(`📝 Summary: ${summary}`);
    
    output.innerHTML = `
      <div style="padding:20px;">
        <h3 style="color:#28a745; margin-bottom:20px;">✅ Test Plan Created</h3>
        
        <div style="margin-top:15px; padding:20px; background:#f8f9fa; border-radius:8px; border-left:4px solid #667eea;">
          <div style="font-weight:600; color:#333; margin-bottom:10px;">📋 Summary</div>
          <div style="color:#555; line-height:1.6;">${summary}</div>
        </div>
        
        <div style="margin-top:20px; padding:15px; background:#fff3cd; border-radius:8px; border-left:4px solid #ffc107;">
          <div style="font-weight:600; color:#856404; margin-bottom:8px;">⚡ Next Steps</div>
          <div style="color:#856404; font-size:0.9rem;">
            Click <strong>"Send to Generator →"</strong> above to generate Page Object Model and test spec files.
          </div>
        </div>
        
        <details style="margin-top:20px;">
          <summary style="cursor:pointer; padding:12px; background:#e9ecef; border-radius:8px; font-weight:600; color:#333;">
            📄 View Full Plan JSON
          </summary>
          <pre style="margin-top:10px; background:#1e1e1e; padding:15px; border-radius:8px; color:#fff; overflow:auto; max-height:400px; font-size:0.85rem; font-family:'JetBrains Mono', monospace;">${JSON.stringify(plan, null, 2)}</pre>
        </details>
      </div>
    `;
  }
  
  console.log('✅ Display complete');
}

function logPlanner(message, type = 'info') {
  const logBody = document.getElementById('plannerLogBody');
  if (!logBody) return;
  
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = message;
  logBody.appendChild(entry);
  logBody.scrollTop = logBody.scrollHeight;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GENERATOR AGENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function sendToGenerator() {
  console.log('📤 sendToGenerator() called');
  
  // Check if plan exists
  if (!window.currentPlan) {
    showToast('No plan available. Run Planner first.', 'error');
    console.error('❌ No plan in window.currentPlan');
    return;
  }

  console.log('✅ Plan found:', window.currentPlan);

  // Extract baseUrl from plan
  let baseUrl = window.currentPlan.baseUrl;
  
  // If no baseUrl, try to get it from scenarios or inspection data
  if (!baseUrl && window.currentPlan._inspection) {
    baseUrl = window.currentPlan._inspection.url;
  }
  
  if (!baseUrl && window.currentPlannerScenarios) {
    baseUrl = window.currentPlannerScenarios.baseUrl;
  }

  console.log('🌐 Extracted baseUrl:', baseUrl);

  // Switch to Generator tab
  switchTab('generator');
  
  // Auto-fill generator form
  const urlInput = document.getElementById('generatorBaseUrl');
  if (urlInput && baseUrl) {
    urlInput.value = baseUrl;
    console.log('✅ Filled URL input with:', baseUrl);
  }

  // Set language
  const langSelect = document.getElementById('generatorLanguage');
  if (langSelect) {
    langSelect.value = window.currentPlan.language || 'typescript';
    console.log('✅ Set language to:', langSelect.value);
  }

  // Populate plan textarea
  const planTextarea = document.getElementById('generatorPlan');
  if (planTextarea) {
    planTextarea.value = JSON.stringify(window.currentPlan, null, 2);
    console.log('✅ Populated plan textarea');
  }

  // Show success message and auto-trigger generator
  showToast(`Plan loaded! Starting generator for ${window.currentPlan.totalPlans || 1} scenarios...`, 'success');
  
  console.log('✅ Generator tab ready. Auto-triggering runGenerator...');

  // Auto-trigger the generator
  setTimeout(() => runGenerator(), 500);
}

async function runGenerator() {
  const btn = document.getElementById('generatorRunBtn');
  
  // Prevent double-click
  if (btn && btn.disabled) {
    console.log('⚠️ Generator already running, ignoring click');
    showToast('Generator is already running...', 'warning');
    return;
  }

  try {
    // Get form values
    const url = document.getElementById('generatorBaseUrl')?.value.trim();
    const language = document.getElementById('generatorLanguage')?.value || 'typescript';
    const headed = document.getElementById('generatorHeaded')?.value === 'true';
    const customInstructions = document.getElementById('generatorInstructions')?.value.trim();

    // Check if plan exists
    if (!window.currentPlan) {
      showToast('No test plan found. Run Planner first.', 'error');
      return;
    }

    if (!url) {
      showToast('Please enter a base URL', 'error');
      return;
    }

    console.log('🚀 Starting generator with:', {
      url,
      language,
      headed,
      hasPlan: !!window.currentPlan,
      planType: window.currentPlan.testPlans ? 'scenarios-based' : 'manual'
    });

    // Disable button
    btn.disabled = true;
    btn.innerHTML = '<span class="loading-dots"><span></span><span></span><span></span></span> Generating...';

    // Clear previous output
    document.getElementById('generatorOutput').innerHTML = 
      '<div class="loading-state"><div class="loading-icon">⚡</div><p>Generator Agent is working...</p></div>';

    // Prepare request body
    const requestBody = {
      plan: window.currentPlan,
      url: url,
      baseUrl: url,
      language: language,
      headed: headed,
      customInstructions: customInstructions || undefined,
    };

    console.log('📡 Calling generator endpoint...');

    // Call generator endpoint
    const response = await fetch('http://localhost:5000/agent/generator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    console.log('📡 Response status:', response.status, response.statusText);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Handle streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let generatedFiles = null;

    console.log('📖 Reading stream...');

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log('✅ Stream complete');
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            console.log('📦 Received:', data.type, data);
            
            if (data.type === 'done') {
              generatedFiles = data.result?.files || data.files;
              logGenerator('✅ Generation complete!');
            } else if (data.type === 'error') {
              throw new Error(data.message);
            } else if (data.type === 'status') {
              logGenerator(`📝 ${data.message}`);
            }
          } catch (parseError) {
            console.error('❌ Parse error:', parseError, 'Line:', line);
          }
        }
      }
    }

    if (!generatedFiles) {
      throw new Error('No files generated');
    }

    console.log('✅ Generated files:', generatedFiles);

    // Display generated files
    displayGeneratorOutput(generatedFiles);
    
    showToast(`Generated ${generatedFiles.length} files successfully!`, 'success');

  } catch (error) {
    console.error('❌ Generator error:', error);
    logGenerator(`❌ Error: ${error.message}`, 'error');
    showToast(`Error: ${error.message}`, 'error');
    
    // Show error in output
    document.getElementById('generatorOutput').innerHTML = `
      <div style="padding:20px; color:#dc3545;">
        <h3>❌ Error</h3>
        <p>${error.message}</p>
        <p style="margin-top:10px; color:#666;">Check server console for more details.</p>
      </div>
    `;
  } finally {
    // Always reset button
    console.log('🔄 Resetting button...');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="btn-icon">▶</span> Run Generator Agent';
    }
  }
}

function displayGeneratorOutput(files) {
  const output = document.getElementById('generatorOutput');
  if (!output) return;

  console.log('🎨 Displaying generated files:', files);

  let html = `
    <div style="padding:20px;">
      <h3 style="color:#28a745; margin-bottom:20px;">✅ Generated ${files.length} Files</h3>
  `;

  files.forEach((file, index) => {
    const fileType = file.type === 'page-object' ? '📄 Page Object' : 
                     file.type === 'test-spec' ? '🧪 Test Spec' : 
                     '📝 File';
    
    html += `
      <div style="margin-bottom:20px; border:1px solid #ddd; border-radius:8px; overflow:hidden;">
        <div style="background:#f8f9fa; padding:12px; font-weight:600; display:flex; justify-content:space-between; align-items:center;">
          <span>${fileType}: ${file.filename}</span>
          <button onclick="copyToClipboard('file-${index}')" style="padding:6px 12px; background:#667eea; color:white; border:none; border-radius:4px; cursor:pointer;">
            📋 Copy
          </button>
        </div>
        <pre id="file-${index}" style="margin:0; padding:15px; background:#1e1e1e; color:#fff; overflow:auto; max-height:400px; font-size:0.85rem; font-family:'JetBrains Mono', monospace;">${escapeHtml(file.content)}</pre>
      </div>
    `;
  });

  html += `
      <div style="margin-top:20px; padding:15px; background:#d1ecf1; border-radius:8px; border-left:4px solid #0c5460; color:#0c5460;">
        <div style="font-weight:600; margin-bottom:8px;">✅ Files Saved</div>
        <div style="font-size:0.9rem;">
          All files have been automatically saved to your project directory. You can now run them with Playwright!
        </div>
      </div>
    </div>
  `;

  output.innerHTML = html;
}

function logGenerator(message, type = 'info') {
  const logBody = document.getElementById('generatorLogBody');
  if (!logBody) return;
  
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = message;
  logBody.appendChild(entry);
  logBody.scrollTop = logBody.scrollHeight;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INITIALIZATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

console.log('✅ Complete script.js loaded');
console.log('✅ All utility functions available');
console.log('✅ Planner, Generator, and Healer functions ready');