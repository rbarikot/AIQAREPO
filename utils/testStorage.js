/**
 * Test Storage System - Persistent Test Management
 * 
 * This system stores all generated Playwright tests with metadata in a
 * JSON-based database. It provides CRUD operations and search capabilities.
 * 
 * Features:
 * - Store tests with full metadata
 * - Search by feature, URL, date
 * - Track test evolution and versions
 * - Export/import test suites
 */

import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_DIR = path.join(__dirname, '..', 'data', 'tests');
const INDEX_FILE = path.join(STORAGE_DIR, 'index.json');

class TestStorage {
  constructor() {
    this.index = {
      tests: [],
      metadata: {
        totalTests: 0,
        lastUpdated: null,
        version: "1.0"
      }
    };
  }

  /**
   * Initialize storage directory and load index
   */
  async initialize() {
    try {
      // Create storage directory
      await fs.mkdir(STORAGE_DIR, { recursive: true });
      
      // Load existing index or create new one
      try {
        const data = await fs.readFile(INDEX_FILE, 'utf8');
        this.index = JSON.parse(data);
        console.log(`✅ Loaded ${this.index.tests.length} tests from storage`);
      } catch (error) {
        // Index doesn't exist, create new one
        await this.saveIndex();
        console.log("✅ Initialized new test storage");
      }
      
      return true;
    } catch (error) {
      console.error("Failed to initialize test storage:", error);
      throw error;
    }
  }

  /**
   * Save index to disk
   */
  async saveIndex() {
    this.index.metadata.lastUpdated = new Date().toISOString();
    this.index.metadata.totalTests = this.index.tests.length;
    
    await fs.writeFile(
      INDEX_FILE,
      JSON.stringify(this.index, null, 2),
      'utf8'
    );
  }

  /**
   * Store a new test
   * @param {object} testData - Complete test data
   * @returns {Promise<string>} Test ID
   */
  async storeTest(testData) {
    const {
      feature,
      url,
      userActions,
      files, // Array of {filename, type, content}
      plan,
      inspectionData,
      testResults,
      language = "typescript",
      passed = null,
      executionTime = 0
    } = testData;
    
    const testId = uuidv4();
    const timestamp = new Date().toISOString();
    
    // Create test record
    const testRecord = {
      id: testId,
      feature,
      url,
      userActions,
      language,
      timestamp,
      passed,
      executionTime,
      fileCount: files.length,
      version: 1,
      tags: this.extractTags(feature, userActions),
      
      // Summary
      summary: {
        pageObjectFile: files.find(f => f.type === 'page-object')?.filename,
        testSpecFile: files.find(f => f.type === 'test-spec')?.filename,
        locatorCount: this.countLocators(files),
        testCount: this.countTests(files)
      }
    };
    
    // Save full test data to separate file
    const testFilePath = path.join(STORAGE_DIR, `${testId}.json`);
    await fs.writeFile(
      testFilePath,
      JSON.stringify({
        ...testRecord,
        files,
        plan,
        inspectionData,
        testResults
      }, null, 2),
      'utf8'
    );
    
    // Add to index
    this.index.tests.push(testRecord);
    await this.saveIndex();
    
    console.log(`💾 Stored test: ${feature} (ID: ${testId})`);
    
    return testId;
  }

  /**
   * Get a test by ID
   * @param {string} testId - Test ID
   * @returns {Promise<object>} Complete test data
   */
  async getTest(testId) {
    const testFilePath = path.join(STORAGE_DIR, `${testId}.json`);
    
    try {
      const data = await fs.readFile(testFilePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error(`Test not found: ${testId}`);
      return null;
    }
  }

  /**
   * Search tests by criteria
   * @param {object} criteria - Search criteria
   * @returns {Array} Matching tests
   */
  searchTests(criteria = {}) {
    const {
      feature,
      url,
      passed,
      language,
      startDate,
      endDate,
      tags
    } = criteria;
    
    return this.index.tests.filter(test => {
      if (feature && !test.feature.toLowerCase().includes(feature.toLowerCase())) {
        return false;
      }
      
      if (url && !test.url.includes(url)) {
        return false;
      }
      
      if (passed !== undefined && test.passed !== passed) {
        return false;
      }
      
      if (language && test.language !== language) {
        return false;
      }
      
      if (startDate && new Date(test.timestamp) < new Date(startDate)) {
        return false;
      }
      
      if (endDate && new Date(test.timestamp) > new Date(endDate)) {
        return false;
      }
      
      if (tags && tags.length > 0) {
        const hasAllTags = tags.every(tag => test.tags.includes(tag));
        if (!hasAllTags) return false;
      }
      
      return true;
    });
  }

  /**
   * Get recent tests
   * @param {number} limit - Number of tests to return
   * @returns {Array} Recent tests
   */
  getRecentTests(limit = 10) {
    return this.index.tests
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  /**
   * Update test execution results
   * @param {string} testId - Test ID
   * @param {object} results - Execution results
   */
  async updateTestResults(testId, results) {
    // Update in index
    const testIndex = this.index.tests.findIndex(t => t.id === testId);
    if (testIndex === -1) {
      throw new Error(`Test not found: ${testId}`);
    }
    
    this.index.tests[testIndex].passed = results.failed === 0;
    this.index.tests[testIndex].executionTime = results.duration;
    
    // Update in full test file
    const test = await this.getTest(testId);
    if (test) {
      test.testResults = results;
      test.passed = results.failed === 0;
      test.executionTime = results.duration;
      
      const testFilePath = path.join(STORAGE_DIR, `${testId}.json`);
      await fs.writeFile(testFilePath, JSON.stringify(test, null, 2), 'utf8');
    }
    
    await this.saveIndex();
  }

  /**
   * Delete a test
   * @param {string} testId - Test ID
   */
  async deleteTest(testId) {
    // Remove from index
    this.index.tests = this.index.tests.filter(t => t.id !== testId);
    
    // Delete file
    const testFilePath = path.join(STORAGE_DIR, `${testId}.json`);
    try {
      await fs.unlink(testFilePath);
    } catch (error) {
      console.error(`Failed to delete test file: ${testId}`);
    }
    
    await this.saveIndex();
    console.log(`🗑️ Deleted test: ${testId}`);
  }

  /**
   * Get statistics
   * @returns {object} Storage statistics
   */
  async getStats() {
    const total = this.index.tests.length;
    const passed = this.index.tests.filter(t => t.passed === true).length;
    const failed = this.index.tests.filter(t => t.passed === false).length;
    const pending = this.index.tests.filter(t => t.passed === null).length;
    
    // Calculate storage size
    const files = await fs.readdir(STORAGE_DIR);
    let totalSize = 0;
    for (const file of files) {
      const stats = await fs.stat(path.join(STORAGE_DIR, file));
      totalSize += stats.size;
    }
    
    return {
      totalTests: total,
      passedTests: passed,
      failedTests: failed,
      pendingTests: pending,
      successRate: total > 0 ? ((passed / total) * 100).toFixed(1) + '%' : '0%',
      storageSize: this.formatBytes(totalSize),
      languages: {
        typescript: this.index.tests.filter(t => t.language === 'typescript').length,
        javascript: this.index.tests.filter(t => t.language === 'javascript').length
      }
    };
  }

  /**
   * Export tests to a single file
   * @param {Array<string>} testIds - Test IDs to export (empty = all)
   * @returns {Promise<string>} Export file path
   */
  async exportTests(testIds = []) {
    const testsToExport = testIds.length > 0
      ? testIds
      : this.index.tests.map(t => t.id);
    
    const exportData = {
      exportDate: new Date().toISOString(),
      testCount: testsToExport.length,
      tests: []
    };
    
    for (const testId of testsToExport) {
      const test = await this.getTest(testId);
      if (test) {
        exportData.tests.push(test);
      }
    }
    
    const exportFile = path.join(STORAGE_DIR, `export_${Date.now()}.json`);
    await fs.writeFile(exportFile, JSON.stringify(exportData, null, 2), 'utf8');
    
    console.log(`📦 Exported ${exportData.testCount} tests to ${exportFile}`);
    return exportFile;
  }

  /**
   * Import tests from export file
   * @param {string} exportFile - Path to export file
   * @returns {Promise<number>} Number of tests imported
   */
  async importTests(exportFile) {
    const data = await fs.readFile(exportFile, 'utf8');
    const exportData = JSON.parse(data);
    
    let importedCount = 0;
    
    for (const test of exportData.tests) {
      // Generate new ID to avoid conflicts
      const newTestId = uuidv4();
      test.id = newTestId;
      test.timestamp = new Date().toISOString();
      
      await this.storeTest(test);
      importedCount++;
    }
    
    console.log(`📥 Imported ${importedCount} tests`);
    return importedCount;
  }

  /**
   * Helper: Extract tags from feature and actions
   */
  extractTags(feature, userActions) {
    const tags = new Set();
    
    // Add feature-based tags
    const featureLower = feature.toLowerCase();
    if (featureLower.includes('login')) tags.add('login');
    if (featureLower.includes('signup') || featureLower.includes('register')) tags.add('signup');
    if (featureLower.includes('form')) tags.add('form');
    if (featureLower.includes('navigation')) tags.add('navigation');
    if (featureLower.includes('checkout')) tags.add('checkout');
    
    // Add action-based tags
    const allActions = userActions.join(' ').toLowerCase();
    if (allActions.includes('click')) tags.add('click');
    if (allActions.includes('enter') || allActions.includes('fill')) tags.add('input');
    if (allActions.includes('select')) tags.add('select');
    
    return Array.from(tags);
  }

  /**
   * Helper: Count locators in files
   */
  countLocators(files) {
    let count = 0;
    const pageObject = files.find(f => f.type === 'page-object');
    
    if (pageObject) {
      const locatorPatterns = [
        /getByRole\(/g,
        /getByLabel\(/g,
        /getByPlaceholder\(/g,
        /getByText\(/g,
        /getByTestId\(/g
      ];
      
      locatorPatterns.forEach(pattern => {
        const matches = pageObject.content.match(pattern);
        if (matches) count += matches.length;
      });
    }
    
    return count;
  }

  /**
   * Helper: Count tests in spec file
   */
  countTests(files) {
    const testSpec = files.find(f => f.type === 'test-spec');
    
    if (testSpec) {
      const matches = testSpec.content.match(/test\(/g);
      return matches ? matches.length : 0;
    }
    
    return 0;
  }

  /**
   * Helper: Format bytes to human-readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

export { TestStorage };