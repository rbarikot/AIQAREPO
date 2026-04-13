/**
 * WORKFLOW ORCHESTRATOR
 * 
 * Purpose: Orchestrates the complete test generation workflow
 * 
 * Workflows:
 * 
 * 1. RECORD & GENERATE (NEW):
 *    User Action → Recorder → Scenarios → Planner → Generator → Tests
 * 
 * 2. DIRECT GENERATE (EXISTING):
 *    User Input → Planner → Generator → Tests
 * 
 * 3. SCENARIO FROM FILE:
 *    Load Scenarios → Planner → Generator → Tests
 */

import ScenarioGeneratorAgent from '../agents/scenarioGeneratorAgent.js';
import EnhancedPlannerAgent from '../agents/enhancedPlannerAgent.js';
import fs from 'fs/promises';

class WorkflowOrchestrator {
  constructor(config) {
    // Don't create new instances - they will be injected
    this.recorderAgent = config.recorderAgent || null;
    this.scenarioGenerator = new ScenarioGeneratorAgent(config.openaiApiKey);
    this.plannerAgent = new EnhancedPlannerAgent(config.openaiApiKey);
    this.activeRecordingSessions = new Map();
  }

  /**
   * WORKFLOW 1: Complete Record & Generate Flow
   */
  async recordAndGenerate(baseUrl, config = {}) {
    try {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🎬 STARTING RECORD & GENERATE WORKFLOW');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Step 1: Start Recording
      console.log('\n📍 STEP 1: Recording User Actions...');
      const recordingSession = await this.recorderAgent.startRecording(baseUrl, config);
      const sessionId = recordingSession.sessionId;
      
      this.activeRecordingSessions.set(sessionId, {
        startTime: Date.now(),
        baseUrl,
        status: 'recording',
      });

      return {
        success: true,
        sessionId,
        message: 'Recording started. Browser is open. Perform your actions and call stopRecording() when done.',
        workflow: 'record-and-generate',
      };

    } catch (error) {
      console.error('❌ Workflow error:', error);
      throw error;
    }
  }

  /**
   * Stop recording and continue with scenario generation
   */
  async stopRecordingAndContinue(sessionId, options = {}) {
    try {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🛑 STOPPING RECORDING & CONTINUING WORKFLOW');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Step 2: Stop Recording & Get Journey Data
      console.log('\n📍 STEP 2: Saving Recorded Journey...');
      const journeyData = await this.recorderAgent.stopRecording();
      console.log(`✅ Recorded ${journeyData.totalSteps} steps`);

      // Step 3: Generate Scenarios
      console.log('\n📍 STEP 3: Generating Test Scenarios...');
      const scenarios = await this.scenarioGenerator.generateScenarios(journeyData, options);
      console.log(`✅ Generated ${scenarios.totalScenarios} scenarios`);

      // Step 4: Create Test Plans
      console.log('\n📍 STEP 4: Creating Detailed Test Plans...');
      
      // Get baseUrl from journey data or session
      let baseUrl = options.baseUrl; // First priority: explicit baseUrl in options
      
      if (!baseUrl) {
        // Try to get from session
        const session = this.activeRecordingSessions.get(sessionId);
        if (session && session.baseUrl) {
          baseUrl = session.baseUrl;
        }
      }
      
      if (!baseUrl) {
        // Try to get from journey data (first step URL or initial snapshot)
        if (journeyData.steps && journeyData.steps.length > 0) {
          baseUrl = journeyData.steps[0].url;
        } else if (journeyData.finalSnapshot && journeyData.finalSnapshot.url) {
          baseUrl = journeyData.finalSnapshot.url;
        }
      }
      
      if (!baseUrl) {
        throw new Error('Could not determine baseUrl. Please provide it in options: { baseUrl: "..." }');
      }
      
      console.log(`🌐 Using baseUrl: ${baseUrl}`);
      
      const plans = await this.plannerAgent.createTestPlan({
        scenarios,
        baseUrl: baseUrl,
        language: options.language || 'typescript',
      });
      console.log(`✅ Created ${plans.totalPlans} test plans`);

      // Update or create session
      const existingSession = this.activeRecordingSessions.get(sessionId);
      
      this.activeRecordingSessions.set(sessionId, {
        ...(existingSession || {}), // Keep existing data if available
        baseUrl: baseUrl,
        status: 'completed',
        journeyData,
        scenarios,
        plans,
        completedAt: Date.now(),
        startTime: existingSession?.startTime || Date.now(),
      });

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ WORKFLOW COMPLETED SUCCESSFULLY!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📊 Summary:`);
      console.log(`   - Steps Recorded: ${journeyData.totalSteps}`);
      console.log(`   - Scenarios Generated: ${scenarios.totalScenarios}`);
      console.log(`   - Test Plans Created: ${plans.totalPlans}`);
      console.log(`   - Ready for Test Generation!`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      return {
        success: true,
        sessionId,
        workflow: 'record-and-generate',
        results: {
          journey: journeyData,
          scenarios,
          plans,
        },
        readyForGeneration: true,
        message: `Workflow completed! Ready to generate ${plans.totalPlans} test files.`,
      };

    } catch (error) {
      console.error('❌ Workflow error:', error);
      throw error;
    }
  }

  /**
   * Generate all test files from plans
   */
  async generateAllTestsFromPlans(sessionId, generatorAgent) {
    try {
      const session = this.activeRecordingSessions.get(sessionId);
      
      if (!session || !session.plans) {
        throw new Error('No plans found for this session. Complete the workflow first.');
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔨 GENERATING ALL TEST FILES...');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      const generatedTests = [];

      // Generate positive tests
      console.log('\n✅ Generating POSITIVE test files...');
      for (const plan of session.plans.testPlans.positive) {
        console.log(`   Generating: ${plan.scenarioId} - ${plan._scenarioOriginal.title}`);
        
        // Call generator agent for this plan
        const testFiles = await generatorAgent.generateTest({
          plan,
          baseUrl: session.baseUrl,
          language: session.plans.language,
        });

        generatedTests.push({
          scenarioId: plan.scenarioId,
          type: 'positive',
          files: testFiles,
        });
      }

      // Generate negative tests
      console.log('\n❌ Generating NEGATIVE test files...');
      for (const plan of session.plans.testPlans.negative) {
        console.log(`   Generating: ${plan.scenarioId} - ${plan._scenarioOriginal.title}`);
        
        const testFiles = await generatorAgent.generateTest({
          plan,
          baseUrl: session.baseUrl,
          language: session.plans.language,
        });

        generatedTests.push({
          scenarioId: plan.scenarioId,
          type: 'negative',
          files: testFiles,
        });
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`✅ GENERATED ${generatedTests.length} TEST FILES!`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      return {
        success: true,
        sessionId,
        totalTests: generatedTests.length,
        tests: generatedTests,
      };

    } catch (error) {
      console.error('❌ Generation error:', error);
      throw error;
    }
  }

  /**
   * WORKFLOW 2: Load scenarios from file and generate
   */
  async generateFromSavedScenarios(sessionId, generatorAgent, options = {}) {
    try {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📂 LOADING SAVED SCENARIOS...');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Load scenarios
      const scenarios = await this.scenarioGenerator.loadScenarios(sessionId);
      console.log(`✅ Loaded ${scenarios.totalScenarios} scenarios`);

      // Create plans
      const plans = await this.plannerAgent.createTestPlan({
        scenarios,
        baseUrl: scenarios.baseUrl,
        language: options.language || 'typescript',
      });

      // Store in session
      this.activeRecordingSessions.set(sessionId, {
        scenarios,
        plans,
        status: 'ready',
      });

      // Generate tests
      return await this.generateAllTestsFromPlans(sessionId, generatorAgent);

    } catch (error) {
      console.error('❌ Error loading scenarios:', error);
      throw error;
    }
  }

  /**
   * Get session status
   */
  getSessionStatus(sessionId) {
    const session = this.activeRecordingSessions.get(sessionId);
    
    if (!session) {
      return { exists: false };
    }

    return {
      exists: true,
      status: session.status,
      baseUrl: session.baseUrl,
      stepsRecorded: session.journeyData?.totalSteps || 0,
      scenariosGenerated: session.scenarios?.totalScenarios || 0,
      plansCreated: session.plans?.totalPlans || 0,
      duration: session.completedAt 
        ? session.completedAt - session.startTime 
        : Date.now() - session.startTime,
    };
  }

  /**
   * List all sessions
   */
  async listAllSessions() {
    const sessions = [];
    
    // Get all journey files
    const journeyDir = 'recordings';
    try {
      const files = await fs.readdir(journeyDir);
      const journeyFiles = files.filter(f => f.startsWith('journey-'));
      
      for (const file of journeyFiles) {
        const sessionId = file.replace('journey-', '').replace('.json', '');
        const data = await fs.readFile(`${journeyDir}/${file}`, 'utf-8');
        const journey = JSON.parse(data);
        
        sessions.push({
          sessionId,
          steps: journey.totalSteps,
          duration: journey.duration,
          recordedAt: journey.recordedAt,
        });
      }
    } catch (error) {
      // Directory doesn't exist yet
    }

    return sessions;
  }

  /**
   * Clean up old sessions
   */
  cleanupSession(sessionId) {
    this.activeRecordingSessions.delete(sessionId);
  }
}

export default WorkflowOrchestrator;