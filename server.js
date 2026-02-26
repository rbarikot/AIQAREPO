import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { runPlannerAgent } from "./agents/plannerAgent.js";
import { runTestGeneratorAgent } from "./agents/testGeneratorAgent.js";
import { runHealingAgent } from "./agents/healingAgent.js";
import { inspectPage, formatInspectionForAI } from "./agents/browserInspector.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

// Health Check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    agents: ["planner", "testGenerator", "healer"],
    timestamp: new Date().toISOString(),
    apiKeyConfigured: !!process.env.OPENAI_API_KEY,
  });
});

// Agent 1: Planner (with optional live browser inspection)
app.post("/agent/planner", runPlannerAgent);

// Agent 2: Test Generator (with optional live browser inspection)
app.post("/agent/generator", runTestGeneratorAgent);

// Agent 3: Self-Healing
app.post("/agent/healer", runHealingAgent);

// Standalone page inspector — returns screenshot + element data
app.post("/agent/inspect", async (req, res) => {
  const { url, headed = false } = req.body;
  if (!url?.trim()) {
    return res.status(400).json({ error: "URL is required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const send = (type, data) =>
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

  try {
    send("status", { message: "🌐 Launching Chromium..." });
    await new Promise((r) => setTimeout(r, 200));
    send("status", { message: `🔍 Navigating to ${url}...` });

    const data = await inspectPage(url, { headed });

    send("screenshot", { base64: data.screenshotBase64 });
    send("done", {
      title: data.title,
      url: data.url,
      elements: data.elements,
      pageStructure: data.pageStructure,
      networkRequests: data.networkRequests,
      inspectionSummary: formatInspectionForAI(data),
    });
    res.end();
  } catch (err) {
    console.error("Inspect error:", err);
    send("error", { message: err.message });
    res.end();
  }
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 AI QA Agent System — http://localhost:${PORT}`);
  console.log(`   🧠 Planner:   POST /agent/planner   (opens browser if URL given)`);
  console.log(`   ⚡ Generator: POST /agent/generator  (opens browser if URL given)`);
  console.log(`   💊 Healer:    POST /agent/healer`);
  console.log(`   🔍 Inspector: POST /agent/inspect\n`);
});