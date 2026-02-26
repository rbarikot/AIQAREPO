// ═══════════════════════════════════════════════════════════════
//  AI QA Agent System — Frontend Controller
// ═══════════════════════════════════════════════════════════════

let plannerResult = null;
let generatorResult = null;
let healerResult = null;
let activeFileIndex = 0;

window.addEventListener("DOMContentLoaded", () => {
  checkApiHealth();
  setInterval(checkApiHealth, 30000);
});

async function checkApiHealth() {
  const badge = document.getElementById("apiStatus");
  try {
    const res = await fetch("/health");
    const data = await res.json();
    badge.textContent = data.apiKeyConfigured ? "● Connected" : "⚠ No API Key";
    badge.className = `status-badge ${data.apiKeyConfigured ? "connected" : "error"}`;
  } catch {
    badge.textContent = "● Offline";
    badge.className = "status-badge error";
  }
}

// ── Tab Navigation ─────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll(".tab-section").forEach((s) => s.classList.remove("active"));
  document.querySelectorAll(".pipeline-step").forEach((s) => s.classList.remove("active"));
  document.getElementById(`tab-${name}`).classList.add("active");
  ({ planner: "pipe-1", generator: "pipe-2", healer: "pipe-3" }[name] &&
    document.getElementById({ planner: "pipe-1", generator: "pipe-2", healer: "pipe-3" }[name]).classList.add("active"));
}

function syncLanguage(lang) {
  document.getElementById("generatorLanguage").value = lang;
  document.getElementById("healerLanguage").value = lang;
}

// ── SSE Stream Consumer ────────────────────────────────────────
async function consumeStream(url, body, logBodyId, logId, handlers) {
  const logEl = document.getElementById(logId);
  const logBody = document.getElementById(logBodyId);
  logEl.style.display = "block";
  logBody.innerHTML = "";

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Server error" }));
    throw new Error(err.error || "Server error");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const evt = JSON.parse(line.slice(6));
        if (evt.type === "status") addLogEntry(logBody, evt.message, "info");
        else if (evt.type === "error") {
          addLogEntry(logBody, `❌ ${evt.message}`, "error");
          handlers.onError?.(evt.message);
        } else if (handlers[evt.type]) {
          handlers[evt.type](evt);
        }
      } catch {}
    }
  }
}

function addLogEntry(container, message, type = "info") {
  const el = document.createElement("div");
  el.className = `log-entry log-${type}`;
  el.textContent = message;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

// ── Screenshot display helper ─────────────────────────────────
function showScreenshot(panelId, imgId, metaId, badgesId, base64, inspectionInfo) {
  const panel = document.getElementById(panelId);
  const img = document.getElementById(imgId);
  const meta = document.getElementById(metaId);
  const badges = document.getElementById(badgesId);

  panel.style.display = "block";
  img.src = `data:image/png;base64,${base64}`;

  if (inspectionInfo) {
    meta.textContent = `${inspectionInfo.title || ""} — ${inspectionInfo.pageType || ""}`;
    badges.innerHTML = [
      { label: "Inputs", count: inspectionInfo.elements?.inputs, icon: "📝" },
      { label: "Buttons", count: inspectionInfo.elements?.buttons, icon: "🔘" },
      { label: "Links", count: inspectionInfo.elements?.links, icon: "🔗" },
      { label: "Forms", count: inspectionInfo.elements?.forms, icon: "📋" },
    ]
      .filter((b) => b.count > 0)
      .map((b) => `<span class="elem-badge">${b.icon} ${b.count} ${b.label}</span>`)
      .join("");
  }
}

// ═══════════════════════════════════════════════════════════════
//  PAGE PREVIEW (standalone inspect)
// ═══════════════════════════════════════════════════════════════
async function previewPage() {
  const url = document.getElementById("plannerUrl").value.trim();
  if (!url) { showToast("Enter a URL first", "error"); return; }

  const modal = document.getElementById("previewModal");
  const content = document.getElementById("previewContent");
  const title = document.getElementById("previewTitle");

  modal.classList.add("active");
  content.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
  title.textContent = `Inspecting ${url}...`;

  let screenshotBase64 = null;
  let inspData = null;

  try {
    const res = await fetch("/agent/inspect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.type === "screenshot") screenshotBase64 = evt.base64;
          if (evt.type === "done") inspData = evt;
          if (evt.type === "error") throw new Error(evt.message);
        } catch (e) { if (e.message !== "Unexpected token") throw e; }
      }
    }

    title.textContent = inspData?.title || url;

    const inputRows = (inspData?.elements?.inputs || []).slice(0, 8).map((i) =>
      `<tr><td>${i.type}</td><td>${i.label || i.placeholder || "-"}</td><td><code>${i.bestLocator.strategy}(${JSON.stringify(i.bestLocator.value)})</code></td></tr>`
    ).join("");

    const btnRows = (inspData?.elements?.buttons || []).slice(0, 8).map((b) =>
      `<tr><td>${b.text || "-"}</td><td><code>${b.bestLocator.strategy}(${JSON.stringify(b.bestLocator.value)})</code></td></tr>`
    ).join("");

    content.innerHTML = `
      <div class="preview-grid">
        <div class="preview-screenshot-col">
          ${screenshotBase64 ? `<img src="data:image/png;base64,${screenshotBase64}" class="preview-screenshot" />` : "<p>No screenshot</p>"}
        </div>
        <div class="preview-elements-col">
          <div class="preview-badges">
            <span class="elem-badge">📝 ${inspData?.elements?.inputs?.length || 0} Inputs</span>
            <span class="elem-badge">🔘 ${inspData?.elements?.buttons?.length || 0} Buttons</span>
            <span class="elem-badge">🔗 ${inspData?.elements?.links?.length || 0} Links</span>
            <span class="elem-badge">📋 ${inspData?.elements?.forms?.length || 0} Forms</span>
            <span class="elem-badge type-badge">${inspData?.pageStructure?.pageType || "unknown"}</span>
          </div>

          ${inputRows ? `
          <h4>Input Fields</h4>
          <div class="table-wrap">
            <table class="elem-table">
              <thead><tr><th>Type</th><th>Label</th><th>Playwright Locator</th></tr></thead>
              <tbody>${inputRows}</tbody>
            </table>
          </div>` : ""}

          ${btnRows ? `
          <h4>Buttons</h4>
          <div class="table-wrap">
            <table class="elem-table">
              <thead><tr><th>Text</th><th>Playwright Locator</th></tr></thead>
              <tbody>${btnRows}</tbody>
            </table>
          </div>` : ""}
        </div>
      </div>`;
  } catch (err) {
    content.innerHTML = `<div class="error-card">❌ ${err.message}</div>`;
    showToast(err.message, "error");
  }
}

function closePreview(e) {
  if (e.target === document.getElementById("previewModal")) closePreviewBtn();
}
function closePreviewBtn() {
  document.getElementById("previewModal").classList.remove("active");
}

// ═══════════════════════════════════════════════════════════════
//  PLANNER AGENT
// ═══════════════════════════════════════════════════════════════
async function runPlanner() {
  const feature = document.getElementById("plannerFeature").value.trim();
  if (!feature) { showToast("Please enter a feature description", "error"); return; }

  const btn = document.getElementById("plannerRunBtn");
  setButtonLoading(btn, true, "Running...");
  document.getElementById("plannerOutput").innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
  document.getElementById("plannerActions").style.display = "none";
  document.getElementById("screenshotPanel").style.display = "none";

  const body = {
    feature,
    url: document.getElementById("plannerUrl").value.trim(),
    testType: document.getElementById("plannerTestType").value,
    includeNegative: document.getElementById("plannerNegative").checked,
    includeEdge: document.getElementById("plannerEdge").checked,
    language: document.getElementById("globalLanguage").value,
    headed: document.getElementById("plannerHeaded").value === "true",
  };

  let capturedInspection = null;

  try {
    await consumeStream("/agent/planner", body, "plannerLogBody", "plannerLog", {
      screenshot: (evt) => {
        // Show screenshot as soon as it arrives (final step)
        document.getElementById("screenshotPanel").style.display = "block";
        document.getElementById("screenshotImg").src = `data:image/png;base64,${evt.base64}`;
      },
      inspection: (evt) => {
        capturedInspection = evt;
        
        if (evt.steps && evt.steps > 1) {
          // Multi-step journey
          document.getElementById("screenshotMeta").textContent =
            `Multi-step journey: ${evt.steps} steps executed`;
          document.getElementById("elementBadges").innerHTML = evt.journey.map((step, idx) => 
            `<span class="elem-badge">Step ${idx + 1}: ${step.stepName} (${step.inputs + step.buttons + step.forms} elements)</span>`
          ).join("");
        } else {
          // Single step
          document.getElementById("screenshotMeta").textContent =
            `${evt.title || ""} · ${evt.pageType || ""} page`;
          document.getElementById("elementBadges").innerHTML = [
            { label: "Inputs", count: evt.journey?.[0]?.inputs, icon: "📝" },
            { label: "Buttons", count: evt.journey?.[0]?.buttons, icon: "🔘" },
            { label: "Forms", count: evt.journey?.[0]?.forms, icon: "📋" },
          ]
            .filter((b) => b.count > 0)
            .map((b) => `<span class="elem-badge">${b.icon} ${b.count} ${b.label}</span>`)
            .join("");
        }
      },
      done: (evt) => {
        plannerResult = evt.plan;
        renderPlannerOutput(evt.plan);
        document.getElementById("plannerActions").style.display = "flex";
        showToast("Test plan generated!", "success");
      },
      onError: (msg) => {
        document.getElementById("plannerOutput").innerHTML = `<div class="error-card">❌ ${msg}</div>`;
        showToast(msg, "error");
      },
    });
  } catch (err) {
    document.getElementById("plannerOutput").innerHTML = `<div class="error-card">❌ ${err.message}</div>`;
    showToast(err.message, "error");
  } finally {
    setButtonLoading(btn, false, "▶ Run Planner Agent");
  }
}

function renderPlannerOutput(plan) {
  if (!plan) return;
  const c = document.getElementById("plannerOutput");
  const priorityClass = (p) => ({ High: "priority-high", Medium: "priority-med", Low: "priority-low" }[p] || "priority-low");
  const catIcon = (c) => ({ Positive: "✅", Negative: "❌", "Edge Case": "⚠️", Performance: "⚡", Accessibility: "♿" }[c] || "📋");

  // Check if this plan was from REAL browser inspection
  const isRealInspection = plan._realInspection === true;
  const journeySteps = plan._journeySteps || 0;
  const warningBanner = !isRealInspection ? `
    <div class="warning-banner">
      ⚠️ <strong>Generic Plan</strong> — This plan was NOT generated from real browser inspection. 
      Locators and test data are hypothetical. For accurate tests based on actual page elements, provide a valid URL.
    </div>` : "";

  c.innerHTML = `
    ${warningBanner}
    <div class="plan-summary">
      <div class="summary-item"><strong>Summary</strong><span>${plan.summary || ""}</span></div>
      <div class="summary-stats">
        <span class="stat-pill">${(plan.scenarios || []).length} Scenarios</span>
        <span class="stat-pill">${plan.testType || "e2e"}</span>
        ${plan.pageTitle ? `<span class="stat-pill">📄 ${plan.pageTitle}</span>` : ""}
        ${isRealInspection && journeySteps > 1 ? `<span class="stat-pill stat-verified">✅ ${journeySteps}-Step Journey Executed</span>` : ""}
        ${isRealInspection && journeySteps <= 1 ? '<span class="stat-pill stat-verified">✅ Real Browser Inspection</span>' : ""}
        <span class="stat-pill">${(plan.scenarios || []).filter((s) => s.priority === "High").length} High Priority</span>
      </div>
    </div>

    ${(plan.scenarios || []).map((s, i) => `
      <div class="scenario-card">
        <div class="scenario-header">
          <div class="scenario-id">${s.id || `TC${String(i + 1).padStart(3, "0")}`}</div>
          <h3 class="scenario-title">${s.title}</h3>
          <div class="scenario-badges">
            <span class="badge ${priorityClass(s.priority)}">${s.priority}</span>
            <span class="badge badge-category">${catIcon(s.category)} ${s.category}</span>
          </div>
        </div>
        <p class="scenario-desc">${s.description || ""}</p>
        <div class="scenario-details">
          ${s.preconditions ? `<div class="detail-row"><strong>Preconditions:</strong> ${s.preconditions}</div>` : ""}
          ${s.steps?.length ? `<div class="detail-row"><strong>Steps:</strong><ol class="steps-list">${s.steps.map((st) => `<li>${st}</li>`).join("")}</ol></div>` : ""}
          ${s.expectedResult ? `<div class="detail-row expected"><strong>Expected:</strong> ${s.expectedResult}</div>` : ""}
          ${s.playwrightCode ? `
            <div class="detail-row">
              <strong>Playwright Snippet:</strong>
              <pre class="inline-code"><code class="language-typescript">${escapeHtml(s.playwrightCode)}</code></pre>
            </div>` : ""}
        </div>
      </div>
    `).join("")}

    ${plan.recommendations?.length ? `
      <div class="recommendations-card">
        <h4>📌 Recommendations</h4>
        <ul>${plan.recommendations.map((r) => `<li>${r}</li>`).join("")}</ul>
      </div>` : ""}
  `;

  Prism.highlightAll();
}

function clearPlanner() {
  document.getElementById("plannerFeature").value = "";
  document.getElementById("plannerUrl").value = "";
  document.getElementById("plannerOutput").innerHTML = '<div class="empty-state"><div class="empty-icon">🧠</div><p>Enter a feature + URL and run the Planner Agent.</p></div>';
  document.getElementById("plannerActions").style.display = "none";
  document.getElementById("plannerLog").style.display = "none";
  document.getElementById("screenshotPanel").style.display = "none";
  plannerResult = null;
}

function copyPlan() {
  if (!plannerResult) return;
  navigator.clipboard.writeText(JSON.stringify(plannerResult, null, 2));
  showToast("Plan JSON copied!", "success");
}

function sendToGenerator() {
  if (!plannerResult) return;
  document.getElementById("generatorPlan").value = JSON.stringify(plannerResult, null, 2);
  document.getElementById("generatorLanguage").value = document.getElementById("globalLanguage").value;
  // Pre-fill base URL from planner
  const plannerUrl = document.getElementById("plannerUrl").value.trim();
  if (plannerUrl) document.getElementById("generatorBaseUrl").value = plannerUrl;
  switchTab("generator");
  showToast("Plan sent to Generator Agent!", "success");
}

// ═══════════════════════════════════════════════════════════════
//  GENERATOR AGENT
// ═══════════════════════════════════════════════════════════════
async function runGenerator() {
  const planRaw = document.getElementById("generatorPlan").value.trim();
  if (!planRaw) { showToast("Please provide a test plan JSON", "error"); return; }

  let plan;
  try { plan = JSON.parse(planRaw); }
  catch { showToast("Invalid JSON in test plan field", "error"); return; }

  const btn = document.getElementById("generatorRunBtn");
  setButtonLoading(btn, true, "Generating...");
  document.getElementById("generatorOutput").innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
  document.getElementById("generatorActions").style.display = "none";
  document.getElementById("fileTabs").innerHTML = "";
  document.getElementById("setupBox").style.display = "none";
  document.getElementById("genScreenshotPanel").style.display = "none";

  const body = {
    plan,
    baseUrl: document.getElementById("generatorBaseUrl").value.trim(),
    language: document.getElementById("generatorLanguage").value,
    customInstructions: document.getElementById("generatorInstructions").value.trim(),
    headed: document.getElementById("generatorHeaded").value === "true",
  };

  try {
    await consumeStream("/agent/generator", body, "generatorLogBody", "generatorLog", {
      screenshot: (evt) => {
        document.getElementById("genScreenshotPanel").style.display = "block";
        document.getElementById("genScreenshotImg").src = `data:image/png;base64,${evt.base64}`;
      },
      inspection: (evt) => {
        document.getElementById("genScreenshotMeta").textContent =
          `${evt.title || ""} · ${evt.pageType || ""} page`;
        document.getElementById("genElementBadges").innerHTML = [
          { label: "Inputs", count: evt.elements?.inputs, icon: "📝" },
          { label: "Buttons", count: evt.elements?.buttons, icon: "🔘" },
          { label: "Links", count: evt.elements?.links, icon: "🔗" },
          { label: "Forms", count: evt.elements?.forms, icon: "📋" },
        ]
          .filter((b) => b.count > 0)
          .map((b) => `<span class="elem-badge">${b.icon} ${b.count} ${b.label}</span>`)
          .join("");
      },
      done: (evt) => {
        generatorResult = evt.result;
        renderGeneratorOutput(evt.result);
        document.getElementById("generatorActions").style.display = "flex";
        showToast("Playwright code generated!", "success");
      },
      onError: (msg) => {
        document.getElementById("generatorOutput").innerHTML = `<div class="error-card">❌ ${msg}</div>`;
        showToast(msg, "error");
      },
    });
  } catch (err) {
    document.getElementById("generatorOutput").innerHTML = `<div class="error-card">❌ ${err.message}</div>`;
    showToast(err.message, "error");
  } finally {
    setButtonLoading(btn, false, "▶ Run Generator Agent");
  }
}

function renderGeneratorOutput(result) {
  if (!result?.files?.length) return;
  const lang = result.language || "typescript";
  const prismLang = lang === "typescript" ? "typescript" : "javascript";

  document.getElementById("fileTabs").innerHTML = result.files
    .map((f, i) => `<button class="file-tab ${i === 0 ? "active" : ""}" onclick="showFile(${i})" id="ftab-${i}">
      <span class="file-tab-icon">${f.type === "page-object" ? "📦" : "🧪"}</span>${f.filename}
    </button>`)
    .join("");

  document.getElementById("generatorOutput").innerHTML = result.files
    .map((f, i) => `
      <div class="file-content ${i === 0 ? "visible" : "hidden"}" id="fcontent-${i}">
        <div class="file-meta">
          <div class="file-info">
            <span class="file-type-badge">${f.type === "page-object" ? "Page Object Model" : "Test Spec"}</span>
            <span class="file-name">${f.filename}</span>
          </div>
          <div class="file-copy-btn">
            <button class="btn-sm" onclick="copyFileContent(${i})">📋 Copy</button>
            <button class="btn-sm" onclick="downloadFile(${i})">⬇ Download</button>
          </div>
        </div>
        <pre class="code-block"><code class="language-${prismLang}">${escapeHtml(f.content || "")}</code></pre>
      </div>`)
    .join("");

  if (result.setupInstructions?.length) {
    document.getElementById("setupBox").style.display = "block";
    document.getElementById("setupInstructions").innerHTML = result.setupInstructions
      .map((cmd) => `<code class="setup-cmd">$ ${cmd}</code>`)
      .join("");
  }

  Prism.highlightAll();
  activeFileIndex = 0;
}

function showFile(idx) {
  activeFileIndex = idx;
  document.querySelectorAll(".file-tab").forEach((t, i) => t.classList.toggle("active", i === idx));
  document.querySelectorAll(".file-content").forEach((c, i) => {
    c.classList.toggle("visible", i === idx);
    c.classList.toggle("hidden", i !== idx);
  });
}

function copyFileContent(idx) {
  if (!generatorResult?.files?.[idx]) return;
  navigator.clipboard.writeText(generatorResult.files[idx].content);
  showToast("Code copied!", "success");
}

function downloadFile(idx) {
  if (!generatorResult?.files?.[idx]) return;
  const f = generatorResult.files[idx];
  downloadText(f.content, f.filename.split("/").pop());
}

function downloadAllFiles() {
  if (!generatorResult?.files?.length) return;
  generatorResult.files.forEach((f) => downloadText(f.content, f.filename.split("/").pop()));
  showToast(`Downloading ${generatorResult.files.length} files...`, "success");
}

function sendToHealer() {
  if (!generatorResult?.files?.length) return;
  const spec = generatorResult.files.find((f) => f.type === "test-spec") || generatorResult.files[0];
  document.getElementById("healerCode").value = spec.content;
  document.getElementById("healerLanguage").value = generatorResult.language || "typescript";
  switchTab("healer");
  showToast("Test code sent to Healer Agent!", "success");
}

function clearGenerator() {
  document.getElementById("generatorPlan").value = "";
  document.getElementById("generatorOutput").innerHTML = '<div class="empty-state"><div class="empty-icon">⚡</div><p>Run the Planner Agent first, then send the plan here.</p></div>';
  document.getElementById("generatorActions").style.display = "none";
  document.getElementById("generatorLog").style.display = "none";
  document.getElementById("fileTabs").innerHTML = "";
  document.getElementById("setupBox").style.display = "none";
  document.getElementById("genScreenshotPanel").style.display = "none";
  generatorResult = null;
}

// ═══════════════════════════════════════════════════════════════
//  HEALER AGENT
// ═══════════════════════════════════════════════════════════════
async function runHealer() {
  const code = document.getElementById("healerCode").value.trim();
  const error = document.getElementById("healerError").value.trim();
  if (!code) { showToast("Please paste your broken test code", "error"); return; }
  if (!error) { showToast("Please paste the error message", "error"); return; }

  const btn = document.getElementById("healerRunBtn");
  setButtonLoading(btn, true, "Healing...");
  document.getElementById("healerOutput").innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
  document.getElementById("healerActions").style.display = "none";

  const body = {
    brokenCode: code,
    errorMessage: error,
    htmlSnapshot: document.getElementById("healerHtml").value.trim(),
    language: document.getElementById("healerLanguage").value,
    additionalContext: document.getElementById("healerContext").value.trim(),
  };

  try {
    await consumeStream("/agent/healer", body, "healerLogBody", "healerLog", {
      done: (evt) => {
        healerResult = evt.result;
        renderHealerOutput(evt.result);
        document.getElementById("healerActions").style.display = "flex";
        showToast("Test healed!", "success");
      },
      onError: (msg) => {
        document.getElementById("healerOutput").innerHTML = `<div class="error-card">❌ ${msg}</div>`;
        showToast(msg, "error");
      },
    });
  } catch (err) {
    document.getElementById("healerOutput").innerHTML = `<div class="error-card">❌ ${err.message}</div>`;
    showToast(err.message, "error");
  } finally {
    setButtonLoading(btn, false, "🔍 Run Healing Agent");
  }
}

function renderHealerOutput(result) {
  if (!result) return;
  const lang = document.getElementById("healerLanguage").value;
  const prismLang = lang === "typescript" ? "typescript" : "javascript";
  const confClass = { High: "conf-high", Medium: "conf-med", Low: "conf-low" }[result.confidence] || "conf-low";

  document.getElementById("healerOutput").innerHTML = `
    <div class="heal-section">
      <div class="heal-header">
        <h3>🔬 Diagnosis</h3>
        <span class="confidence-badge ${confClass}">Confidence: ${result.confidence || "Medium"}</span>
      </div>
      <div class="heal-card">
        <div class="diagnosis-row"><strong>Root Cause:</strong><p>${result.rootCause || ""}</p></div>
        <div class="diagnosis-row"><strong>Category:</strong><span class="category-tag">${result.failureCategory || ""}</span></div>
        ${result.analysis ? `<div class="diagnosis-row"><strong>Analysis:</strong><p>${result.analysis}</p></div>` : ""}
      </div>
    </div>

    ${result.changes?.length ? `
    <div class="heal-section">
      <h3>🔧 Changes Made</h3>
      ${result.changes.map((c) => `
        <div class="change-card">
          <div class="change-meta">${c.lineApprox || ""} — ${c.reason || ""}</div>
          <div class="change-diff">
            <div class="diff-row diff-old"><span class="diff-label">Before</span><code>${escapeHtml(c.original || "")}</code></div>
            <div class="diff-row diff-new"><span class="diff-label">After</span><code>${escapeHtml(c.healed || "")}</code></div>
          </div>
        </div>`).join("")}
    </div>` : ""}

    ${result.alternativeSelectors?.length ? `
    <div class="heal-section">
      <h3>🎯 Alternative Selectors</h3>
      <div class="selector-grid">
        ${result.alternativeSelectors.map((s) => `
          <div class="selector-card">
            <div class="selector-strategy">${s.strategy}</div>
            <code class="selector-value">${escapeHtml(s.value || "")}</code>
            <span class="resilience-badge res-${(s.resilience || "").toLowerCase()}">${s.resilience}</span>
          </div>`).join("")}
      </div>
    </div>` : ""}

    <div class="heal-section">
      <div class="heal-header"><h3>✅ Healed Code</h3><button class="btn-sm" onclick="copyHealedCode()">📋 Copy</button></div>
      <pre class="code-block"><code class="language-${prismLang}">${escapeHtml(result.healedCode || "")}</code></pre>
    </div>

    ${result.preventionTips?.length ? `
    <div class="heal-section">
      <h3>🛡️ Prevention Tips</h3>
      <ul class="tips-list">${result.preventionTips.map((t) => `<li>${t}</li>`).join("")}</ul>
    </div>` : ""}
  `;

  Prism.highlightAll();
}

function copyHealedCode() {
  if (!healerResult?.healedCode) return;
  navigator.clipboard.writeText(healerResult.healedCode);
  showToast("Healed code copied!", "success");
}

function downloadHealedCode() {
  if (!healerResult?.healedCode) return;
  const lang = document.getElementById("healerLanguage").value;
  downloadText(healerResult.healedCode, `healed.spec.${lang === "typescript" ? "ts" : "js"}`);
}

function clearHealer() {
  ["healerCode", "healerError", "healerHtml", "healerContext"].forEach((id) => (document.getElementById(id).value = ""));
  document.getElementById("healerOutput").innerHTML = '<div class="empty-state"><div class="empty-icon">💊</div><p>Paste a failing test and its error to get a healed version.</p></div>';
  document.getElementById("healerActions").style.display = "none";
  document.getElementById("healerLog").style.display = "none";
  healerResult = null;
}

// ── Utilities ─────────────────────────────────────────────────
function setButtonLoading(btn, loading, text) {
  btn.disabled = loading;
  btn.innerHTML = loading ? `<span class="spinner-sm"></span> ${text}` : text;
}

function downloadText(content, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = `toast toast-${type} show`;
  setTimeout(() => (toast.className = "toast"), 3000);
}