/**
 * LangGraph Orchestrator - Multi-Agent Workflow Management
 * 
 * This orchestrator manages the entire test generation flow using LangGraph's
 * state graph system. It provides intelligent routing between agents based on
 * conditions and maintains state across the entire workflow.
 * 
 * Flow:
 * START → PLANNER → GENERATOR → EXECUTOR → (HEALER if failed) → END
 */

import { StateGraph, END } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { runPlannerAgent as plannerAgent } from './plannerAgent.js';
import { runTestGeneratorAgent as generateTests } from './testGeneratorAgent.js';
import { runHealingAgent as healFailures } from './healingAgent.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Define the state structure that flows through the graph
 */
const AgentState = {
  // Input
  url: null,
  userActions: [],
  featureDescription: "",
  language: "typescript",
  headed: false,
  
  // Planner outputs
  plan: null,
  inspectionData: null,
  
  // Generator outputs
  generatedFiles: null,
  
  // Executor outputs
  testResults: null,
  
  // Healer tracking
  healAttempts: 0,
  maxHealAttempts: 3,
  healingHistory: [],
  
  // Final state
  status: "pending", // pending, running, success, failed
  error: null,
  
  // Metrics
  startTime: null,
  endTime: null,
  totalDuration: 0
};

/**
 * Planner Node - Executes browser inspection and creates test plan
 */
async function plannerNode(state) {
  console.log("\n📋 [LangGraph] Executing Planner Node...");
  
  try {
    const result = await plannerAgent({
      url: state.url,
      userActions: state.userActions,
      featureDescription: state.featureDescription,
      headed: state.headed
    });
    
    return {
      ...state,
      plan: result.plan,
      inspectionData: result.inspection,
      status: "planning_complete"
    };
  } catch (error) {
    console.error("Planner node error:", error);
    return {
      ...state,
      status: "failed",
      error: error.message
    };
  }
}

/**
 * Generator Node - Creates Playwright test files using AI
 */
async function generatorNode(state) {
  console.log("\n⚡ [LangGraph] Executing Generator Node...");
  
  try {
    const result = await generateTests({
      plan: state.plan,
      inspectionData: state.inspectionData,
      language: state.language,
      headed: state.headed
    });
    
    return {
      ...state,
      generatedFiles: result.files,
      status: "generation_complete"
    };
  } catch (error) {
    console.error("Generator node error:", error);
    return {
      ...state,
      status: "failed",
      error: error.message
    };
  }
}

/**
 * Executor Node - Runs the generated Playwright tests
 */
async function executorNode(state) {
  console.log("\n🧪 [LangGraph] Executing Executor Node...");
  
  try {
    // Get test spec file path
    const testSpecFile = state.generatedFiles.find(f => f.type === "test-spec");
    if (!testSpecFile) {
      throw new Error("No test spec file found");
    }
    
    const results = await executeTests(testSpecFile.filename);
    
    return {
      ...state,
      testResults: results,
      status: results.failed === 0 ? "execution_success" : "execution_failed"
    };
  } catch (error) {
    console.error("Executor node error:", error);
    return {
      ...state,
      status: "failed",
      error: error.message
    };
  }
}

/**
 * Healer Node - Fixes failing tests using AI
 */
async function healerNode(state) {
  console.log("\n💊 [LangGraph] Executing Healer Node...");
  
  try {
    const testSpecFile = state.generatedFiles.find(f => f.type === "test-spec");
    const pageObjectFile = state.generatedFiles.find(f => f.type === "page-object");
    
    const healed = await healFailures({
      failures: state.testResults.failures,
      testCode: testSpecFile.content,
      pomCode: pageObjectFile.content,
      attemptNumber: state.healAttempts + 1
    });
    
    // Update the test file content
    testSpecFile.content = healed.healedCode;
    
    // Save healed code to disk
    const projectRoot = path.join(__dirname, '..');
    await fs.writeFile(
      path.join(projectRoot, testSpecFile.filename),
      healed.healedCode,
      'utf8'
    );
    
    return {
      ...state,
      generatedFiles: state.generatedFiles,
      healAttempts: state.healAttempts + 1,
      healingHistory: [
        ...state.healingHistory,
        {
          attempt: state.healAttempts + 1,
          changes: healed.changes,
          timestamp: new Date().toISOString()
        }
      ],
      status: "healing_complete"
    };
  } catch (error) {
    console.error("Healer node error:", error);
    return {
      ...state,
      status: "failed",
      error: error.message
    };
  }
}

/**
 * Conditional routing function - decides next step after execution
 */
function shouldHeal(state) {
  // If all tests passed, we're done
  if (state.testResults?.failed === 0) {
    return "end";
  }
  
  // If we've exceeded max heal attempts, give up
  if (state.healAttempts >= state.maxHealAttempts) {
    return "end";
  }
  
  // Otherwise, try healing
  return "healer";
}

/**
 * Create and compile the LangGraph workflow
 */
function createWorkflow() {
  const workflow = new StateGraph({
    channels: AgentState
  });
  
  // Add nodes
  workflow.addNode("planner", plannerNode);
  workflow.addNode("generator", generatorNode);
  workflow.addNode("executor", executorNode);
  workflow.addNode("healer", healerNode);
  
  // Define edges (transitions between nodes)
  workflow.addEdge("planner", "generator");
  workflow.addEdge("generator", "executor");
  
  // Conditional edge from executor
  workflow.addConditionalEdges(
    "executor",
    shouldHeal,
    {
      healer: "healer",
      end: END
    }
  );
  
  // After healing, go back to executor to retry
  workflow.addEdge("healer", "executor");
  
  // Set entry point
  workflow.setEntryPoint("planner");
  
  // Compile the graph
  return workflow.compile();
}

/**
 * Execute the complete workflow
 * @param {object} input - Initial state input
 * @returns {AsyncGenerator} Stream of state updates (flat, accumulated state)
 */
async function* executeWorkflow(input) {
  const app = createWorkflow();
  
  const initialState = {
    ...AgentState,
    ...input,
    startTime: new Date().toISOString(),
    status: "running"
  };
  
  let accumulatedState = { ...initialState };
  
  // Stream state updates — LangGraph yields { nodeName: stateUpdate }
  // Unwrap the node key and merge into accumulated flat state
  for await (const nodeOutput of await app.stream(initialState)) {
    const nodeName = Object.keys(nodeOutput)[0];
    const stateUpdate = nodeOutput[nodeName];
    accumulatedState = { ...accumulatedState, ...stateUpdate };
    yield accumulatedState;
  }
}

/**
 * Execute workflow and return final result
 * @param {object} input - Initial state input
 * @returns {Promise<object>} Final state
 */
async function executeWorkflowSync(input) {
  const states = [];
  
  for await (const state of executeWorkflow(input)) {
    states.push(state);
  }
  
  const finalState = states[states.length - 1];
  finalState.endTime = new Date().toISOString();
  finalState.totalDuration = new Date(finalState.endTime) - new Date(finalState.startTime);
  
  return finalState;
}

/**
 * Get workflow visualization data for UI
 */
function getWorkflowVisualization(currentState) {
  const nodes = [
    {
      id: "planner",
      label: "Planner",
      status: currentState.status === "planning_complete" ? "complete" :
              currentState.status.includes("plan") ? "active" : "pending",
      description: "Parse actions & inspect browser"
    },
    {
      id: "generator",
      label: "Generator",
      status: currentState.status === "generation_complete" ? "complete" :
              currentState.status.includes("generat") ? "active" : "pending",
      description: "Generate Playwright tests with AI"
    },
    {
      id: "executor",
      label: "Executor",
      status: currentState.status.includes("execution") ? "complete" :
              currentState.status === "running" ? "active" : "pending",
      description: "Run generated tests"
    },
    {
      id: "healer",
      label: "Healer",
      status: currentState.healAttempts > 0 ? "complete" :
              currentState.status === "healing_complete" ? "active" : "pending",
      description: `Fix failures (${currentState.healAttempts}/${currentState.maxHealAttempts})`
    }
  ];
  
  const edges = [
    { from: "planner", to: "generator", label: "Plan ready" },
    { from: "generator", to: "executor", label: "Tests generated" },
    { from: "executor", to: "healer", label: "If failures", condition: true },
    { from: "healer", to: "executor", label: "Retry", condition: true }
  ];
  
  return { nodes, edges, currentState: currentState.status };
}

export {
  createWorkflow,
  executeWorkflow,
  executeWorkflowSync,
  getWorkflowVisualization,
  AgentState
};