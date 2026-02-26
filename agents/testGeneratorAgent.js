import OpenAI from "openai";
import { inspectPage, formatInspectionForAI } from "./browserInspector.js";

const TS_PROMPT = `You are a Senior SDET specializing in Playwright TypeScript automation.
You receive REAL multi-step browser journey data showing ACTUAL app behavior across multiple pages.
Generate production-quality tests using ONLY the actual locators found at each step.

CRITICAL: You MUST return BOTH files:
1. A Page Object class file (.ts)
2. A test spec file (.spec.ts)

Return VALID JSON:
{
  "language": "typescript",
  "files": [
    { 
      "filename": "pages/LoginPage.ts", 
      "type": "page-object", 
      "content": "import { Page } from '@playwright/test';\\n\\nexport class LoginPage {\\n  constructor(private page: Page) {}\\n  // ... methods\\n}"
    },
    { 
      "filename": "tests/login.spec.ts", 
      "type": "test-spec", 
      "content": "import { test, expect } from '@playwright/test';\\nimport { LoginPage } from '../pages/LoginPage';\\n\\ntest.describe('Login Tests', () => {\\n  // ... tests\\n});"
    }
  ],
  "setupInstructions": ["npm install @playwright/test", "npx playwright install chromium"],
  "testCount": 5
}

Rules:
- ALWAYS generate EXACTLY 2 files: page-object AND test-spec
- Use TypeScript with proper types
- Use ONLY real locators from journey inspection
- Tests must follow the actual journey flow observed
- Each test must be fully independent
- DO NOT generate just the page object - the test spec is mandatory`;

const JS_PROMPT = `You are a Senior SDET specializing in Playwright JavaScript automation.
You receive REAL multi-step browser journey data. Generate tests using ONLY actual locators.

CRITICAL: You MUST return BOTH files:
1. A Page Object class file (.js)
2. A test spec file (.spec.js)

Return VALID JSON:
{
  "language": "javascript",
  "files": [
    { "filename": "pages/LoginPage.js", "type": "page-object", "content": "..." },
    { "filename": "tests/login.spec.js", "type": "test-spec", "content": "..." }
  ],
  "setupInstructions": ["npm install @playwright/test"],
  "testCount": 5
}

Rules:
- ALWAYS generate EXACTLY 2 files: page-object AND test-spec
- Modern JavaScript with JSDoc
- Use ONLY real locators from journey
- Tests must match actual app flow`;

const GENERIC_TS_PROMPT = `Generate production-quality Playwright TypeScript tests with Page Object Model.

CRITICAL: You MUST return BOTH files:
1. A Page Object class file
2. A test spec file

Use semantic locators (getByRole, getByLabel). Return VALID JSON with files array containing BOTH page-object and test-spec.`;

const GENERIC_JS_PROMPT = `Generate production-quality Playwright JavaScript tests with Page Object Model.

CRITICAL: You MUST return BOTH files:
1. A Page Object class file  
2. A test spec file

Use semantic locators. Return VALID JSON with files array containing BOTH page-object and test-spec.`;

export async function runTestGeneratorAgent(req, res) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const {
    plan,
    url,
    language = "typescript",
    baseUrl,
    customInstructions,
    headed = false,
  } = req.body;

  if (!plan) {
    return res.status(400).json({ error: "Test plan required. Run Planner Agent first." });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const send = (type, data) =>
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

  const isTS = language === "typescript";

  try {
    send("status", { message: "⚡ Test Generator Agent activated...", step: 1 });

    let inspectionSummary = "";
    let hasRealInspection = false;
    const existingInspection = plan._inspection;
    const targetUrl = baseUrl || url || existingInspection?.url;

    // ══════════════════════════════════════════════════════════
    // DECISION TREE:
    // 1. headed=true → ALWAYS re-execute journey (user wants to see it)
    // 2. Plan has _realInspection AND headed=false → reuse data
    // 3. New URL provided → execute fresh journey
    // 4. No URL → generate generic tests
    // ══════════════════════════════════════════════════════════

    if (headed && targetUrl && existingInspection?.journey) {
      // User wants to SEE the journey in headed mode - re-execute it
      send("status", { 
        message: "🌐 Re-executing journey in HEADED mode (you'll see the browser)...", 
        step: 2 
      });

      // Parse actions from the plan's scenarios
      const userActions = [];
      if (plan.scenarios && plan.scenarios.length > 0) {
        // Extract actions from first scenario's steps
        const firstScenario = plan.scenarios[0];
        if (firstScenario.steps && Array.isArray(firstScenario.steps)) {
          // Use the scenario's testData for credentials
          const testData = firstScenario.testData || {};
          
          firstScenario.steps.forEach(step => {
            const stepLower = step.toLowerCase();
            
            // Match fill/enter/type actions
            if (stepLower.includes("enter") || stepLower.includes("type") || stepLower.includes("fill")) {
              // Extract the value being entered (in quotes)
              const valueMatch = step.match(/['"]([^'"]+)['"]/);
              
              // Extract field name - skip articles like "the"
              // Patterns: "Enter X in the Username field" or "Fill Username with X"
              let fieldName = null;
              
              // Try: "in/into/to the FIELD field/input"
              const inTheMatch = step.match(/(?:in|into|to)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:field|input|box)/i);
              if (inTheMatch) {
                fieldName = inTheMatch[1].trim();
              }
              
              // Try: "Fill/Enter/Type FIELD"
              if (!fieldName) {
                const directMatch = step.match(/(?:fill|enter|type)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:field|with|as)/i);
                if (directMatch) fieldName = directMatch[1].trim();
              }
              
              // Fallback: use testData keys
              if (!fieldName && testData.username && stepLower.includes("username")) {
                fieldName = "Username";
              } else if (!fieldName && testData.password && stepLower.includes("password")) {
                fieldName = "Password";
              }
              
              if (fieldName && valueMatch) {
                userActions.push({
                  type: "fill",
                  description: step,
                  label: fieldName,
                  value: valueMatch[1]
                });
              }
            }
            
            // Match click actions
            else if (stepLower.includes("click")) {
              let buttonText = null;
              
              // Pattern 1: "Click the Login button" → "Login"
              const theButtonMatch = step.match(/click\s+(?:the\s+)?([A-Z][A-Za-z\s]+?)\s+(?:button|link|icon|menu)/i);
              if (theButtonMatch) {
                buttonText = theButtonMatch[1].trim();
              }
              
              // Pattern 2: "Click on the Application link" → "Application"
              if (!buttonText) {
                const onTheMatch = step.match(/click\s+on\s+(?:the\s+)?([A-Z][A-Za-z\s]+?)\s+(?:button|link|icon|menu)/i);
                if (onTheMatch) buttonText = onTheMatch[1].trim();
              }
              
              // Pattern 3: "Click 'Submit'" → "Submit"
              if (!buttonText) {
                const quotedMatch = step.match(/click\s+['"]([^'"]+)['"]/i);
                if (quotedMatch) buttonText = quotedMatch[1].trim();
              }
              
              // Pattern 4: "Click Login" (bare word, not articles)
              if (!buttonText) {
                const bareMatch = step.match(/click\s+([A-Z][A-Za-z]+)(?:\s|\.)/i);
                if (bareMatch && !["the", "on", "a", "an", "to", "at"].includes(bareMatch[1].toLowerCase())) {
                  buttonText = bareMatch[1].trim();
                }
              }
              
              if (buttonText) {
                userActions.push({
                  type: "click",
                  description: step,
                  text: buttonText,
                  wait: stepLower.includes("login") || stepLower.includes("submit") || stepLower.includes("sign") ? "navigation" : undefined
                });
              }
            }
          });
        }
      }

      try {
        const inspectionData = await inspectPage(targetUrl, { 
          headed: true, 
          timeout: 20000,
          userActions: userActions.length > 0 ? userActions : null
        });
        
        const lastStep = inspectionData.journey[inspectionData.journey.length - 1];
        if (lastStep?.screenshotBase64) {
          send("screenshot", { base64: lastStep.screenshotBase64 });
        }

        send("inspection", {
          steps: inspectionData.totalSteps,
          journey: inspectionData.journey.map(s => ({
            stepName: s.stepName,
            inputs: s.elements?.inputs?.length || 0,
            buttons: s.elements?.buttons?.length || 0,
            forms: s.elements?.forms?.length || 0,
          })),
          pageType: lastStep.pageStructure?.pageType,
          title: lastStep.title,
        });

        inspectionSummary = formatInspectionForAI(inspectionData);
        hasRealInspection = true;

        send("status", {
          message: `✅ Journey executed in headed mode: ${inspectionData.totalSteps} steps`,
          step: 3,
        });
      } catch (browserErr) {
        console.error("Headed browser execution failed:", browserErr);
        send("error", {
          message: `❌ Failed to execute journey in headed mode: ${browserErr.message}`,
        });
        return res.end();
      }
    } else if (plan._realInspection === true && existingInspection) {
      // Reuse journey from Planner
      try {
        if (existingInspection.journey && Array.isArray(existingInspection.journey)) {
          // Multi-step journey - validate and clean the data
          const cleanedJourney = existingInspection.journey.map((step, idx) => ({
            stepName: step.stepName || `Step ${idx + 1}`,
            url: step.url || "",
            title: step.title || "",
            elements: step.elements || { inputs: [], buttons: [], links: [], selects: [], checkboxes: [], textareas: [], forms: [], headings: [], alerts: [] },
            pageStructure: step.pageStructure || { hasLoginForm: false, hasSearchBar: false, hasNavigation: false, hasPagination: false, hasModal: false, pageType: "unknown" },
          }));

          inspectionSummary = formatInspectionForAI({
            journey: cleanedJourney,
            totalSteps: cleanedJourney.length,
            inspectedAt: new Date().toISOString(),
          });
          send("status", {
            message: `♻️ Reusing ${cleanedJourney.length}-step journey from Planner...`,
            step: 2,
          });
          hasRealInspection = true;
        } else if (existingInspection.url) {
          // Old single-step format (backwards compat)
          inspectionSummary = formatInspectionForAI({
            journey: [{
              stepName: "Page Load",
              url: existingInspection.url,
              title: existingInspection.title || "",
              elements: existingInspection.elements || { inputs: [], buttons: [], links: [], selects: [], checkboxes: [], textareas: [], forms: [], headings: [], alerts: [] },
              pageStructure: existingInspection.pageStructure || { pageType: "unknown" },
            }],
            totalSteps: 1,
            inspectedAt: new Date().toISOString(),
          });
          send("status", { message: "♻️ Reusing page inspection from Planner...", step: 2 });
          hasRealInspection = true;
        }
      } catch (formatErr) {
        console.error("Failed to format inspection data:", formatErr);
        send("status", { 
          message: `⚠️ Could not parse inspection data: ${formatErr.message}. Generating generic tests...`, 
          step: 2 
        });
        hasRealInspection = false;
        inspectionSummary = "";
      }
    } else {
      hasRealInspection = plan._realInspection === true;
    }

    send("status", {
      message: `📝 Generating Playwright ${isTS ? "TypeScript" : "JavaScript"} with Page Object Model...`,
      step: hasRealInspection ? 4 : 3,
    });

    const cleanPlan = { ...plan };
    delete cleanPlan._inspection;
    delete cleanPlan._realInspection;
    delete cleanPlan._journeySteps;

    const systemPrompt = hasRealInspection && inspectionSummary
      ? (isTS ? TS_PROMPT : JS_PROMPT)
      : (isTS ? GENERIC_TS_PROMPT : GENERIC_JS_PROMPT);

    const userPrompt = hasRealInspection && inspectionSummary
      ? `Generate complete Playwright ${language} tests.

TEST PLAN:
${JSON.stringify(cleanPlan, null, 2)}

REAL BROWSER JOURNEY:
${inspectionSummary}

Base URL: ${targetUrl}
${customInstructions ? `Custom Instructions: ${customInstructions}` : ""}

Requirements:
1. Page Object must use ONLY real locators from the journey
2. Test spec must follow the actual flow observed
3. Cover ALL scenarios from plan
4. Use ${isTS ? "TypeScript types" : "JSDoc"}
5. NEVER invent selectors — use real ones from journey

CRITICAL REMINDER: Return JSON with EXACTLY 2 files in the files array:
- One with type: "page-object"
- One with type: "test-spec"
Do not generate only the page object. Both files are mandatory.`
      : `Generate Playwright ${language} tests from plan:

${JSON.stringify(cleanPlan, null, 2)}

Base URL: ${targetUrl}
${customInstructions ? `Custom Instructions: ${customInstructions}` : ""}

Use best-practice semantic locators.

CRITICAL REMINDER: Return JSON with EXACTLY 2 files in the files array:
- One with type: "page-object"
- One with type: "test-spec"
Both files are mandatory.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const rawContent = completion.choices?.[0]?.message?.content;
    if (!rawContent) {
      send("error", { message: "AI returned empty response" });
      return res.end();
    }

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      console.error("Parse error. Raw:", rawContent.substring(0, 300));
      send("error", { message: "Failed to parse code as JSON" });
      return res.end();
    }

    // ══════════════════════════════════════════════════════════
    // VALIDATE: Must have BOTH page-object and test-spec files
    // ══════════════════════════════════════════════════════════
    if (!parsed.files || !Array.isArray(parsed.files)) {
      send("error", { message: "AI did not return files array" });
      return res.end();
    }

    const hasPageObject = parsed.files.some(f => f.type === "page-object");
    const hasTestSpec = parsed.files.some(f => f.type === "test-spec");

    if (!hasPageObject || !hasTestSpec) {
      const missing = [];
      if (!hasPageObject) missing.push("Page Object");
      if (!hasTestSpec) missing.push("Test Spec");
      
      send("error", { 
        message: `❌ Incomplete generation: Missing ${missing.join(" and ")}. AI only generated ${parsed.files.length} file(s). Retrying...` 
      });
      
      // Log what was generated for debugging
      console.error("Generated files:", parsed.files.map(f => ({ filename: f.filename, type: f.type })));
      return res.end();
    }

    send("status", { 
      message: `✅ Playwright tests generated! (${parsed.files.length} files: ${parsed.files.map(f => f.type).join(", ")})`, 
      step: 4 
    });
    send("done", { result: parsed });
    res.end();
  } catch (err) {
    console.error("Test Generator Error:", err);
    send("error", { message: err.message || "Test generator failed" });
    res.end();
  }
}