/**
 * COMPLETE UNIFIED SERVER - All Features Combined
 * 
 * Features:
 * ✅ Recorder Agent (new)
 * ✅ Scenario Generator (new)
 * ✅ Enhanced Planner (new - for scenarios)
 * ✅ Original Planner (backward compatible)
 * ✅ Generator Agent (original - working)
 * ✅ Healer Agent (original)
 * ✅ LangGraph Orchestration
 * ✅ RAG Knowledge Base
 * ✅ Test Storage
 */

import 'dotenv/config.js';
import express from 'express';
import cors from 'cors';

// Original agents
import { runPlannerAgent as plannerAgent } from './agents/plannerAgent.js';
import { runTestGeneratorAgent as testGeneratorAgent } from './agents/testGeneratorAgent.js';
import { runHealingAgent as healingAgent } from './agents/healingAgent.js';

// New recorder/scenario agents
import RecorderAgent from './agents/recorderAgent.js';
import ScenarioGeneratorAgent from './agents/scenarioGeneratorAgent.js';
import EnhancedPlannerAgent from './agents/enhancedPlannerAgent.js';
import WorkflowOrchestrator from './utils/workflowOrchestrator.js';

// LangGraph + RAG
import { executeWorkflow, getWorkflowVisualization } from './agents/langGraphOrchestrator.js';
import { TestKnowledgeBase } from './agents/ragKnowledgeBase.js';
import { TestStorage } from './utils/testStorage.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INITIALIZE ALL SYSTEMS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Initialize recorder agents
const recorderAgent = new RecorderAgent();
const scenarioGenerator = new ScenarioGeneratorAgent(process.env.OPENAI_API_KEY);
const enhancedPlanner = new EnhancedPlannerAgent(process.env.OPENAI_API_KEY);
const workflowOrchestrator = new WorkflowOrchestrator({
  openaiApiKey: process.env.OPENAI_API_KEY,
  recorderAgent: recorderAgent,
});

// Initialize RAG + Storage
const knowledgeBase = new TestKnowledgeBase();
const testStorage = new TestStorage();

let systemsInitialized = false;

async function initializeSystems() {
  if (systemsInitialized) return;
  
  try {
    console.log("\n🚀 Initializing AI systems...");
    
    await knowledgeBase.initialize();
    await testStorage.initialize();
    
    systemsInitialized = true;
    console.log("✅ All systems initialized\n");
  } catch (error) {
    console.error("⚠️  Warning: Some systems failed to initialize:", error.message);
    console.log("   The server will continue, but RAG features may not work.\n");
  }
}

initializeSystems();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NEW ENDPOINTS - RECORDER WORKFLOW
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.post('/api/recorder/start', async (req, res) => {
  try {
    const { baseUrl, config = {} } = req.body;
    if (!baseUrl) {
      return res.status(400).json({ error: 'baseUrl is required' });
    }

    console.log(`\n🎬 Starting recorder for: ${baseUrl}`);
    const result = await recorderAgent.startRecording(baseUrl, config);
    res.json(result);

  } catch (error) {
    console.error('❌ Recorder start error:', error);
    res.status(500).json({ 
      error: 'Failed to start recording', 
      details: error.message 
    });
  }
});

app.post('/api/recorder/stop', async (req, res) => {
  try {
    console.log('\n🛑 Stopping recorder...');
    const journeyData = await recorderAgent.stopRecording();

    res.json({
      success: true,
      journey: journeyData,
      message: `Recorded ${journeyData.totalSteps} steps`,
    });

  } catch (error) {
    console.error('❌ Recorder stop error:', error);
    res.status(500).json({ 
      error: 'Failed to stop recording', 
      details: error.message 
    });
  }
});

app.get('/api/recorder/status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const status = workflowOrchestrator.getSessionStatus(sessionId);
    res.json(status);

  } catch (error) {
    console.error('❌ Status check error:', error);
    res.status(500).json({ 
      error: 'Failed to get status', 
      details: error.message 
    });
  }
});

app.post('/api/recorder/cleanup', async (req, res) => {
  try {
    console.log('\n🧹 Force cleaning up recorder...');
    await recorderAgent.cleanup();
    res.json({ success: true, message: 'Recorder cleaned up' });
  } catch (error) {
    console.error('❌ Cleanup error:', error);
    res.status(500).json({ error: 'Failed to cleanup', details: error.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NEW ENDPOINTS - SCENARIO GENERATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.post('/api/scenarios/generate', async (req, res) => {
  try {
    const { journeyData, options = {} } = req.body;
    if (!journeyData) {
      return res.status(400).json({ error: 'journeyData is required' });
    }

    console.log('\n🎯 Generating scenarios...');
    const scenarios = await scenarioGenerator.generateScenarios(journeyData, options);

    res.json({
      success: true,
      scenarios,
      stats: scenarioGenerator.getScenarioStats(scenarios),
    });

  } catch (error) {
    console.error('❌ Scenario generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate scenarios', 
      details: error.message 
    });
  }
});

app.get('/api/scenarios/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const scenarios = await scenarioGenerator.loadScenarios(sessionId);

    res.json({
      success: true,
      scenarios,
      stats: scenarioGenerator.getScenarioStats(scenarios),
    });

  } catch (error) {
    console.error('❌ Scenarios load error:', error);
    res.status(404).json({ 
      error: 'Scenarios not found', 
      details: error.message 
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NEW ENDPOINTS - WORKFLOW ORCHESTRATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.post('/api/workflow/record-and-generate', async (req, res) => {
  try {
    const { baseUrl, config = {} } = req.body;
    if (!baseUrl) {
      return res.status(400).json({ error: 'baseUrl is required' });
    }

    console.log('\n🚀 Starting complete workflow...');
    const result = await workflowOrchestrator.recordAndGenerate(baseUrl, config);
    res.json(result);

  } catch (error) {
    console.error('❌ Workflow error:', error);
    res.status(500).json({ 
      error: 'Workflow failed', 
      details: error.message 
    });
  }
});

app.post('/api/workflow/stop-and-continue', async (req, res) => {
  try {
    const { sessionId, options = {} } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    console.log('\n⚡ Continuing workflow...');

    const workflowOptions = {
      ...options,
      baseUrl: req.body.baseUrl || options.baseUrl,
    };

    const result = await workflowOrchestrator.stopRecordingAndContinue(sessionId, workflowOptions);
    res.json(result);

  } catch (error) {
    console.error('❌ Workflow continuation error:', error);
    res.status(500).json({ 
      error: 'Failed to continue workflow', 
      details: error.message 
    });
  }
});

app.get('/api/workflow/sessions', async (req, res) => {
  try {
    const sessions = await workflowOrchestrator.listAllSessions();
    res.json({
      success: true,
      total: sessions.length,
      sessions,
    });

  } catch (error) {
    console.error('❌ Sessions list error:', error);
    res.status(500).json({ 
      error: 'Failed to list sessions', 
      details: error.message 
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PLANNER AGENT - HYBRID (Enhanced for scenarios, Original for manual)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.post('/agent/planner', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const { scenarios } = req.body;

    // If scenarios provided, use Enhanced Planner
    if (scenarios) {
      console.log('\n📋 Enhanced Planner activated (scenarios mode)...');
      
      const plan = await enhancedPlanner.createTestPlan({
        baseUrl: req.body.baseUrl,
        customInstructions: req.body.customInstructions,
        scenarios,
        language: req.body.language || 'typescript',
      });

      res.write(`data: ${JSON.stringify({ type: 'done', plan })}\n\n`);
      res.end();
    } else {
      // Otherwise, use Original Planner
      console.log('\n📋 Original Planner activated (manual mode)...');
      plannerAgent(req, res);
    }

  } catch (error) {
    console.error('❌ Planner error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    res.end();
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GENERATOR AGENT - ORIGINAL (WORKING VERSION)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.post('/agent/generator', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  console.log('\n⚡ Generator Agent activated...');
  console.log('   📦 Passing knowledgeBase:', !!knowledgeBase);
  console.log('   📦 Passing testStorage:', !!testStorage);
  
  // Pass storage systems to generator
  req.body.knowledgeBase = knowledgeBase;
  req.body.testStorage = testStorage;
  
  testGeneratorAgent(req, res);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HEALER AGENT - ORIGINAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.post('/agent/healer', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  console.log('\n💊 Healer Agent activated...');
  healingAgent(req, res);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LANGGRAPH ORCHESTRATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.post('/agent/langgraph', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  try {
    send("status", { message: "🕸️ LangGraph Orchestrator activated...", step: 1 });

    const input = {
      url: req.body.url,
      userActions: req.body.userActions || [],
      featureDescription: req.body.featureDescription || "",
      language: req.body.language || "typescript",
      headed: req.body.headed || false
    };

    send("status", { message: "🔄 Starting multi-agent workflow...", step: 2 });

    let stepCount = 3;
    let finalState = null;
    for await (const state of executeWorkflow(input)) {
      finalState = state;
      send("state_update", {
        currentState: finalState,
        visualization: getWorkflowVisualization(finalState),
        step: stepCount++
      });

      if (state.status === "planning_complete") {
        send("status", { message: "✅ Planning complete", step: stepCount++ });
      } else if (state.status === "generation_complete") {
        send("status", { message: "✅ Tests generated", step: stepCount++ });
      } else if (state.status === "execution_success") {
        send("status", { message: "✅ All tests passed!", step: stepCount++ });
      } else if (state.status === "execution_failed") {
        send("status", { 
          message: `⚠️ ${state.testResults?.failed || 0} tests failed - attempting healing...`, 
          step: stepCount++ 
        });
      } else if (state.status === "healing_complete") {
        send("status", { 
          message: `💊 Healing attempt ${state.healAttempts} complete`, 
          step: stepCount++ 
        });
      }
    }

    // Persist to storage + ChromaDB
    if (finalState && finalState.generatedFiles) {
      try {
        const testData = {
          feature: input.featureDescription,
          url: input.url,
          userActions: input.userActions,
          files: finalState.generatedFiles,
          plan: finalState.plan,
          inspectionData: finalState.inspectionData,
          testResults: finalState.testResults,
          language: input.language,
          passed: finalState.testResults?.failed === 0
        };

        const testId = await testStorage.storeTest(testData);
        send("status", { message: `💾 Test saved to storage (ID: ${testId})`, step: stepCount++ });

        try {
          await knowledgeBase.storeTest({ ...testData, id: testId });
          send("status", { message: "🧠 Test pattern stored in knowledge base", step: stepCount++ });
        } catch (ragErr) {
          console.error("RAG storage error (non-fatal):", ragErr.message);
        }
      } catch (storageErr) {
        console.error("Test storage error (non-fatal):", storageErr.message);
      }
    }

    send("status", { message: "✅ Workflow complete!", step: stepCount });
    send("done", { finalState });
    res.end();

  } catch (error) {
    console.error("LangGraph error:", error);
    send("error", { message: error.message });
    res.end();
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RAG KNOWLEDGE BASE ENDPOINTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.post('/api/rag/search', async (req, res) => {
  try {
    const { query, limit = 5, filters = {} } = req.body;
    const results = await knowledgeBase.findSimilarTests(query, limit, filters);
    
    res.json({
      query,
      resultsCount: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/rag/patterns', async (req, res) => {
  try {
    const { feature, limit = 3 } = req.body;
    const patterns = await knowledgeBase.getSuccessfulPatterns(feature, limit);
    
    res.json({
      feature,
      patternsFound: patterns.length,
      patterns
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/rag/store', async (req, res) => {
  try {
    const testData = req.body;
    const id = await knowledgeBase.storeTest(testData);
    
    res.json({
      success: true,
      id,
      message: "Test pattern stored in knowledge base"
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/rag/stats', async (req, res) => {
  try {
    const stats = await knowledgeBase.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/rag/clear', async (req, res) => {
  try {
    await knowledgeBase.clearAll();
    res.json({ success: true, message: "Knowledge base cleared" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TEST STORAGE ENDPOINTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.post('/api/storage/tests', async (req, res) => {
  try {
    const testData = req.body;
    const testId = await testStorage.storeTest(testData);
    
    res.json({
      success: true,
      testId,
      message: "Test stored successfully"
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/storage/tests/:testId', async (req, res) => {
  try {
    const test = await testStorage.getTest(req.params.testId);
    
    if (!test) {
      return res.status(404).json({ error: "Test not found" });
    }
    
    res.json(test);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/storage/search', async (req, res) => {
  try {
    const criteria = req.body;
    const results = testStorage.searchTests(criteria);
    
    res.json({
      count: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/storage/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const tests = testStorage.getRecentTests(limit);
    
    res.json({
      count: tests.length,
      tests
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/storage/tests/:testId/results', async (req, res) => {
  try {
    await testStorage.updateTestResults(req.params.testId, req.body);
    
    res.json({
      success: true,
      message: "Test results updated"
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/storage/tests/:testId', async (req, res) => {
  try {
    await testStorage.deleteTest(req.params.testId);
    
    res.json({
      success: true,
      message: "Test deleted"
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/storage/stats', async (req, res) => {
  try {
    const stats = await testStorage.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/storage/export', async (req, res) => {
  try {
    const { testIds = [] } = req.body;
    const exportFile = await testStorage.exportTests(testIds);
    
    res.json({
      success: true,
      exportFile,
      message: "Tests exported successfully"
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/storage/import', async (req, res) => {
  try {
    const { exportFile } = req.body;
    const count = await testStorage.importTests(exportFile);
    
    res.json({
      success: true,
      imported: count,
      message: `${count} tests imported successfully`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HEALTH CHECK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.get('/health', async (req, res) => {
  const kbStats = await knowledgeBase.getStats();
  const storageStats = await testStorage.getStats();
  
  res.json({
    status: "ok",
    openai: process.env.OPENAI_API_KEY ? "configured" : "missing",
    systems: {
      knowledgeBase: systemsInitialized,
      testStorage: systemsInitialized,
      recorder: true,
      scenarioGenerator: true,
      enhancedPlanner: true,
    },
    stats: {
      knowledgeBase: kbStats,
      storage: storageStats
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ERROR HANDLING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// START SERVER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🚀 AI QA Automation - Complete Unified System              ║
║                                                               ║
║   Server: http://localhost:${PORT}                              ║
║   UI: http://localhost:${PORT}/                                 ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

📡 ALL ENDPOINTS AVAILABLE:

  🎬 RECORDER & SCENARIOS:
    POST /api/recorder/start           - Start recording
    POST /api/recorder/stop            - Stop & get journey
    GET  /api/recorder/status/:id      - Get status
    POST /api/scenarios/generate       - Generate scenarios
    GET  /api/scenarios/:id            - Get scenarios
    POST /api/workflow/record-and-generate  - Complete workflow
    POST /api/workflow/stop-and-continue    - Stop & continue
    GET  /api/workflow/sessions        - List sessions

  🧠 ORIGINAL AGENTS:
    POST /agent/planner     - Browser inspection & planning (hybrid)
    POST /agent/generator   - AI test generation (working!)
    POST /agent/healer      - Self-healing tests

  🕸️  ADVANCED:
    POST /agent/langgraph   - Multi-agent orchestration

  🔍 RAG KNOWLEDGE BASE:
    POST /api/rag/search    - Search similar tests
    POST /api/rag/patterns  - Get successful patterns
    POST /api/rag/store     - Store test pattern
    GET  /api/rag/stats     - Knowledge base stats
    POST /api/rag/clear     - Clear knowledge base

  💾 TEST STORAGE:
    POST /api/storage/tests              - Store new test
    GET  /api/storage/tests/:id          - Get test by ID
    POST /api/storage/search             - Search tests
    GET  /api/storage/recent             - Get recent tests
    PUT  /api/storage/tests/:id/results  - Update results
    DELETE /api/storage/tests/:id        - Delete test
    GET  /api/storage/stats              - Storage stats
    POST /api/storage/export             - Export tests
    POST /api/storage/import             - Import tests

  ❤️  SYSTEM:
    GET /health             - Health check & stats

✨ UNIFIED WORKFLOW:
   Recorder → Scenarios → Planner → Generator → Healer
   All in ONE URL!

`);
});

export default app;