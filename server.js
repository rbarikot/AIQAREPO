/**
 * Extended AI QA Automation Server
 * 
 * Integrates:
 * - LangGraph multi-agent orchestration
 * - RAG knowledge base for test patterns
 * - Test storage system
 * - Original Planner/Generator/Healer agents
 */

import 'dotenv/config.js';
import express from 'express';
import { runPlannerAgent as plannerAgent } from './agents/plannerAgent.js';
import { runTestGeneratorAgent as testGeneratorAgent } from './agents/testGeneratorAgent.js';
import { runHealingAgent as healingAgent } from './agents/healingAgent.js';

// New integrations
import { executeWorkflow, getWorkflowVisualization } from './agents/langGraphOrchestrator.js';
import { TestKnowledgeBase } from './agents/ragKnowledgeBase.js';
import { TestStorage } from './utils/testStorage.js';

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Initialize systems
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

// Initialize on server start
initializeSystems();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HEALTH CHECK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.get('/health', async (req, res) => {
  const kbStats = await knowledgeBase.getStats();
  const storageStats = await testStorage.getStats();
  
  res.json({
    status: "ok",
    openai: process.env.OPENAI_API_KEY ? "configured" : "missing",
    systems: {
      knowledgeBase: systemsInitialized,
      testStorage: systemsInitialized
    },
    stats: {
      knowledgeBase: kbStats,
      storage: storageStats
    }
  });
});
app.post('/test-debug', (req, res) => {
  console.log('\n🔥🔥🔥 TEST ENDPOINT WAS HIT! 🔥🔥🔥\n');
  res.json({ message: 'Server is responding!', body: req.body });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ORIGINAL AGENTS (Backward Compatible)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.post('/agent/planner', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  plannerAgent(req, res);
});

app.post('/agent/generator', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // 🔍 DEBUG: Check what's available
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 GENERATOR ENDPOINT DEBUG');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('   knowledgeBase exists:', !!knowledgeBase);
  console.log('   knowledgeBase type:', typeof knowledgeBase);
  console.log('   testStorage exists:', !!testStorage);
  console.log('   testStorage type:', typeof testStorage);
  
  // Pass storage systems
  req.body.knowledgeBase = knowledgeBase;
  req.body.testStorage = testStorage;
  
  // Verify they were added
  console.log('   Added to req.body:');
  console.log('     - knowledgeBase:', !!req.body.knowledgeBase);
  console.log('     - testStorage:', !!req.body.testStorage);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  testGeneratorAgent(req, res);
});

app.post('/agent/healer', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  healingAgent(req, res);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LANGGRAPH ORCHESTRATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
      // Send state updates
      send("state_update", {
        currentState: finalState,
        visualization: getWorkflowVisualization(finalState),
        step: stepCount++
      });

      // Send progress messages
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

    // Persist to storage + ChromaDB after workflow completes
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

        // Save to index.json
        const testId = await testStorage.storeTest(testData);
        send("status", { message: `💾 Test saved to storage (ID: ${testId})`, step: stepCount++ });

        // Save to ChromaDB
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RAG KNOWLEDGE BASE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Search similar tests
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

// Get successful patterns for a feature
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

// Store a new test pattern
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

// Get knowledge base statistics
app.get('/api/rag/stats', async (req, res) => {
  try {
    const stats = await knowledgeBase.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear knowledge base (use with caution)
app.post('/api/rag/clear', async (req, res) => {
  try {
    await knowledgeBase.clearAll();
    res.json({ success: true, message: "Knowledge base cleared" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TEST STORAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Store a new test
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

// Get a specific test
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

// Search tests
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

// Get recent tests
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

// Update test results
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

// Delete a test
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

// Get storage statistics
app.get('/api/storage/stats', async (req, res) => {
  try {
    const stats = await testStorage.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export tests
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

// Import tests
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ERROR HANDLING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// START SERVER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🚀 AI QA Automation Framework - Extended Edition           ║
║                                                               ║
║   Server: http://localhost:${PORT}                              ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

📡 API Endpoints:

  ORIGINAL AGENTS:
    🧠 POST /agent/planner      - Browser inspection & planning
    ⚡ POST /agent/generator    - AI test generation
    🧪 POST /agent/executor     - Test execution
    💊 POST /agent/healer       - Self-healing

  NEW FEATURES:
    🕸️  POST /agent/langgraph   - Multi-agent orchestration

  RAG KNOWLEDGE BASE:
    🔍 POST /api/rag/search     - Search similar tests
    📚 POST /api/rag/patterns   - Get successful patterns
    💾 POST /api/rag/store      - Store test pattern
    📊 GET  /api/rag/stats      - Knowledge base stats
    🗑️  POST /api/rag/clear     - Clear knowledge base

  TEST STORAGE:
    💾 POST /api/storage/tests              - Store new test
    🔍 GET  /api/storage/tests/:id          - Get test by ID
    🔎 POST /api/storage/search             - Search tests
    📋 GET  /api/storage/recent             - Get recent tests
    ✏️  PUT  /api/storage/tests/:id/results - Update results
    🗑️  DELETE /api/storage/tests/:id       - Delete test
    📊 GET  /api/storage/stats              - Storage stats
    📦 POST /api/storage/export             - Export tests
    📥 POST /api/storage/import             - Import tests

  SYSTEM:
    ❤️  GET /health             - Health check & stats

`);
});