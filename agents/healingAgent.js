import OpenAI from "openai";

const HEALING_SYSTEM_PROMPT = `You are a Senior SDET specializing in self-healing Playwright test automation.
Analyze failed tests, identify root causes, and return fully healed code.

Return VALID JSON only with this EXACT structure:
{
  "rootCause": "Clear explanation of WHY the test failed",
  "failureCategory": "Selector Changed | Timing Issue | Navigation Change | API Change | Element Missing | Other",
  "confidence": "High | Medium | Low",
  "analysis": "Detailed technical analysis",
  "healedCode": "The complete fixed test code",
  "changes": [
    {
      "lineApprox": "line ~15",
      "original": "await page.click('#old-button')",
      "healed": "await page.getByRole('button', { name: 'Submit' }).click()",
      "reason": "ID selector changed; using semantic role selector"
    }
  ],
  "preventionTips": ["Use data-testid attributes", "Prefer getByRole() over CSS"],
  "alternativeSelectors": [
    { "strategy": "getByRole", "value": "button, { name: 'Submit' }", "resilience": "High" },
    { "strategy": "getByTestId", "value": "submit-btn", "resilience": "High" }
  ]
}

Healing rules:
- Prefer getByRole, getByLabel, getByPlaceholder, getByText, getByTestId over CSS/XPath
- Fix timing issues with waitForLoadState or expect with timeout option
- Fix ALL issues found, not just the first one
- healedCode must contain the COMPLETE file, not just changed lines`;

export async function runHealingAgent(req, res) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const {
    brokenCode,
    errorMessage,
    htmlSnapshot,
    language = "typescript",
    additionalContext,
  } = req.body;

  if (!brokenCode?.trim()) {
    return res.status(400).json({ error: "Broken test code is required" });
  }
  if (!errorMessage?.trim()) {
    return res.status(400).json({ error: "Error message/stack trace is required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const send = (type, data) =>
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

  try {
    send("status", { message: "🔍 Self-Healing Agent activated...", step: 1 });
    await new Promise((r) => setTimeout(r, 300));
    send("status", { message: "🧬 Analyzing test failure...", step: 2 });
    await new Promise((r) => setTimeout(r, 400));
    send("status", { message: "💊 Generating healed code...", step: 3 });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: HEALING_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Analyze this failed Playwright test and provide a complete healed solution:

--- FAILED TEST CODE (${language}) ---
${brokenCode}

--- ERROR / STACK TRACE ---
${errorMessage}

${htmlSnapshot ? `--- PAGE HTML SNAPSHOT ---\n${htmlSnapshot.substring(0, 3000)}` : ""}
${additionalContext ? `--- ADDITIONAL CONTEXT ---\n${additionalContext}` : ""}

Return the complete healed file with ALL issues fixed. Use modern Playwright locators.`,
        },
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
      send("error", { message: "Failed to parse healing response as JSON" });
      return res.end();
    }

    send("status", { message: "✅ Healing complete!", step: 4 });
    send("done", { result: parsed });
    res.end();
  } catch (err) {
    console.error("Healing Agent Error:", err);
    send("error", { message: err.message || "Healing agent failed" });
    res.end();
  }
}