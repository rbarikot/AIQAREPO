/**
 * RECORDER AGENT
 * 
 * Purpose: Records user interactions on a website and captures the "happy path" journey
 * 
 * Features:
 * - Records clicks, fills, navigation, selections
 * - Captures page elements and their properties
 * - Stores user journey as structured data
 * - Provides playback capability for verification
 * 
 * Flow:
 * 1. User provides base URL
 * 2. Browser opens in headed mode
 * 3. User performs actions manually
 * 4. Agent records each interaction
 * 5. User clicks "Finish Recording"
 * 6. Agent returns structured journey data
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

class RecorderAgent {
  constructor() {
    this.browser = null;
    this.page = null;
    this.recordedSteps = [];
    this.pageElements = new Map();
    this.isRecording = false;
  }

  /**
   * Start recording session
   */
  async startRecording(baseUrl, config = {}) {
    try {
      // Clean up any existing session before starting a new one
      await this.cleanup();

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🎬 RECORDER AGENT STARTING...');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📍 Base URL: ${baseUrl}`);

      // Launch browser in HEADED mode so user can interact
      this.browser = await chromium.launch({
        headless: false, // ← User can see and interact
        slowMo: 500, // Slow down for visibility
      });

      const context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
        recordVideo: config.recordVideo ? { 
          dir: 'recordings/videos',
          size: { width: 1280, height: 720 }
        } : undefined,
      });

      this.page = await context.newPage();

      // Setup event listeners to capture interactions
      await this.setupRecordingListeners();

      // Navigate to base URL
      console.log(`🌐 Navigating to: ${baseUrl}`);
      await this.page.goto(baseUrl, { waitUntil: 'networkidle' });

      this.isRecording = true;
      this.recordedSteps = [];

      // Record initial page state
      await this.capturePageSnapshot('initial');

      console.log('✅ Recording started! Perform actions in the browser...');
      console.log('💡 When done, call stopRecording() or press Ctrl+C');

      return {
        success: true,
        sessionId: Date.now().toString(),
        message: 'Recording session started. Browser is open for interaction.',
      };

    } catch (error) {
      console.error('❌ Error starting recording:', error);
      throw error;
    }
  }

  /**
   * Setup event listeners to capture user interactions
   */
  async setupRecordingListeners() {
    // Capture all clicks
    await this.page.exposeFunction('recordClick', async (element) => {
      if (!this.isRecording) return;
      
      await this.recordStep({
        action: 'click',
        element: element,
        timestamp: Date.now(),
        url: this.page.url(),
      });
    });

    // Capture all input fills
    await this.page.exposeFunction('recordFill', async (element, value) => {
      if (!this.isRecording) return;
      
      await this.recordStep({
        action: 'fill',
        element: element,
        value: value,
        timestamp: Date.now(),
        url: this.page.url(),
      });
    });

    // Capture all selections
    await this.page.exposeFunction('recordSelect', async (element, value) => {
      if (!this.isRecording) return;
      
      await this.recordStep({
        action: 'select',
        element: element,
        value: value,
        timestamp: Date.now(),
        url: this.page.url(),
      });
    });

    // Inject recording script into page
    await this.page.addInitScript(() => {
      // Intercept clicks
      document.addEventListener('click', (e) => {
        const element = {
          tagName: e.target.tagName,
          text: e.target.textContent?.trim().substring(0, 50),
          id: e.target.id,
          class: e.target.className,
          name: e.target.name,
          type: e.target.type,
          href: e.target.href,
          role: e.target.getAttribute('role'),
          ariaLabel: e.target.getAttribute('aria-label'),
          placeholder: e.target.getAttribute('placeholder'),
          xpath: getXPath(e.target),
        };
        window.recordClick(element);
      }, true);

      // Intercept input fills
      document.addEventListener('input', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
          const element = {
            tagName: e.target.tagName,
            id: e.target.id,
            class: e.target.className,
            name: e.target.name,
            type: e.target.type,
            placeholder: e.target.getAttribute('placeholder'),
            ariaLabel: e.target.getAttribute('aria-label'),
            xpath: getXPath(e.target),
          };
          // Mask sensitive data
          const value = e.target.type === 'password' ? '***MASKED***' : e.target.value;
          window.recordFill(element, value);
        }
      }, true);

      // Intercept select changes
      document.addEventListener('change', (e) => {
        if (e.target.tagName === 'SELECT') {
          const element = {
            tagName: e.target.tagName,
            id: e.target.id,
            class: e.target.className,
            name: e.target.name,
            xpath: getXPath(e.target),
          };
          window.recordSelect(element, e.target.value);
        }
      }, true);

      // Helper to get XPath
      function getXPath(element) {
        if (element.id) return `//*[@id="${element.id}"]`;
        if (element === document.body) return '/html/body';
        
        let ix = 0;
        const siblings = element.parentNode?.childNodes || [];
        for (let i = 0; i < siblings.length; i++) {
          const sibling = siblings[i];
          if (sibling === element) {
            return getXPath(element.parentNode) + '/' + element.tagName.toLowerCase() + '[' + (ix + 1) + ']';
          }
          if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
            ix++;
          }
        }
      }
    });

    // Capture navigation
    this.page.on('framenavigated', async (frame) => {
      if (frame === this.page.mainFrame() && this.isRecording) {
        await this.recordStep({
          action: 'navigate',
          url: frame.url(),
          timestamp: Date.now(),
        });
        
        // Capture new page state
        await this.capturePageSnapshot('navigation');
      }
    });
  }

  /**
   * Record a user action step
   */
  async recordStep(step) {
    const stepNumber = this.recordedSteps.length + 1;
    
    // Capture screenshot (may return null if page is not available)
    let screenshot = null;
    try {
      screenshot = await this.captureScreenshot(stepNumber);
    } catch (error) {
      console.log(`⚠️ Screenshot skipped for step ${stepNumber}`);
    }

    const enrichedStep = {
      stepNumber,
      ...step,
      pageTitle: this.page ? await this.page.title().catch(() => 'Unknown') : 'Unknown',
      screenshot: screenshot,
    };

    this.recordedSteps.push(enrichedStep);

    console.log(`📝 Step ${stepNumber}: ${step.action.toUpperCase()}`);
    if (step.element) {
      console.log(`   Element: ${step.element.tagName}${step.element.id ? '#' + step.element.id : ''}`);
    }
    if (step.value) {
      console.log(`   Value: ${step.value}`);
    }
  }

  /**
   * Capture screenshot for a step
   */
  async captureScreenshot(stepNumber) {
    // Safety check: return null if page is not available
    if (!this.page || this.page.isClosed()) {
      console.log(`⚠️ Cannot capture screenshot for step ${stepNumber}: page is not available`);
      return null;
    }

    try {
      const screenshotDir = 'recordings/screenshots';
      await fs.mkdir(screenshotDir, { recursive: true });
      
      const screenshotPath = path.join(screenshotDir, `step-${stepNumber}.png`);
      await this.page.screenshot({ path: screenshotPath, fullPage: false });
      
      return screenshotPath;
    } catch (error) {
      console.log(`⚠️ Error capturing screenshot for step ${stepNumber}:`, error.message);
      return null;
    }
  }

  /**
   * Capture page snapshot (elements, structure)
   */
  async capturePageSnapshot(snapshotType) {
    // Safety check: return null if page is not available
    if (!this.page || this.page.isClosed()) {
      console.log(`⚠️ Cannot capture ${snapshotType} snapshot: page is not available`);
      return null;
    }

    try {
      const snapshot = {
        type: snapshotType,
        url: this.page.url(),
        title: await this.page.title(),
        timestamp: Date.now(),
        elements: await this.extractPageElements(),
        forms: await this.extractForms(),
        links: await this.extractLinks(),
      };

      console.log(`📸 Captured page snapshot: ${snapshotType}`);
      return snapshot;
    } catch (error) {
      console.log(`⚠️ Error capturing ${snapshotType} snapshot:`, error.message);
      return null;
    }
  }

  /**
   * Extract all interactive elements from page
   */
  async extractPageElements() {
    return await this.page.evaluate(() => {
      const elements = [];
      
      // Input fields
      document.querySelectorAll('input, textarea, select').forEach((el) => {
        elements.push({
          type: 'input',
          tagName: el.tagName,
          inputType: el.type,
          name: el.name,
          id: el.id,
          placeholder: el.placeholder,
          required: el.required,
          ariaLabel: el.getAttribute('aria-label'),
          testId: el.getAttribute('data-testid'),
        });
      });

      // Buttons and clickable elements
      document.querySelectorAll('button, a, [role="button"]').forEach((el) => {
        elements.push({
          type: 'clickable',
          tagName: el.tagName,
          text: el.textContent?.trim().substring(0, 50),
          id: el.id,
          role: el.getAttribute('role'),
          ariaLabel: el.getAttribute('aria-label'),
          href: el.href,
        });
      });

      return elements;
    });
  }

  /**
   * Extract all forms from page
   */
  async extractForms() {
    return await this.page.evaluate(() => {
      const forms = [];
      
      document.querySelectorAll('form').forEach((form) => {
        const fields = [];
        form.querySelectorAll('input, textarea, select').forEach((field) => {
          fields.push({
            name: field.name,
            type: field.type || field.tagName,
            required: field.required,
            placeholder: field.placeholder,
          });
        });

        forms.push({
          id: form.id,
          action: form.action,
          method: form.method,
          fields: fields,
        });
      });

      return forms;
    });
  }

  /**
   * Extract all links from page
   */
  async extractLinks() {
    return await this.page.evaluate(() => {
      const links = [];
      document.querySelectorAll('a').forEach((link) => {
        links.push({
          text: link.textContent?.trim(),
          href: link.href,
        });
      });
      return links;
    });
  }

  /**
   * Stop recording and return journey data
   */
  async stopRecording() {
    try {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🛑 STOPPING RECORDING...');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      this.isRecording = false;

      // Capture final page state BEFORE closing browser
      let finalSnapshot = null;
      if (this.page && !this.page.isClosed()) {
        try {
          finalSnapshot = await this.capturePageSnapshot('final');
        } catch (snapshotError) {
          console.log('⚠️ Could not capture final snapshot:', snapshotError.message);
          // Continue anyway - not critical
        }
      }

      // Close browser
      if (this.browser) {
        try {
          await this.browser.close();
        } catch (closeError) {
          console.log('⚠️ Browser already closed');
        }
        this.browser = null;
        this.page = null;
      }

      // Structure the journey data
      const journeyData = {
        sessionId: Date.now().toString(),
        totalSteps: this.recordedSteps.length,
        duration: this.recordedSteps.length > 0 
          ? this.recordedSteps[this.recordedSteps.length - 1].timestamp - this.recordedSteps[0].timestamp
          : 0,
        steps: this.recordedSteps,
        finalSnapshot: finalSnapshot,
        recordedAt: new Date().toISOString(),
      };

      // Save journey data
      await this.saveJourneyData(journeyData);

      console.log(`✅ Recording stopped! Total steps: ${this.recordedSteps.length}`);
      console.log(`💾 Journey data saved to: recordings/journey-${journeyData.sessionId}.json`);

      return journeyData;

    } catch (error) {
      console.error('❌ Error stopping recording:', error);
      // Make sure browser is closed even on error
      if (this.browser) {
        try {
          await this.browser.close();
        } catch (e) {
          // Ignore
        }
        this.browser = null;
        this.page = null;
      }
      throw error;
    }
  }

  /**
   * Save journey data to file
   */
  async saveJourneyData(journeyData) {
    const recordingsDir = 'recordings';
    await fs.mkdir(recordingsDir, { recursive: true });
    
    const filename = `journey-${journeyData.sessionId}.json`;
    const filepath = path.join(recordingsDir, filename);
    
    await fs.writeFile(filepath, JSON.stringify(journeyData, null, 2));
    
    return filepath;
  }

  /**
   * Load previously recorded journey
   */
  async loadJourney(sessionId) {
    const filepath = path.join('recordings', `journey-${sessionId}.json`);
    const data = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(data);
  }

  /**
   * Get summary of recorded journey
   */
  getJourneySummary() {
    const actionCounts = this.recordedSteps.reduce((acc, step) => {
      acc[step.action] = (acc[step.action] || 0) + 1;
      return acc;
    }, {});

    return {
      totalSteps: this.recordedSteps.length,
      actions: actionCounts,
      urls: [...new Set(this.recordedSteps.map(s => s.url))],
      duration: this.recordedSteps.length > 0
        ? this.recordedSteps[this.recordedSteps.length - 1].timestamp - this.recordedSteps[0].timestamp
        : 0,
    };
  }

  /**
   * Force cleanup any existing browser/session state
   */
  async cleanup() {
    this.isRecording = false;
    this.recordedSteps = [];
    this.pageElements = new Map();

    if (this.page) {
      try {
        if (!this.page.isClosed()) {
          await this.page.close();
        }
      } catch (_) {
        // Ignore - page may already be closed
      }
      this.page = null;
    }

    if (this.browser) {
      try {
        await this.browser.close();
      } catch (_) {
        // Ignore - browser may already be closed
      }
      this.browser = null;
    }

    console.log('🧹 Recorder agent cleaned up');
  }
}

export default RecorderAgent;