/**
 * Simple JSON-Based Knowledge Base
 * No external dependencies, no Docker, just works!
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_PATH = path.join(process.cwd(), 'data', 'knowledge-base.json');

class TestKnowledgeBase {
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.tests = [];
  }

  async initialize() {
    try {
      console.log("📚 Initializing Test Knowledge Base...");
      console.log(`   Storage: ${STORAGE_PATH}`);
      
      // Create data directory if it doesn't exist
      const dir = path.dirname(STORAGE_PATH);
      await fs.mkdir(dir, { recursive: true });
      
      // Load existing tests
      try {
        const data = await fs.readFile(STORAGE_PATH, 'utf8');
        const parsed = JSON.parse(data);
        this.tests = parsed.tests || [];
      } catch (err) {
        // File doesn't exist yet, start fresh
        this.tests = [];
        await this.save();
      }
      
      console.log(`✅ Knowledge base ready`);
      console.log(`📊 Knowledge base contains ${this.tests.length} test patterns`);
      
      return true;
    } catch (error) {
      console.error("Failed to initialize knowledge base:", error);
      throw error;
    }
  }

  async save() {
    try {
      await fs.writeFile(
        STORAGE_PATH,
        JSON.stringify({ tests: this.tests, lastUpdated: new Date().toISOString() }, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error("Failed to save knowledge base:", error);
    }
  }

  async storeTest(testData) {
    const {
      testCode,
      pageObjectCode,
      feature,
      filename,
      passed = true,
      locatorStrategies = [],
      executionTime = 0,
      url = "",
      userActions = []
    } = testData;
    
    try {
      const test = {
        id: uuidv4(),
        feature,
        filename,
        testCode,
        pageObjectCode,
        passed,
        locatorStrategies,
        executionTime,
        url,
        userActions,
        timestamp: new Date().toISOString()
      };
      
      this.tests.push(test);
      await this.save();
      
      console.log(`✅ Stored test pattern: ${feature}`);
      
      return test.id;
    } catch (error) {
      console.error("Error storing test:", error);
      throw error;
    }
  }

  async findSimilarTests(query, k = 3, filters = {}) {
    try {
      // Simple keyword-based similarity for now
      const queryLower = query.toLowerCase();
      
      let results = this.tests.map(test => {
        const featureMatch = test.feature.toLowerCase().includes(queryLower);
        const urlMatch = test.url.toLowerCase().includes(queryLower);
        const actionsMatch = test.userActions.some(a => 
          a.toLowerCase().includes(queryLower)
        );
        
        let score = 0;
        if (featureMatch) score += 0.5;
        if (urlMatch) score += 0.3;
        if (actionsMatch) score += 0.2;
        
        return {
          content: `Feature: ${test.feature}\nURL: ${test.url}\n\nTest Code:\n${test.testCode}`,
          metadata: {
            feature: test.feature,
            filename: test.filename,
            passed: test.passed,
            executionTime: test.executionTime,
            locatorStrategies: test.locatorStrategies.join(','),
            timestamp: test.timestamp
          },
          similarity: score,
          relevance: this.calculateRelevance(score)
        };
      });
      
      // Apply filters
      if (filters.passed !== undefined) {
        results = results.filter(r => r.metadata.passed === filters.passed);
      }
      if (filters.minSimilarity) {
        results = results.filter(r => r.similarity >= filters.minSimilarity);
      }
      
      // Sort by similarity and return top k
      return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, k);
        
    } catch (error) {
      console.error("Error searching tests:", error);
      return [];
    }
  }

  async getSuccessfulPatterns(feature, limit = 5) {
    return await this.findSimilarTests(
      feature,
      limit,
      { passed: true, minSimilarity: 0.3 }
    );
  }

  async getFailedPatterns(feature, limit = 5) {
    return await this.findSimilarTests(
      feature,
      limit,
      { passed: false }
    );
  }

  extractLocatorStrategies(code) {
    const strategies = new Set();
    
    const patterns = [
      /getByRole\(/g,
      /getByLabel\(/g,
      /getByPlaceholder\(/g,
      /getByText\(/g,
      /getByTestId\(/g,
      /getByTitle\(/g,
      /locator\(/g
    ];
    
    patterns.forEach(pattern => {
      if (pattern.test(code)) {
        const name = pattern.toString().match(/getBy(\w+)|locator/)[0];
        strategies.add(name);
      }
    });
    
    return Array.from(strategies);
  }

  calculateRelevance(similarity) {
    if (similarity >= 0.7) return "Very High";
    if (similarity >= 0.5) return "High";
    if (similarity >= 0.3) return "Medium";
    if (similarity >= 0.1) return "Low";
    return "Very Low";
  }

  async getStats() {
    try {
      const passedTests = this.tests.filter(t => t.passed).length;
      const failedTests = this.tests.filter(t => !t.passed).length;
      const totalExecutionTime = this.tests.reduce((sum, t) => sum + (t.executionTime || 0), 0);
      const uniqueFeatures = new Set(this.tests.map(t => t.feature)).size;
      
      return {
        totalTests: this.tests.length,
        passedTests,
        failedTests,
        successRate: this.tests.length > 0 ? 
          ((passedTests / this.tests.length) * 100).toFixed(1) + '%' : '0%',
        uniqueFeatures,
        avgExecutionTime: this.tests.length > 0 ?
          (totalExecutionTime / this.tests.length).toFixed(2) + 's' : '0s'
      };
    } catch (error) {
      console.error("Error getting stats:", error);
      return {
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        successRate: '0%',
        uniqueFeatures: 0,
        avgExecutionTime: '0s'
      };
    }
  }

  async generateRAGContext(feature, exampleCount = 3) {
    const similarTests = await this.getSuccessfulPatterns(feature, exampleCount);
    
    if (similarTests.length === 0) {
      return "No similar test patterns found in knowledge base.";
    }
    
    let context = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 SIMILAR SUCCESSFUL TEST PATTERNS FROM KNOWLEDGE BASE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

These tests passed successfully and use best practices. Follow their patterns:

`;
    
    similarTests.forEach((test, index) => {
      context += `
EXAMPLE ${index + 1} (Similarity: ${(test.similarity * 100).toFixed(0)}%, Relevance: ${test.relevance}):
Feature: ${test.metadata.feature}
Execution Time: ${test.metadata.executionTime}ms
Locator Strategies: ${test.metadata.locatorStrategies}

${test.content}

---
`;
    });
    
    context += `
Use these patterns as reference for:
- Locator strategy selection
- Test structure and organization  
- Assertion patterns
- Error handling approaches

Generate similar high-quality code following these proven patterns.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    
    return context;
  }

  async clearAll() {
    try {
      this.tests = [];
      await this.save();
      console.log("✅ Knowledge base cleared");
    } catch (error) {
      console.error("Error clearing knowledge base:", error);
      throw error;
    }
  }

  async close() {
    await this.save();
    console.log("👋 Knowledge base connection closed");
  }
}

export { TestKnowledgeBase };