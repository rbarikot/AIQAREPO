import { chromium } from "playwright";

/**
 * Enhanced browser inspector that actually PERFORMS user actions
 * before generating tests. This ensures tests are based on REAL app behavior.
 */
export async function inspectPage(url, options = {}) {
  const { headed = false, timeout = 15000, userActions = null } = options;

  const browser = await chromium.launch({
    headless: !headed,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  });

  const page = await context.newPage();
  const networkRequests = [];
  
  page.on("request", (req) => {
    if (["xhr", "fetch"].includes(req.resourceType())) {
      networkRequests.push({ method: req.method(), url: req.url() });
    }
  });

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout });
  } catch (navError) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout });
      await page.waitForTimeout(2000);
    } catch (fallbackError) {
      await browser.close();
      if (fallbackError.message.includes("net::ERR_NAME_NOT_RESOLVED")) {
        throw new Error(`Cannot resolve domain. The URL "${url}" does not exist or is unreachable.`);
      } else if (fallbackError.message.includes("net::ERR_CONNECTION_REFUSED")) {
        throw new Error(`Connection refused. The server at "${url}" is not responding.`);
      } else if (fallbackError.message.includes("net::ERR_CONNECTION_TIMED_OUT") || fallbackError.message.includes("Timeout")) {
        throw new Error(`Timeout. The URL "${url}" took too long to respond (${timeout}ms limit).`);
      } else if (fallbackError.message.includes("net::ERR_CERT")) {
        throw new Error(`SSL certificate error for "${url}". The site may have an invalid certificate.`);
      } else {
        throw new Error(`Failed to navigate to "${url}": ${fallbackError.message}`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // MULTI-STEP JOURNEY EXECUTION
  // ═══════════════════════════════════════════════════════════════
  const journey = [];

  // Step 1: Capture initial page state
  const step1 = await capturePageState(page, "Initial Page Load", url);
  journey.push(step1);

  // Execute user-provided actions if any
  if (userActions && Array.isArray(userActions) && userActions.length > 0) {
    for (let i = 0; i < userActions.length; i++) {
      const action = userActions[i];
      console.log(`Executing action ${i + 1}/${userActions.length}: ${action.description || action.type}`);
      
      try {
        await executeAction(page, action);
        await page.waitForTimeout(800); // Wait for any transitions
        
        const stepData = await capturePageState(page, action.description || `Action ${i + 1}`, page.url());
        journey.push(stepData);
      } catch (actionErr) {
        console.warn(`Action ${i + 1} failed:`, actionErr.message);
        // Still try to capture state even if action failed
        try {
          const stepData = await capturePageState(page, action.description || `Action ${i + 1}`, page.url());
          stepData.actionError = actionErr.message;
          journey.push(stepData);
        } catch (captureErr) {
          console.warn(`Could not capture state after failed action:`, captureErr.message);
          journey.push({
            stepName: action.description || `Action ${i + 1}`,
            error: actionErr.message,
            url: page.url(),
          });
        }
        // Continue to next action
      }
    }
  }

  await browser.close();

  // Return comprehensive journey data
  return {
    url,
    journey,
    totalSteps: journey.length,
    networkRequests: networkRequests.slice(0, 20),
    inspectedAt: new Date().toISOString(),
  };
}

/**
 * Capture the current state of the page
 */
async function capturePageState(page, stepName, url) {
  let screenshotBase64 = null;
  
  try {
    const screenshotBuffer = await page.screenshot({ 
      fullPage: false, 
      type: "png",
      timeout: 8000  // Shorter timeout for screenshots
    });
    screenshotBase64 = screenshotBuffer.toString("base64");
  } catch (screenshotErr) {
    console.warn(`Screenshot failed for ${stepName}:`, screenshotErr.message);
    // Continue without screenshot
  }
  
  const pageTitle = await page.title().catch(() => "Unknown");
  const pageUrl = page.url();

  // Extract elements with retry for freshly loaded pages
  let elements = { inputs: [], buttons: [], links: [], selects: [], checkboxes: [], textareas: [], forms: [], headings: [], alerts: [] };
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    try {
      elements = await extractElements(page);
      
      // If we got some elements, we're done
      if (elements.buttons.length > 0 || elements.links.length > 0 || elements.inputs.length > 0) {
        break;
      }
      
      // If empty and this isn't our last attempt, wait and retry
      if (attempts < maxAttempts - 1) {
        console.log(`Element extraction returned empty arrays, waiting 1s and retrying (attempt ${attempts + 1}/${maxAttempts})`);
        await page.waitForTimeout(1000);
      }
    } catch (err) {
      console.warn(`Element extraction attempt ${attempts + 1} failed:`, err.message);
      if (attempts === maxAttempts - 1) {
        // Last attempt failed, return empty
        break;
      }
      await page.waitForTimeout(1000);
    }
    attempts++;
  }
  
  const pageStructure = await detectPageType(page).catch(() => ({
    hasLoginForm: false,
    hasSearchBar: false,
    hasNavigation: false,
    hasPagination: false,
    hasModal: false,
    pageType: "unknown"
  }));

  return {
    stepName,
    url: pageUrl,
    title: pageTitle,
    screenshotBase64,
    elements,
    pageStructure,
  };
}

/**
 * Execute a single action on the page
 */
async function executeAction(page, action) {
  const { type, selector, value, text, role, label, placeholder, testId, wait } = action;
  const timeout = 10000; // 10 second timeout for actions

  switch (type) {
    case "fill":
    case "type":
      // Find input by selector, label, placeholder, or testId
      let inputLocator;
      if (selector) inputLocator = page.locator(selector);
      else if (testId) inputLocator = page.getByTestId(testId);
      else if (label) inputLocator = page.getByLabel(label, { exact: false });
      else if (placeholder) inputLocator = page.getByPlaceholder(placeholder, { exact: false });
      else if (role) inputLocator = page.getByRole(role);
      else throw new Error("Fill action requires selector, label, placeholder, testId, or role");
      
      await inputLocator.fill(value || "", { timeout });
      break;

    case "click":
      // Find button/link by text, role, selector, or testId
      let clickLocator;
      let found = false;
      
      if (selector) {
        clickLocator = page.locator(selector);
        found = true;
      } else if (testId) {
        clickLocator = page.getByTestId(testId);
        found = true;
      } else if (text) {
        // Try multiple strategies in order of preference
        const strategies = [
          { role: "button", name: text },
          { role: "link", name: text },
          { role: "menuitem", name: text },
          { role: "tab", name: text },
        ];
        
        for (const strategy of strategies) {
          clickLocator = page.getByRole(strategy.role, { name: strategy.name, exact: false });
          const count = await clickLocator.count().catch(() => 0);
          if (count > 0) {
            console.log(`Found "${text}" as ${strategy.role}`);
            found = true;
            break;
          }
        }
        
        // Last resort: find by text anywhere
        if (!found) {
          clickLocator = page.getByText(text, { exact: false });
          const count = await clickLocator.count().catch(() => 0);
          if (count > 0) {
            console.log(`Found "${text}" by text content`);
            found = true;
          }
        }
        
        if (!found) {
          throw new Error(`Could not find clickable element with text "${text}" using any strategy (button, link, menuitem, tab, or text)`);
        }
      } else if (role && label) {
        clickLocator = page.getByRole(role, { name: label, exact: false });
        found = true;
      } else if (role) {
        clickLocator = page.getByRole(role);
        found = true;
      } else {
        throw new Error("Click action requires text, selector, testId, or role");
      }
      
      await clickLocator.click({ timeout });
      
      // Wait for navigation if specified
      if (wait === "navigation" || wait === "load") {
        // Wait for navigation to complete
        await page.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(2000); // Additional wait for dynamic content
        
        // Try to wait for network idle, but don't fail if it times out
        await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {
          console.log("Network idle timeout - page may still be loading background resources");
        });
      } else {
        // For non-navigation clicks, short wait for any DOM updates
        await page.waitForTimeout(500);
      }
      break;

    case "select":
      let selectLocator;
      if (selector) selectLocator = page.locator(selector);
      else if (label) selectLocator = page.getByLabel(label, { exact: false });
      else throw new Error("Select action requires selector or label");
      
      await selectLocator.selectOption(value || "", { timeout });
      break;

    case "check":
    case "uncheck":
      let checkLocator;
      if (selector) checkLocator = page.locator(selector);
      else if (label) checkLocator = page.getByLabel(label, { exact: false });
      else throw new Error("Check/uncheck action requires selector or label");
      
      if (type === "check") await checkLocator.check({ timeout });
      else await checkLocator.uncheck({ timeout });
      break;

    case "wait":
      await page.waitForTimeout(value || 1000);
      break;

    default:
      throw new Error(`Unknown action type: ${type}`);
  }
}

/**
 * Extract all interactive elements from the page
 */
async function extractElements(page) {
  return await page.evaluate(() => {
    const results = {
      inputs: [],
      buttons: [],
      links: [],
      selects: [],
      checkboxes: [],
      textareas: [],
      forms: [],
      headings: [],
      alerts: [],
    };

    function getBestLocator(el) {
      const strategies = [];
      const tag = el.tagName.toLowerCase();
      const testId = el.getAttribute("data-testid") || el.getAttribute("data-test") || el.getAttribute("data-cy");
      const id = el.id;
      const name = el.getAttribute("name");
      const placeholder = el.getAttribute("placeholder");
      const ariaLabel = el.getAttribute("aria-label");
      const type = el.getAttribute("type");
      
      // For inputs
      if (tag === "input" || tag === "textarea") {
        const labelEl = id ? document.querySelector(`label[for="${id}"]`) : null;
        const wrappingLabel = el.closest("label");
        const labelText = labelEl?.textContent?.trim() || wrappingLabel?.textContent?.trim();
        
        if (testId) strategies.push({ strategy: "getByTestId", value: testId, priority: 1 });
        if (labelText) strategies.push({ strategy: "getByLabel", value: labelText, priority: 2 });
        if (placeholder) strategies.push({ strategy: "getByPlaceholder", value: placeholder, priority: 3 });
        if (ariaLabel) strategies.push({ strategy: "getByRole", value: `${tag}, { name: '${ariaLabel}' }`, priority: 2 });
        if (name) strategies.push({ strategy: "locator", value: `[name="${name}"]`, priority: 5 });
        if (id) strategies.push({ strategy: "locator", value: `#${id}`, priority: 6 });
      }
      
      // For buttons
      if (tag === "button" || type === "submit" || type === "button") {
        const text = el.textContent?.trim();
        if (testId) strategies.push({ strategy: "getByTestId", value: testId, priority: 1 });
        if (text && text.length < 50) strategies.push({ strategy: "getByRole", value: `button, { name: '${text}' }`, priority: 2 });
        if (ariaLabel) strategies.push({ strategy: "getByRole", value: `button, { name: '${ariaLabel}' }`, priority: 2 });
        if (id) strategies.push({ strategy: "locator", value: `#${id}`, priority: 6 });
      }
      
      // For links
      if (tag === "a") {
        const text = el.textContent?.trim();
        if (testId) strategies.push({ strategy: "getByTestId", value: testId, priority: 1 });
        if (text && text.length < 50) strategies.push({ strategy: "getByRole", value: `link, { name: '${text}' }`, priority: 2 });
      }

      return strategies.sort((a, b) => a.priority - b.priority)[0] || { strategy: "locator", value: tag, priority: 99 };
    }

    function isVisible(el) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    }

    // Extract inputs
    document.querySelectorAll("input:not([type=hidden])").forEach((el) => {
      if (!isVisible(el)) return;
      const labelEl = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
      const wrappingLabel = el.closest("label");
      results.inputs.push({
        type: el.type || "text",
        id: el.id || null,
        name: el.name || null,
        placeholder: el.placeholder || null,
        ariaLabel: el.getAttribute("aria-label") || null,
        label: labelEl?.textContent?.trim() || wrappingLabel?.textContent?.trim() || null,
        required: el.required,
        value: el.value || null,
        testId: el.getAttribute("data-testid") || el.getAttribute("data-test") || null,
        bestLocator: getBestLocator(el),
      });
    });

    // Extract buttons
    document.querySelectorAll("button, input[type=submit], input[type=button], [role=button]").forEach((el) => {
      if (!isVisible(el)) return;
      results.buttons.push({
        text: el.textContent?.trim() || el.value || null,
        type: el.getAttribute("type") || "button",
        ariaLabel: el.getAttribute("aria-label") || null,
        disabled: el.disabled || false,
        testId: el.getAttribute("data-testid") || el.getAttribute("data-test") || null,
        bestLocator: getBestLocator(el),
      });
    });

    // Extract links
    document.querySelectorAll("a[href]").forEach((el) => {
      if (!isVisible(el)) return;
      const text = el.textContent?.trim();
      if (!text || text.length > 80) return;
      results.links.push({
        text,
        href: el.href,
        bestLocator: getBestLocator(el),
      });
    });
    
    // Also extract navigation menu items (might be divs/spans with click handlers)
    document.querySelectorAll('[role="menuitem"], [role="tab"], nav a, .nav-link, .menu-item, [class*="menu"] a, [class*="nav"] a').forEach((el) => {
      if (!isVisible(el)) return;
      const text = el.textContent?.trim();
      if (!text || text.length > 80) return;
      // Check if already in links
      const alreadyAdded = results.links.some(l => l.text === text);
      if (!alreadyAdded) {
        const role = el.getAttribute('role');
        results.links.push({
          text,
          href: el.href || '#',
          role: role || null,
          bestLocator: role ? { strategy: "getByRole", value: `${role}, { name: '${text}' }`, priority: 2 } : getBestLocator(el),
        });
      }
    });

    // Extract selects
    document.querySelectorAll("select").forEach((el) => {
      if (!isVisible(el)) return;
      const labelEl = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
      results.selects.push({
        name: el.name || null,
        label: labelEl?.textContent?.trim() || null,
        options: Array.from(el.options).map((o) => ({ value: o.value, text: o.text })),
        bestLocator: getBestLocator(el),
      });
    });

    // Extract checkboxes/radios
    document.querySelectorAll("input[type=checkbox], input[type=radio]").forEach((el) => {
      if (!isVisible(el)) return;
      const labelEl = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
      results.checkboxes.push({
        type: el.type,
        name: el.name || null,
        label: labelEl?.textContent?.trim() || null,
        checked: el.checked,
        bestLocator: getBestLocator(el),
      });
    });

    // Extract textareas
    document.querySelectorAll("textarea").forEach((el) => {
      if (!isVisible(el)) return;
      const labelEl = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
      results.textareas.push({
        name: el.name || null,
        placeholder: el.placeholder || null,
        label: labelEl?.textContent?.trim() || null,
        bestLocator: getBestLocator(el),
      });
    });

    // Extract forms
    document.querySelectorAll("form").forEach((el, i) => {
      results.forms.push({
        id: el.id || `form-${i}`,
        action: el.action || null,
        method: el.method || "get",
        fieldCount: el.querySelectorAll("input, select, textarea").length,
      });
    });

    // Extract headings
    document.querySelectorAll("h1, h2, h3").forEach((el) => {
      const text = el.textContent?.trim();
      if (text) results.headings.push({ level: el.tagName, text });
    });

    // Extract alerts/messages
    document.querySelectorAll('[role=alert], .error, .alert, .message, [class*="error"], [class*="alert"]').forEach((el) => {
      if (!isVisible(el)) return;
      const text = el.textContent?.trim().substring(0, 200);
      if (text) results.alerts.push({ text, selector: el.getAttribute("class") || el.tagName });
    });

    return results;
  });
}

/**
 * Detect the type of page we're on
 */
async function detectPageType(page) {
  return await page.evaluate(() => {
    const meta = {
      hasLoginForm: false,
      hasSearchBar: false,
      hasNavigation: false,
      hasPagination: false,
      hasModal: false,
      pageType: "unknown",
    };

    if (document.querySelector("input[type=password]")) meta.hasLoginForm = true;
    if (document.querySelector("input[type=search], [role=search]")) meta.hasSearchBar = true;
    if (document.querySelector("nav, [role=navigation]")) meta.hasNavigation = true;
    if (document.querySelector("[aria-label*=pagination], .pagination")) meta.hasPagination = true;
    if (document.querySelector("[role=dialog], .modal, [class*=modal]")) meta.hasModal = true;

    const url = window.location.href.toLowerCase();
    if (meta.hasLoginForm) meta.pageType = "authentication";
    else if (url.includes("dashboard") || url.includes("home")) meta.pageType = "dashboard";
    else if (url.includes("product") || url.includes("shop")) meta.pageType = "ecommerce";
    else if (url.includes("form") || url.includes("contact")) meta.pageType = "form";
    else if (url.includes("search")) meta.pageType = "search";
    else if (meta.hasNavigation) meta.pageType = "multi-page-app";

    return meta;
  });
}

/**
 * Format multi-step journey into AI-readable summary
 */
export function formatInspectionForAI(inspection) {
  if (!inspection) {
    return "No inspection data available.";
  }
  
  if (!inspection.journey || !Array.isArray(inspection.journey) || inspection.journey.length === 0) {
    return "No inspection data available.";
  }

  let summary = `MULTI-STEP BROWSER JOURNEY INSPECTION
Total Steps Executed: ${inspection.totalSteps || inspection.journey.length}
Inspected At: ${inspection.inspectedAt || new Date().toISOString()}

`;

  const formatLocator = (loc) => {
    if (!loc || !loc.strategy) return "locator('element')";
    return `page.${loc.strategy}(${JSON.stringify(loc.value || "")})`;
  };

  inspection.journey.forEach((step, idx) => {
    if (step.error) {
      summary += `
═══════════════════════════════════════════════════════════════
STEP ${idx + 1}: ${step.stepName} — ❌ FAILED
Error: ${step.error}
URL: ${step.url}
═══════════════════════════════════════════════════════════════

`;
      return;
    }

    const pageType = step.pageStructure?.pageType || "unknown";
    const elements = step.elements || { inputs: [], buttons: [], links: [], alerts: [], headings: [] };
    const hasError = step.actionError || step.error;
    
    summary += `
═══════════════════════════════════════════════════════════════
STEP ${idx + 1}: ${step.stepName}
URL: ${step.url || "unknown"}
Title: ${step.title || "unknown"}
Page Type: ${pageType}
${hasError ? `⚠️ Note: ${step.actionError || step.error}` : ""}
═══════════════════════════════════════════════════════════════

INPUTS (${elements.inputs?.length || 0}):
${(elements.inputs && elements.inputs.length > 0) ? elements.inputs.map(i => `  - Type: ${i.type || "text"} | Label: "${i.label || i.placeholder || "unnamed"}" | Required: ${i.required || false}
    Locator: ${i.bestLocator ? formatLocator(i.bestLocator) : "locator('input')"}`).join("\n") : "  (none)"}

BUTTONS (${elements.buttons?.length || 0}):
${(elements.buttons && elements.buttons.length > 0) ? elements.buttons.map(b => `  - Text: "${b.text || b.ariaLabel || "unnamed"}" | Disabled: ${b.disabled || false}
    Locator: ${b.bestLocator ? formatLocator(b.bestLocator) : "locator('button')"}`).join("\n") : "  (none)"}

${(elements.links && elements.links.length > 0) ? `LINKS (${elements.links.length > 8 ? "first 8" : elements.links.length}):
${elements.links.slice(0, 8).map(l => `  - "${l.text || "unnamed"}" → ${l.href || "#"}`).join("\n")}` : ""}

${(elements.alerts && elements.alerts.length > 0) ? `ALERTS/MESSAGES:
${elements.alerts.map(a => `  - ${a.text || "alert"}`).join("\n")}` : ""}

${(elements.headings && elements.headings.length > 0) ? `HEADINGS:
${elements.headings.slice(0, 5).map(h => `  ${h.level || "h1"}: "${h.text || "heading"}"`).join("\n")}` : ""}

`;
  });

  return summary;
}