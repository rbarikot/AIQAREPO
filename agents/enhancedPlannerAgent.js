/**
 * ENHANCED PLANNER AGENT
 * 
 * Purpose: Creates detailed test plans from either:
 * 1. Manual user input (existing functionality)
 * 2. Generated scenarios from Scenario Generator (NEW)
 * 
 * Features:
 * - Supports both modes: manual and scenario-based
 * - Creates detailed plans for positive scenarios
 * - Creates detailed plans for negative scenarios
 * - Maintains backward compatibility
 * 
 * Flow:
 * - If scenarios provided → Create plans for all scenarios
 * - If no scenarios → Use existing manual planning logic
 */

import OpenAI from 'openai';
import fs from 'fs/promises';

class EnhancedPlannerAgent {
  constructor(apiKey) {
    this.openai = new OpenAI({ apiKey });
    this.model = 'gpt-4o-mini';
  }

  /**
   * Main planning function - routes to appropriate planning mode
   */
  async createTestPlan(input) {
    try {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📋 ENHANCED PLANNER AGENT ACTIVATED...');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Detect mode: scenario-based or manual
      if (input.scenarios) {
        console.log('🎯 Mode: SCENARIO-BASED PLANNING');
        return await this.createScenarioBasedPlan(input);
      } else {
        console.log('🎯 Mode: MANUAL PLANNING (existing)');
        return await this.createManualPlan(input);
      }

    } catch (error) {
      console.error('❌ Error creating test plan:', error);
      throw error;
    }
  }

  /**
   * UPDATED: Create test plans from scenarios (fast processing)
   */
  async createScenarioBasedPlan(input) {
    const { scenarios, baseUrl, language = 'typescript' } = input;

    console.log(`📊 Processing ${scenarios.totalScenarios} scenarios...`);
    console.log(`   ✅ Positive: ${scenarios.scenarios.positive.length}`);
    console.log(`   ❌ Negative: ${scenarios.scenarios.negative.length}`);

    // For scenarios, we don't need to create new plans via AI
    // The scenarios already contain all the test steps and data
    // We just need to format them into plan structure

    console.log('📋 Formatting scenarios into test plans...');

    // Format positive scenarios as plans
    const positivePlans = scenarios.scenarios.positive.map(scenario => {
      return this.formatScenarioAsPlan(scenario, baseUrl, language);
    });

    // Format negative scenarios as plans
    const negativePlans = scenarios.scenarios.negative.map(scenario => {
      return this.formatScenarioAsPlan(scenario, baseUrl, language);
    });

    const comprehensivePlan = {
      feature: scenarios.feature,
      baseUrl: baseUrl,
      language: language,
      sessionId: scenarios.sessionId,
      testPlans: {
        positive: positivePlans,
        negative: negativePlans,
      },
      totalPlans: positivePlans.length + negativePlans.length,
      summary: `Formatted ${positivePlans.length + negativePlans.length} test plans from recorded scenarios`,
      createdAt: new Date().toISOString(),
    };

    // Save plan
    await this.savePlan(comprehensivePlan, scenarios.sessionId);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Created ${comprehensivePlan.totalPlans} test plans:`);
    console.log(`   ✅ Positive: ${positivePlans.length}`);
    console.log(`   ❌ Negative: ${negativePlans.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return comprehensivePlan;
  }

  /**
   * NEW: Format a scenario into a plan structure (no AI needed)
   */
  formatScenarioAsPlan(scenario, baseUrl, language) {
    return {
      scenarioId: scenario.scenarioId,
      testType: scenario.type === 'positive' ? 'e2e' : 'negative',
      pageTitle: 'Test Page',
      summary: scenario.title,
      description: scenario.description,
      
      // Convert scenario steps to plan format
      journeySteps: scenario.steps.map((step, index) => {
        return {
          step: index + 1,
          action: step.action,
          element: step.element || step.field,
          value: step.value,
          description: step.description || `${step.action} ${step.element || step.field || ''}`,
          locatorStrategy: step.locatorStrategy || 'auto',
        };
      }),

      // Page elements from scenario
      pageElements: this.extractPageElementsFromScenario(scenario),

      // Expected outcomes
      assertions: this.extractAssertionsFromScenario(scenario),

      // Test data
      testDataSets: {
        main: scenario.testData || {},
        expectedOutcome: scenario.expectedOutcome || {},
      },

      recommendations: scenario.tags || [],

      _inspection: {
        url: baseUrl,
        timestamp: Date.now(),
        realInspection: false, // From scenario, not live inspection
      },
      _journeySteps: scenario.steps?.length || 0,
      _scenarioOriginal: scenario,
    };
  }

  /**
   * NEW: Extract page elements from scenario
   */
  extractPageElementsFromScenario(scenario) {
    const elements = [];
    const seen = new Set();

    scenario.steps.forEach(step => {
      const elementName = step.element || step.field;
      if (elementName && !seen.has(elementName)) {
        seen.add(elementName);
        elements.push({
          name: elementName,
          locatorStrategy: step.locatorStrategy || 'auto',
          locatorValue: elementName,
          description: `Element for ${step.action}`,
        });
      }
    });

    return elements;
  }

  /**
   * NEW: Extract assertions from scenario
   */
  extractAssertionsFromScenario(scenario) {
    const assertions = [];

    if (scenario.expectedOutcome) {
      if (scenario.expectedOutcome.successMessage) {
        assertions.push({
          type: 'visible',
          element: 'success message',
          expectedValue: scenario.expectedOutcome.successMessage,
        });
      }

      if (scenario.expectedOutcome.errorMessage) {
        assertions.push({
          type: 'visible',
          element: 'error message',
          expectedValue: scenario.expectedOutcome.errorMessage,
        });
      }

      if (scenario.expectedOutcome.redirectUrl) {
        assertions.push({
          type: 'url',
          expectedValue: scenario.expectedOutcome.redirectUrl,
        });
      }
    }

    return assertions;
  }

  /**
   * EXISTING: Manual planning mode (backward compatible)
   */
  async createManualPlan(input) {
    // This is your existing planner logic
    // Keep it exactly as is for backward compatibility
    
    const { baseUrl, customInstructions = '', language = 'typescript' } = input;

    console.log(`🌐 URL: ${baseUrl}`);
    console.log(`📝 Custom Instructions: ${customInstructions || 'None'}`);

    // Your existing planning logic here...
    // (Use your actual existing planner code)

    const plan = {
      testType: 'e2e',
      summary: `Manual test plan for ${baseUrl}`,
      pageTitle: 'To be detected',
      pageElements: [],
      journeySteps: [],
      testDataSets: {},
      recommendations: [],
      _inspection: {
        url: baseUrl,
        timestamp: Date.now(),
        realInspection: true,
      },
    };

    return plan;
  }

  /**
   * Save test plan to file
   */
  async savePlan(plan, sessionId) {
    const plansDir = 'recordings/plans';
    await fs.mkdir(plansDir, { recursive: true });
    
    const filename = `plan-${sessionId}.json`;
    const filepath = `${plansDir}/${filename}`;
    
    await fs.writeFile(filepath, JSON.stringify(plan, null, 2));
    
    console.log(`💾 Plan saved to: ${filepath}`);
    return filepath;
  }

  /**
   * Get plan statistics
   */
  getPlanStats(plan) {
    if (plan.testPlans) {
      // Scenario-based plan
      return {
        mode: 'scenario-based',
        total: plan.totalPlans,
        positive: plan.testPlans.positive.length,
        negative: plan.testPlans.negative.length,
        feature: plan.feature,
      };
    } else {
      // Manual plan
      return {
        mode: 'manual',
        steps: plan._journeySteps,
        elements: plan.pageElements?.length || 0,
      };
    }
  }
}

export default EnhancedPlannerAgent;