/**
 * SCENARIO GENERATOR AGENT
 * 
 * Purpose: Generates comprehensive positive and negative test scenarios from recorded user journey
 * 
 * Features:
 * - Creates 5-10 positive test scenarios (valid flows)
 * - Creates 10-15 negative test scenarios (error cases)
 * - Uses AI to intelligently generate scenario variations
 * - Considers field validations, boundary values, permissions
 * 
 * Flow:
 * 1. Receives recorded journey data
 * 2. Analyzes user actions and page elements
 * 3. Generates positive scenarios
 * 4. Generates negative scenarios
 * 5. Returns structured scenarios for Planner Agent
 */

import OpenAI from 'openai';
import fs from 'fs/promises';

class ScenarioGeneratorAgent {
  constructor(apiKey) {
    this.openai = new OpenAI({ apiKey });
    this.model = 'gpt-4o-mini';
  }

  /**
   * Generate comprehensive test scenarios from recorded journey
   */
  async generateScenarios(journeyData, options = {}) {
    try {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🎯 SCENARIO GENERATOR AGENT ACTIVATED...');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📊 Analyzing ${journeyData.totalSteps} recorded steps...`);

      // Extract journey insights
      const insights = this.extractJourneyInsights(journeyData);
      console.log(`✨ Extracted insights: ${insights.formFields.length} fields, ${insights.actions.length} actions`);

      // Generate positive scenarios
      console.log('✅ Generating positive scenarios...');
      const positiveScenarios = await this.generatePositiveScenarios(journeyData, insights, options);
      console.log(`   Generated ${positiveScenarios.length} positive scenarios`);

      // Generate negative scenarios
      console.log('❌ Generating negative scenarios...');
      const negativeScenarios = await this.generateNegativeScenarios(journeyData, insights, options);
      console.log(`   Generated ${negativeScenarios.length} negative scenarios`);

      // Combine and structure results
      const allScenarios = {
        sessionId: journeyData.sessionId,
        feature: this.detectFeatureName(journeyData),
        baseUrl: options.baseUrl || journeyData.steps[0]?.url || '',
        recordedJourney: journeyData,
        insights: insights,
        scenarios: {
          positive: positiveScenarios,
          negative: negativeScenarios,
        },
        totalScenarios: positiveScenarios.length + negativeScenarios.length,
        generatedAt: new Date().toISOString(),
      };

      // Save scenarios
      await this.saveScenarios(allScenarios);

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`✅ Generated ${allScenarios.totalScenarios} scenarios:`);
      console.log(`   ✅ Positive: ${positiveScenarios.length}`);
      console.log(`   ❌ Negative: ${negativeScenarios.length}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      return allScenarios;

    } catch (error) {
      console.error('❌ Error generating scenarios:', error);
      throw error;
    }
  }

  /**
   * Extract insights from recorded journey
   */
  extractJourneyInsights(journeyData) {
    const insights = {
      formFields: [],
      actions: [],
      navigations: [],
      validations: [],
      buttons: [],
    };

    // Analyze each step
    journeyData.steps.forEach((step) => {
      if (step.action === 'fill') {
        insights.formFields.push({
          name: step.element.name || step.element.id,
          type: step.element.type,
          placeholder: step.element.placeholder,
          ariaLabel: step.element.ariaLabel,
          value: step.value,
          required: step.element.required,
        });
      } else if (step.action === 'click') {
        insights.buttons.push({
          text: step.element.text,
          type: step.element.type,
          role: step.element.role,
        });
      } else if (step.action === 'navigate') {
        insights.navigations.push({
          url: step.url,
          pageTitle: step.pageTitle,
        });
      }

      insights.actions.push(step.action);
    });

    // Detect validation patterns
    insights.validations = this.detectValidationPatterns(insights.formFields);

    return insights;
  }

  /**
   * Detect validation patterns from form fields
   */
  detectValidationPatterns(formFields) {
    const patterns = [];

    formFields.forEach((field) => {
      // Email validation
      if (field.type === 'email' || field.name?.includes('email')) {
        patterns.push({
          field: field.name,
          type: 'email',
          rules: ['valid email format', 'no spaces', 'contains @'],
        });
      }

      // Password validation
      if (field.type === 'password') {
        patterns.push({
          field: field.name,
          type: 'password',
          rules: ['min length', 'max length', 'special characters'],
        });
      }

      // Required fields
      if (field.required) {
        patterns.push({
          field: field.name,
          type: 'required',
          rules: ['cannot be empty'],
        });
      }

      // Number fields
      if (field.type === 'number' || field.type === 'tel') {
        patterns.push({
          field: field.name,
          type: 'numeric',
          rules: ['only numbers', 'min/max values'],
        });
      }
    });

    return patterns;
  }

  /**
   * Detect feature name from journey
   */
  detectFeatureName(journeyData) {
    const firstUrl = journeyData.steps[0]?.url || '';
    const pageTitle = journeyData.steps[0]?.pageTitle || '';

    // Try to extract feature from URL or title
    if (firstUrl.includes('login') || pageTitle.toLowerCase().includes('login')) {
      return 'Login';
    } else if (firstUrl.includes('signup') || firstUrl.includes('register')) {
      return 'Signup';
    } else if (firstUrl.includes('checkout')) {
      return 'Checkout';
    } else if (firstUrl.includes('profile')) {
      return 'Profile';
    }

    // Default to first meaningful action
    const firstFillAction = journeyData.steps.find(s => s.action === 'fill');
    if (firstFillAction) {
      return firstFillAction.element.name || 'FormSubmission';
    }

    return 'UserFlow';
  }

  /**
   * Generate positive test scenarios
   */
  async generatePositiveScenarios(journeyData, insights, options) {
    const prompt = `
You are an expert QA engineer. Analyze this recorded user journey and generate POSITIVE test scenarios.

RECORDED JOURNEY:
${JSON.stringify({
  steps: journeyData.steps.map(s => ({
    action: s.action,
    element: s.element,
    value: s.value,
  })),
  formFields: insights.formFields,
}, null, 2)}

TASK: Generate 5-10 POSITIVE test scenarios that cover:
1. Happy path (exact recorded flow)
2. Alternative valid paths (different order, optional fields)
3. Boundary valid values (min/max valid inputs)
4. Different valid data combinations
5. Success message verification

REQUIREMENTS:
- Each scenario must be a valid, successful flow
- Include clear test steps
- Specify expected outcomes
- Include test data to use

OUTPUT FORMAT (respond with a JSON object containing a "scenarios" array, no markdown):
{
  "scenarios": [
  {
    "scenarioId": "POS-001",
    "title": "Successful login with valid credentials",
    "description": "User logs in with correct username and password",
    "type": "positive",
    "priority": "high",
    "steps": [
      {
        "stepNumber": 1,
        "action": "navigate",
        "url": "https://example.com/login"
      },
      {
        "stepNumber": 2,
        "action": "fill",
        "field": "username",
        "value": "testuser@example.com",
        "locatorStrategy": "getByLabel"
      },
      {
        "stepNumber": 3,
        "action": "fill",
        "field": "password",
        "value": "ValidPass123!",
        "locatorStrategy": "getByLabel"
      },
      {
        "stepNumber": 4,
        "action": "click",
        "element": "Login button",
        "locatorStrategy": "getByRole"
      }
    ],
    "expectedOutcome": {
      "successMessage": "Welcome back!",
      "redirectUrl": "/dashboard",
      "elementsVisible": ["user profile", "logout button"]
    },
    "testData": {
      "username": "testuser@example.com",
      "password": "ValidPass123!"
    },
    "tags": ["happy-path", "authentication"]
  }
  ]
}

Generate comprehensive positive scenarios now:`;

    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content.trim();
    
    return this.safeParseJSON(content, 'positive');
  }

  /**
   * Generate negative test scenarios
   */
  async generateNegativeScenarios(journeyData, insights, options) {
    const prompt = `
You are an expert QA engineer. Analyze this recorded user journey and generate NEGATIVE test scenarios.

RECORDED JOURNEY:
${JSON.stringify({
  steps: journeyData.steps.map(s => ({
    action: s.action,
    element: s.element,
    value: s.value,
  })),
  formFields: insights.formFields,
  validations: insights.validations,
}, null, 2)}

TASK: Generate 10-15 NEGATIVE test scenarios that cover:
1. Invalid input formats (wrong email, special characters)
2. Missing required fields
3. Boundary invalid values (too short, too long)
4. SQL injection attempts
5. XSS attempts  
6. Invalid credentials
7. Expired sessions
8. Permission denied scenarios
9. Network failure scenarios
10. Concurrent user conflicts
11. Invalid combinations
12. Empty submissions

REQUIREMENTS:
- Each scenario must trigger an error/validation message
- Include specific error messages to verify
- Include the invalid test data
- Cover security vulnerabilities

OUTPUT FORMAT (respond with a JSON object containing a "scenarios" array, no markdown):
{
  "scenarios": [
  {
    "scenarioId": "NEG-001",
    "title": "Login fails with invalid email format",
    "description": "User attempts login with improperly formatted email",
    "type": "negative",
    "priority": "high",
    "category": "validation",
    "steps": [
      {
        "stepNumber": 1,
        "action": "navigate",
        "url": "https://example.com/login"
      },
      {
        "stepNumber": 2,
        "action": "fill",
        "field": "username",
        "value": "notanemail",
        "locatorStrategy": "getByLabel"
      },
      {
        "stepNumber": 3,
        "action": "fill",
        "field": "password",
        "value": "ValidPass123!",
        "locatorStrategy": "getByLabel"
      },
      {
        "stepNumber": 4,
        "action": "click",
        "element": "Login button",
        "locatorStrategy": "getByRole"
      }
    ],
    "expectedOutcome": {
      "errorMessage": "Please enter a valid email address",
      "fieldHighlighted": "username",
      "submitBlocked": true
    },
    "testData": {
      "username": "notanemail",
      "password": "ValidPass123!"
    },
    "tags": ["validation", "email-format"],
    "securityRelevance": "low"
  }
  ]
}

Generate comprehensive negative scenarios now:`;

    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8, // Slightly higher for more creative edge cases
      max_tokens: 6000,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content.trim();
    
    return this.safeParseJSON(content, 'negative');
  }

  /**
   * Safely parse JSON from AI response, handling common LLM output issues
   */
  safeParseJSON(content, label = '') {
    // Remove markdown code blocks if present
    let jsonContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    try {
      const parsed = JSON.parse(jsonContent);
      // response_format wraps in an object like { "scenarios": [...] }
      if (Array.isArray(parsed)) return parsed;
      // Find first array value in the object
      const arrKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
      if (arrKey) return parsed[arrKey];
      return parsed;
    } catch (firstError) {
      console.warn(`⚠️ JSON parse failed for ${label} scenarios, attempting repair...`);

      // Try to extract the JSON array from the content
      const arrayMatch = jsonContent.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (arrayMatch) {
        try {
          return JSON.parse(arrayMatch[0]);
        } catch (_) {
          // Fall through
        }
      }

      // Try truncating to find last complete object in array
      const lastCloseBrace = jsonContent.lastIndexOf('}');
      if (lastCloseBrace !== -1) {
        const truncated = jsonContent.substring(0, lastCloseBrace + 1) + ']';
        // Find the opening bracket
        const firstBracket = truncated.indexOf('[');
        if (firstBracket !== -1) {
          try {
            return JSON.parse(truncated.substring(firstBracket));
          } catch (_) {
            // Fall through
          }
        }
      }

      console.error(`❌ Could not repair JSON for ${label} scenarios, returning empty array`);
      return [];
    }
  }

  /**
   * Save generated scenarios to file
   */
  async saveScenarios(scenarios) {
    const scenariosDir = 'recordings/scenarios';
    await fs.mkdir(scenariosDir, { recursive: true });
    
    const filename = `scenarios-${scenarios.sessionId}.json`;
    const filepath = `${scenariosDir}/${filename}`;
    
    await fs.writeFile(filepath, JSON.stringify(scenarios, null, 2));
    
    console.log(`💾 Scenarios saved to: ${filepath}`);
    return filepath;
  }

  /**
   * Load previously generated scenarios
   */
  async loadScenarios(sessionId) {
    const filepath = `recordings/scenarios/scenarios-${sessionId}.json`;
    const data = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(data);
  }

  /**
   * Get scenario statistics
   */
  getScenarioStats(scenarios) {
    const positiveCount = scenarios.scenarios.positive.length;
    const negativeCount = scenarios.scenarios.negative.length;
    
    const negativeCategories = scenarios.scenarios.negative.reduce((acc, s) => {
      acc[s.category] = (acc[s.category] || 0) + 1;
      return acc;
    }, {});

    return {
      total: scenarios.totalScenarios,
      positive: positiveCount,
      negative: negativeCount,
      coverage: {
        validationTests: negativeCategories.validation || 0,
        securityTests: negativeCategories.security || 0,
        boundaryTests: negativeCategories.boundary || 0,
        permissionTests: negativeCategories.permission || 0,
      },
      feature: scenarios.feature,
    };
  }
}

export default ScenarioGeneratorAgent;