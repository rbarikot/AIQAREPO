import OpenAI from "openai";
import { inspectPage, formatInspectionForAI } from "./browserInspector.js";

const ACTION_PARSER_PROMPT = `You are an expert at parsing user test requirements into executable browser actions.

Given a feature description, extract the sequence of actions the user wants performed.

Return a JSON object with:
{
  "actions": [
    {
      "type": "fill|click|select|check|wait",
      "description": "Human readable step",
      "label": "field label text (for fill/check)",
      "placeholder": "placeholder text (for fill)",
      "text": "button/link text (for click)",
      "value": "value to fill or select",
      "wait": "navigation (if click should wait for page load)"
    }
  ]
}

Examples:
Input: "Login with username 'admin' and password 'admin123', then click Dashboard"
Output:
{
  "actions": [
    { "type": "fill", "label": "username", "value": "admin", "description": "Fill username with 'admin'" },
    { "type": "fill", "label": "password", "value": "admin123", "description": "Fill password with 'admin123'" },
    { "type": "click", "text": "Sign in", "wait": "navigation", "description": "Click login button" },
    { "type": "click", "text": "Dashboard", "description": "Navigate to Dashboard" }
  ]
}

Input: "Navigate to login page and login with admin/admin then logout"
Output:
{
  "actions": [
    { "type": "fill", "placeholder": "username", "value": "admin", "description": "Enter username 'admin'" },
    { "type": "fill", "placeholder": "password", "value": "admin", "description": "Enter password 'admin'" },
    { "type": "click", "text": "login", "wait": "navigation", "description": "Click login button" },
    { "type": "click", "text": "logout", "description": "Click logout button" }
  ]
}

Rules:
- Extract ALL user actions from the description
- Use semantic field identifiers (label/placeholder/text)
- Add "wait": "navigation" for login/submit clicks
- Make descriptions clear and actionable
- If no actions mentioned, return empty actions array`;

const PLANNER_SYSTEM_PROMPT = `You are a Senior QA Test Architect specializing in Playwright automation.
You receive REAL multi-step browser journey data showing ACTUAL app behavior.
Use the actual page states, elements, and flow to create accurate, executable test plans.

Return valid JSON:
{
  "summary": "Overview",
  "testType": "e2e",
  "pageTitle": "Actual page title",
  "scenarios": [
    {
      "id": "TC001",
      "title": "Descriptive test title",
      "priority": "High | Medium | Low",
      "category": "Positive | Negative | Edge Case",
      "description": "What this validates",
      "preconditions": "Setup needed",
      "testData": {},
      "steps": ["Step 1", "Step 2"],
      "expectedResult": "Expected outcome",
      "playwrightCode": "// Real code using actual locators"
    }
  ],
  "pageElements": [
    { "name": "Element", "locatorStrategy": "getByRole", "locatorValue": "actual value", "purpose": "what it does" }
  ],
  "testDataSets": { "valid": {}, "invalid": {} },
  "recommendations": ["Based on actual page"]
}

CRITICAL: Use ONLY locators from the journey data. Each scenario's playwrightCode must reflect the ACTUAL app behavior observed.`;

const PLANNER_NO_URL_PROMPT = `You are a Senior QA Test Architect. Create realistic test plans.
Return valid JSON with scenarios array. Generate 4-6 scenarios with best-practice Playwright patterns.`;

export async function runPlannerAgent(req, res) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const {
    feature,
    url,
    testType = "e2e",
    includeNegative = true,
    includeEdge = true,
    language = "typescript",
    headed = false,
  } = req.body;

  if (!feature?.trim()) {
    return res.status(400).json({ error: "Feature description is required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const send = (type, data) =>
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

  try {
    send("status", { message: "🧠 Planner Agent activated...", step: 1 });

    let inspectionSummary = "";
    let screenshotBase64 = null;
    let inspectionData = null;
    const providedUrl = url?.trim();
    let userActions = [];

    // ══════════════════════════════════════════════════════════
    // STEP 1: Parse user actions from feature description
    // ══════════════════════════════════════════════════════════
    if (providedUrl) {
      send("status", { message: "🤖 Parsing user actions from description...", step: 2 });
      
      try {
        const actionCompletion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: ACTION_PARSER_PROMPT },
            { role: "user", content: `Feature: ${feature}` }
          ],
        });

        const actionResult = JSON.parse(actionCompletion.choices?.[0]?.message?.content || "{}");
        userActions = actionResult.actions || [];
        
        if (userActions.length > 0) {
          send("status", { 
            message: `✅ Parsed ${userActions.length} user actions to execute: ${userActions.map(a => a.description).join(", ")}`, 
            step: 2 
          });
        }
      } catch (parseErr) {
        console.warn("Action parsing failed, will inspect page only:", parseErr.message);
      }

      // ══════════════════════════════════════════════════════════
      // STEP 2: Execute browser journey with actions
      // ══════════════════════════════════════════════════════════
      send("status", { message: "🌐 Launching Chromium browser...", step: 3 });
      await new Promise((r) => setTimeout(r, 200));
      send("status", { message: `🔍 Navigating to ${providedUrl}...`, step: 3 });

      if (userActions.length > 0) {
        send("status", { 
          message: `🎬 Executing ${userActions.length} user actions on the page...`, 
          step: 3 
        });
      }

      try {
        inspectionData = await inspectPage(providedUrl, { 
          headed, 
          timeout: 20000,
          userActions: userActions.length > 0 ? userActions : null
        });

        // Send screenshot from LAST step (final state after actions)
        const lastStep = inspectionData.journey[inspectionData.journey.length - 1];
        if (lastStep && lastStep.screenshotBase64) {
          screenshotBase64 = lastStep.screenshotBase64;
          send("screenshot", { base64: screenshotBase64 });
        }

        // Send inspection summary showing ALL steps
        const allElementCounts = inspectionData.journey.map(step => ({
          stepName: step.stepName,
          inputs: step.elements?.inputs?.length || 0,
          buttons: step.elements?.buttons?.length || 0,
          forms: step.elements?.forms?.length || 0,
        }));

        send("inspection", {
          steps: inspectionData.totalSteps,
          journey: allElementCounts,
          pageType: lastStep.pageStructure?.pageType,
          title: lastStep.title,
        });

        inspectionSummary = formatInspectionForAI(inspectionData);

        send("status", {
          message: `✅ Journey complete: ${inspectionData.totalSteps} steps executed and captured`,
          step: 4,
        });
      } catch (browserErr) {
        console.error("Browser inspection FAILED:", browserErr);
        send("error", {
          message: `❌ Failed to reach ${providedUrl}: ${browserErr.message}. Cannot generate tests without real page inspection. Please check the URL or remove it to generate generic tests.`,
        });
        return res.end();
      }
    } else {
      send("status", {
        message: "⚠️ No URL provided — generating generic test plan from feature description only",
        step: 2,
      });
    }

    send("status", { message: "✍️ Generating test scenarios from journey data...", step: 5 });

    const systemPrompt = providedUrl && inspectionSummary 
      ? PLANNER_SYSTEM_PROMPT 
      : PLANNER_NO_URL_PROMPT;

    const userPrompt = providedUrl && inspectionSummary
      ? `Create a comprehensive Playwright test plan:

FEATURE: "${feature}"

${inspectionSummary}

Test Type: ${testType}
Language: ${language}
Include Negative Cases: ${includeNegative}
Include Edge Cases: ${includeEdge}

CRITICAL: Use ONLY the actual locators from the journey inspection above.
Each scenario must reflect the REAL app behavior observed across all steps.
The playwrightCode must use real page.getByLabel(), page.getByRole() etc. from the journey.`
      : `Create a comprehensive Playwright test plan:

FEATURE: "${feature}"
Test Type: ${testType}
Language: ${language}
Include Negative Cases: ${includeNegative}
Include Edge Cases: ${includeEdge}

No URL provided — generate realistic scenarios using best-practice Playwright patterns.`;

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
      send("error", { message: "Failed to parse AI response as JSON" });
      return res.end();
    }

    // Attach journey data so Generator can reuse it
    if (inspectionData) {
      parsed._inspection = {
        url: inspectionData.journey[0]?.url,
        journey: inspectionData.journey.map(step => ({
          stepName: step.stepName,
          url: step.url,
          title: step.title,
          elements: step.elements,
          pageStructure: step.pageStructure,
        })),
      };
      parsed._realInspection = true;
      parsed._journeySteps = inspectionData.totalSteps;
    }

    send("status", { message: "✅ Test plan complete!", step: 6 });
    send("done", { plan: parsed });
    res.end();
  } catch (err) {
    console.error("Planner Agent Error:", err);
    send("error", { message: err.message || "Planner agent failed" });
    res.end();
  }
}