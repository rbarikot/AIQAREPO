import OpenAI from "openai";
import { inspectPage, formatInspectionForAI } from "./browserInspector.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read Playwright skill file
async function readPlaywrightSkill() {
  try {
    const skillPath = path.join(process.cwd(), 'skills', 'playwright-qa', 'SKILL.md');
    const skillContent = await fs.readFile(skillPath, 'utf-8');
    return skillContent;
  } catch (err) {
    console.warn('Playwright skill file not found, using default knowledge');
    return null;
  }
}

// Extract feature name from test plan for dynamic filenames
function extractFeatureName(plan) {
  let featureName = null;
  
  if (plan.pageTitle && typeof plan.pageTitle === 'string') {
    featureName = plan.pageTitle.replace(/\s+/g, '');
  }
  
  if (!featureName && plan.testType) {
    featureName = plan.testType.replace(/\s+/g, '');
  }
  
  if (!featureName && plan.scenarios && plan.scenarios[0]?.title) {
    featureName = plan.scenarios[0].title
      .replace(/\s+/g, '')
      .replace(/^(Test|Scenario|User|Should)/, '');
  }
  
  if (!featureName && plan.summary) {
    const words = plan.summary.split(' ')
      .filter(w => /^[A-Z]/.test(w))
      .slice(0, 2)
      .join('');
    if (words.length > 0) featureName = words;
  }
  
  if (!featureName) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    featureName = `Feature${timestamp}`;
  }
  
  featureName = featureName
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .replace(/^[^a-zA-Z]+/, '')
    .slice(0, 50);
  
  return featureName || 'TestFeature';
}

// Extract user actions from plan
function extractUserActions(plan) {
  const actions = [];
  
  if (plan.scenarios && plan.scenarios.length > 0) {
    plan.scenarios.forEach(scenario => {
      if (scenario.steps && Array.isArray(scenario.steps)) {
        scenario.steps.forEach(step => {
          actions.push(step);
        });
      }
    });
  }
  
  return actions;
}

// AUTO-SAVE FILES TO DISK
async function saveFilesToDisk(files, baseDir = null) {
  const projectRoot = baseDir || process.cwd();
  const savedFiles = [];
  
  for (const file of files) {
    try {
      const filePath = path.join(projectRoot, file.filename);
      const fileDir = path.dirname(filePath);
      
      await fs.mkdir(fileDir, { recursive: true });
      await fs.writeFile(filePath, file.content, 'utf8');
      
      console.log(`✅ Saved: ${file.filename}`);
      savedFiles.push({
        filename: file.filename,
        path: filePath,
        type: file.type,
        content: file.content
      });
    } catch (err) {
      console.error(`❌ Failed to save ${file.filename}:`, err.message);
    }
  }
  
  return savedFiles;
}

const TS_PROMPT = async (skillContent, featureName, ragContext = null) => {
  const basePrompt = `You are a Senior SDET specializing in Playwright TypeScript automation.
You receive REAL multi-step browser journey data showing ACTUAL app behavior.

🚨 CRITICAL PLAYWRIGHT FIXTURE RULE:
EVERY test function MUST include { page } parameter to access the page fixture.

CORRECT:
test('my test', async ({ page }) => {
  await expect(page).toHaveURL(...);
});

WRONG (causes error):
test('my test', async () => {
  await expect(page).toHaveURL(...);  // ❌ page is not defined
});

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 CRITICAL REQUIREMENT - GENERATE EXACTLY 2 FILES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

YOU MUST RETURN A JSON OBJECT WITH A "files" ARRAY CONTAINING EXACTLY 2 ELEMENTS.

🎯 DYNAMIC FILENAMES - Use Meaningful Names Based on Feature:

Feature Context: "${featureName}"

FILE 1 (REQUIRED): Page Object Class
  - type: "page-object"
  - filename: "pages/{FeatureName}Page.ts"
  - Use PascalCase: LoginPage, CheckoutPage, ProfilePage, etc.
  - Base filename on ACTUAL feature being tested
  
FILE 2 (REQUIRED): Test Spec File
  - type: "test-spec"
  - filename: "tests/{feature-name}.spec.ts"
  - Use kebab-case: login.spec.ts, checkout.spec.ts, profile.spec.ts
  - Base filename on ACTUAL feature being tested

BOTH FILES ARE MANDATORY. DO NOT GENERATE ONLY ONE FILE.

Example of CORRECT response structure for LOGIN feature:
{
  "language": "typescript",
  "files": [
    {
      "filename": "pages/LoginPage.ts",
      "type": "page-object",
      "content": "import { Page, Locator } from '@playwright/test';\\n\\nexport class LoginPage {\\n  readonly page: Page;\\n  readonly usernameInput: Locator;\\n  readonly passwordInput: Locator;\\n  readonly loginButton: Locator;\\n\\n  constructor(page: Page) {\\n    this.page = page;\\n    this.usernameInput = page.getByLabel('Username');\\n    this.passwordInput = page.getByLabel('Password');\\n    this.loginButton = page.getByRole('button', { name: 'Login' });\\n  }\\n\\n  async navigate() {\\n    await this.page.goto('/login');\\n  }\\n\\n  async login(username: string, password: string) {\\n    await this.usernameInput.fill(username);\\n    await this.passwordInput.fill(password);\\n    await this.loginButton.click();\\n    await this.page.waitForURL(/dashboard/);\\n  }\\n}"
    },
    {
      "filename": "tests/login.spec.ts",
      "type": "test-spec",
      "content": "import { test, expect } from '@playwright/test';\\nimport { LoginPage } from '../pages/LoginPage';\\n\\ntest.describe('Login Tests', () => {\\n  let loginPage: LoginPage;\\n\\n  test.beforeEach(async ({ page }) => {\\n    loginPage = new LoginPage(page);\\n    await loginPage.navigate();\\n  });\\n\\n  test('should login with valid credentials', async ({ page }) => {\\n    await loginPage.login('admin', 'admin');\\n    await expect(page).toHaveURL(/dashboard/);\\n  });\\n});"
    }
  ],
  "setupInstructions": ["npm install @playwright/test", "npx playwright install chromium"],
  "testCount": 1
}

🚨 IMPORTANT RULES:
- Page Object: PascalCase, ends with "Page.ts" (e.g., ShoppingCartPage.ts)
- Test Spec: kebab-case, ends with ".spec.ts" (e.g., shopping-cart.spec.ts)
- Import path in test MUST match page object filename
- Use MEANINGFUL names that describe what's being tested
- EVERY test() function MUST have async ({ page }) parameter

This response has EXACTLY 2 files. files.length === 2. This is MANDATORY.

BEFORE YOU RESPOND:
1. Count your files array: It MUST have 2 elements
2. Check file types: One must be "page-object", one must be "test-spec"
3. Verify filenames are DYNAMIC and match the feature being tested
4. Verify both have non-empty "content" fields
5. Verify import path in test spec matches page object filename
6. Verify EVERY test() function has async ({ page }) parameter

IF YOU GENERATE ONLY 1 FILE, YOUR RESPONSE IS WRONG AND WILL BE REJECTED.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  let fullPrompt = basePrompt;

  if (ragContext) {
    fullPrompt += `\n\n${ragContext}\n\n`;
  }

  if (skillContent) {
    fullPrompt += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 EXPERT KNOWLEDGE - FOLLOW THESE PRACTICES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${skillContent}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  }

  fullPrompt += `

FINAL REMINDER: 
Generate EXACTLY 2 files with DYNAMIC filenames based on the feature.
Feature: "${featureName}"
EVERY test() must have async ({ page }) parameter.
Count them before responding: 1, 2. That's it.`;

  return fullPrompt;
};

export async function runTestGeneratorAgent(req, res) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const {
    plan,
    url,
    language = "typescript",
    baseUrl,
    customInstructions,
    headed = false,
    knowledgeBase = null,  // RAG knowledge base instance
    testStorage = null      // Test storage instance
  } = req.body;

  // 🔍 DEBUG: Check what was received
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 GENERATOR FUNCTION DEBUG');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('   knowledgeBase received:', !!knowledgeBase);
  console.log('   knowledgeBase type:', typeof knowledgeBase);
  console.log('   testStorage received:', !!testStorage);
  console.log('   testStorage type:', typeof testStorage);
  console.log('   plan received:', !!plan);
  if (knowledgeBase) {
    console.log('   knowledgeBase.storeTest exists:', typeof knowledgeBase.storeTest);
  }
  if (testStorage) {
    console.log('   testStorage.storeTest exists:', typeof testStorage.storeTest);
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (!plan) {
    return res.status(400).json({ error: "Test plan required. Run Planner Agent first." });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const send = (type, data) =>
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

  const isTS = language === "typescript";

  try {
    send("status", { message: "⚡ Test Generator Agent activated...", step: 1 });

    const featureName = extractFeatureName(plan);
    send("status", { 
      message: `🎯 Detected feature: "${featureName}"`, 
      step: 1.2 
    });

    // Get RAG context from knowledge base
    let ragContext = null;
    if (knowledgeBase) {
      try {
        send("status", { 
          message: "🔍 Searching knowledge base for similar tests...", 
          step: 1.3 
        });
        
        ragContext = await knowledgeBase.generateRAGContext(featureName, 3);
        
        send("status", { 
          message: "✅ Found similar test patterns to learn from", 
          step: 1.4 
        });
      } catch (err) {
        console.error("RAG context generation failed:", err);
        send("status", { 
          message: "⚠️ No similar patterns found, generating from scratch", 
          step: 1.4 
        });
      }
    }

    const skillContent = await readPlaywrightSkill();
    if (skillContent) {
      send("status", { 
        message: "📚 Loaded Playwright best practices", 
        step: 1.5 
      });
    }

    let inspectionSummary = "";
    let hasRealInspection = false;
    const existingInspection = plan._inspection;
    const targetUrl = baseUrl || url || existingInspection?.url;

    // [Journey execution logic - keeping it the same as before]
    if (headed && targetUrl && existingInspection?.journey) {
      send("status", { 
        message: "🌐 Re-executing journey in HEADED mode...", 
        step: 2 
      });

      const userActions = [];
      if (plan.scenarios && plan.scenarios.length > 0) {
        const firstScenario = plan.scenarios[0];
        if (firstScenario.steps && Array.isArray(firstScenario.steps)) {
          const testData = firstScenario.testData || {};
          
          firstScenario.steps.forEach(step => {
            const stepLower = step.toLowerCase();
            
            if (stepLower.includes("enter") || stepLower.includes("type") || stepLower.includes("fill")) {
              const valueMatch = step.match(/['"]([^'"]+)['"]/);
              let fieldName = null;
              
              const inTheMatch = step.match(/(?:in|into|to)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:field|input|box)/i);
              if (inTheMatch) fieldName = inTheMatch[1].trim();
              
              if (!fieldName) {
                const directMatch = step.match(/(?:fill|enter|type)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:field|with|as)/i);
                if (directMatch) fieldName = directMatch[1].trim();
              }
              
              if (!fieldName && testData.username && stepLower.includes("username")) {
                fieldName = "Username";
              } else if (!fieldName && testData.password && stepLower.includes("password")) {
                fieldName = "Password";
              }
              
              if (fieldName && valueMatch) {
                userActions.push({
                  type: "fill",
                  description: step,
                  label: fieldName,
                  value: valueMatch[1]
                });
              }
            }
            
            else if (stepLower.includes("click")) {
              let buttonText = null;
              
              const theButtonMatch = step.match(/click\s+(?:the\s+)?([A-Z][A-Za-z\s]+?)\s+(?:button|link|icon|menu)/i);
              if (theButtonMatch) buttonText = theButtonMatch[1].trim();
              
              if (!buttonText) {
                const onTheMatch = step.match(/click\s+on\s+(?:the\s+)?([A-Z][A-Za-z\s]+?)\s+(?:button|link|icon|menu)/i);
                if (onTheMatch) buttonText = onTheMatch[1].trim();
              }
              
              if (!buttonText) {
                const quotedMatch = step.match(/click\s+['"]([^'"]+)['"]/i);
                if (quotedMatch) buttonText = quotedMatch[1].trim();
              }
              
              if (!buttonText) {
                const bareMatch = step.match(/click\s+([A-Z][A-Za-z]+)(?:\s|\.)/i);
                if (bareMatch && !["the", "on", "a", "an", "to", "at"].includes(bareMatch[1].toLowerCase())) {
                  buttonText = bareMatch[1].trim();
                }
              }
              
              if (buttonText) {
                userActions.push({
                  type: "click",
                  description: step,
                  text: buttonText,
                  wait: stepLower.includes("login") || stepLower.includes("submit") || stepLower.includes("sign") ? "navigation" : undefined
                });
              }
            }
          });
        }
      }

      try {
        const inspectionData = await inspectPage(targetUrl, { 
          headed: true, 
          timeout: 20000,
          userActions: userActions.length > 0 ? userActions : null
        });
        
        const lastStep = inspectionData.journey[inspectionData.journey.length - 1];
        if (lastStep?.screenshotBase64) {
          send("screenshot", { base64: lastStep.screenshotBase64 });
        }

        send("inspection", {
          steps: inspectionData.totalSteps,
          journey: inspectionData.journey.map(s => ({
            stepName: s.stepName,
            inputs: s.elements?.inputs?.length || 0,
            buttons: s.elements?.buttons?.length || 0,
            forms: s.elements?.forms?.length || 0,
          })),
          pageType: lastStep.pageStructure?.pageType,
          title: lastStep.title,
        });

        inspectionSummary = formatInspectionForAI(inspectionData);
        hasRealInspection = true;

        send("status", {
          message: `✅ Journey executed: ${inspectionData.totalSteps} steps`,
          step: 3,
        });
      } catch (browserErr) {
        console.error("Headed browser execution failed:", browserErr);
        send("error", {
          message: `❌ Failed to execute journey: ${browserErr.message}`,
        });
        return res.end();
      }
    } else if (plan._realInspection === true && existingInspection) {
      try {
        if (existingInspection.journey && Array.isArray(existingInspection.journey)) {
          const cleanedJourney = existingInspection.journey.map((step, idx) => ({
            stepName: step.stepName || `Step ${idx + 1}`,
            url: step.url || "",
            title: step.title || "",
            elements: step.elements || { inputs: [], buttons: [], links: [], selects: [], checkboxes: [], textareas: [], forms: [], headings: [], alerts: [] },
            pageStructure: step.pageStructure || { hasLoginForm: false, hasSearchBar: false, hasNavigation: false, hasPagination: false, hasModal: false, pageType: "unknown" },
          }));

          inspectionSummary = formatInspectionForAI({
            journey: cleanedJourney,
            totalSteps: cleanedJourney.length,
            inspectedAt: new Date().toISOString(),
          });
          send("status", {
            message: `♻️ Reusing ${cleanedJourney.length}-step journey from Planner...`,
            step: 2,
          });
          hasRealInspection = true;
        }
      } catch (formatErr) {
        console.error("Failed to format inspection data:", formatErr);
        hasRealInspection = false;
        inspectionSummary = "";
      }
    } else {
      hasRealInspection = plan._realInspection === true;
    }

    send("status", {
      message: `📝 Generating Playwright ${isTS ? "TypeScript" : "JavaScript"} for "${featureName}"...`,
      step: hasRealInspection ? 4 : 3,
    });

    const cleanPlan = { ...plan };
    delete cleanPlan._inspection;
    delete cleanPlan._realInspection;
    delete cleanPlan._journeySteps;

    const systemPrompt = await TS_PROMPT(skillContent, featureName, ragContext);

    const userPrompt = hasRealInspection && inspectionSummary
      ? `Generate complete Playwright ${language} tests for "${featureName}" feature.

TEST PLAN:
${JSON.stringify(cleanPlan, null, 2)}

REAL BROWSER JOURNEY:
${inspectionSummary}

Base URL: ${targetUrl}
${customInstructions ? `Custom Instructions: ${customInstructions}` : ""}

🚨 CRITICAL: Generate EXACTLY 2 files with DYNAMIC filenames:
1. Page Object class → pages/{FeatureName}Page.ts (PascalCase)
2. Test spec file → tests/{feature-name}.spec.ts (kebab-case)

EVERY test() function MUST have async ({ page }) parameter.

Use meaningful names based on the actual feature: "${featureName}"

BOTH files are MANDATORY in your response.`
      : `Generate Playwright ${language} tests from plan for "${featureName}" feature:

${JSON.stringify(cleanPlan, null, 2)}

Base URL: ${targetUrl}
${customInstructions ? `Custom Instructions: ${customInstructions}` : ""}

🚨 CRITICAL: Generate EXACTLY 2 files with DYNAMIC filenames based on "${featureName}"
EVERY test() must have async ({ page }) parameter.`;

    let completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    let rawContent = completion.choices?.[0]?.message?.content;
    if (!rawContent) {
      send("error", { message: "AI returned empty response" });
      return res.end();
    }

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      console.error("Parse error. Raw:", rawContent.substring(0, 300));
      send("error", { message: "Failed to parse code as JSON" });
      return res.end();
    }

    // VALIDATION AND RETRY LOGIC
    if (!parsed.files || !Array.isArray(parsed.files) || parsed.files.length !== 2) {
      const currentCount = parsed.files?.length || 0;
      const hasPageObject = parsed.files?.some(f => f.type === "page-object");
      const hasTestSpec = parsed.files?.some(f => f.type === "test-spec");
      
      send("status", { 
        message: `⚠️ Wrong file count: got ${currentCount}. Requesting missing files...`, 
        step: hasRealInspection ? 4.5 : 3.5 
      });

      // 🔥 STRONGER RETRY PROMPT
      const retryPrompt = `CRITICAL ERROR: You FAILED to generate the required files.

You generated ${currentCount} file(s) with types: ${parsed.files?.map(f => f.type).join(", ")}

This is COMPLETELY UNACCEPTABLE. You MUST generate EXACTLY 2 files.

${!hasPageObject ? `
🚨 YOU ARE MISSING THE PAGE OBJECT FILE 🚨

Generate this NOW:
{
  "filename": "pages/${featureName}Page.ts",
  "type": "page-object",
  "content": "import { Page, Locator } from '@playwright/test';\\n\\nexport class ${featureName}Page {\\n  readonly page: Page;\\n  readonly usernameInput: Locator;\\n  readonly passwordInput: Locator;\\n  readonly loginButton: Locator;\\n\\n  constructor(page: Page) {\\n    this.page = page;\\n    this.usernameInput = page.getByLabel('Username');\\n    this.passwordInput = page.getByLabel('Password');\\n    this.loginButton = page.getByRole('button', { name: 'Login' });\\n  }\\n\\n  async navigate() {\\n    await this.page.goto('/login');\\n  }\\n\\n  async login(username: string, password: string) {\\n    await this.usernameInput.fill(username);\\n    await this.passwordInput.fill(password);\\n    await this.loginButton.click();\\n    await this.page.waitForURL(/dashboard/);\\n  }\\n}"
}
` : ''}

${!hasTestSpec ? `
🚨 YOU ARE MISSING THE TEST SPEC FILE 🚨

Generate this NOW:
{
  "filename": "tests/${featureName.toLowerCase()}.spec.ts",
  "type": "test-spec",
  "content": "import { test, expect } from '@playwright/test';\\nimport { ${featureName}Page } from '../pages/${featureName}Page';\\n\\ntest.describe('${featureName} Tests', () => {\\n  let ${featureName.toLowerCase()}Page: ${featureName}Page;\\n\\n  test.beforeEach(async ({ page }) => {\\n    ${featureName.toLowerCase()}Page = new ${featureName}Page(page);\\n    await ${featureName.toLowerCase()}Page.navigate();\\n  });\\n\\n  test('should perform ${featureName} action', async ({ page }) => {\\n    // Test implementation\\n    await expect(page).toHaveURL(/dashboard/);\\n  });\\n});"
}
` : ''}

Return the COMPLETE JSON with BOTH files in the "files" array.
This is NON-NEGOTIABLE. I need 2 files, not ${currentCount}.`;

      try {
        const retryCompletion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
            { role: "assistant", content: rawContent },
            { role: "user", content: retryPrompt }
          ],
        });

        const retryContent = retryCompletion.choices?.[0]?.message?.content;
        if (retryContent) {
          parsed = JSON.parse(retryContent);
          send("status", { 
            message: `✅ Retry successful: now have ${parsed.files?.length || 0} files`, 
            step: hasRealInspection ? 4.5 : 3.5 
          });
        }
      } catch (retryErr) {
        console.error("Retry failed:", retryErr);
      }
    }

    // Final validation
    if (!parsed.files || parsed.files.length !== 2) {
      send("error", { 
        message: `❌ Wrong file count: Expected EXACTLY 2 files, got ${parsed.files?.length || 0}. Types generated: ${parsed.files?.map(f => f.type).join(", ")}`
      });
      return res.end();
    }

    const hasPageObject = parsed.files.some(f => f.type === "page-object");
    const hasTestSpec = parsed.files.some(f => f.type === "test-spec");

    if (!hasPageObject || !hasTestSpec) {
      const missing = [];
      if (!hasPageObject) missing.push("Page Object");
      if (!hasTestSpec) missing.push("Test Spec");
      
      send("error", { 
        message: `❌ Missing required files: ${missing.join(" and ")}`
      });
      return res.end();
    }

    // ✨ AUTO-SAVE FILES TO DISK ✨
    send("status", { 
      message: "💾 Saving files to project directory...", 
      step: hasRealInspection ? 5 : 4
    });

    const savedFiles = await saveFilesToDisk(parsed.files);
    
    send("status", { 
      message: `✅ Files saved:\n${savedFiles.map(f => `  • ${f.filename}`).join('\n')}`, 
      step: hasRealInspection ? 5.5 : 4.5
    });

    // 🔍 DEBUG: Check before storage
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 STORAGE CHECK DEBUG');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('   knowledgeBase available:', !!knowledgeBase);
    console.log('   testStorage available:', !!testStorage);
    console.log('   savedFiles.length:', savedFiles.length);
    console.log('   KB condition (>= 1):', !!(knowledgeBase && savedFiles.length >= 1));
    console.log('   Storage condition (>= 1):', !!(testStorage && savedFiles.length >= 1));
    console.log('   savedFiles:', savedFiles.map(f => ({ 
      type: f.type, 
      filename: f.filename,
      hasContent: !!f.content 
    })));
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // ✨ STORE IN KNOWLEDGE BASE (RAG) ✨
    // 🔥 CHANGED: >= 1 instead of === 2 to handle partial generation
    if (knowledgeBase && savedFiles.length >= 1) {
      console.log('✅ ENTERING KNOWLEDGE BASE STORAGE BLOCK');
      try {
        send("status", { 
          message: "📚 Storing test pattern in knowledge base...", 
          step: hasRealInspection ? 5.7 : 4.7
        });

        const pageObject = savedFiles.find(f => f.type === "page-object");
        const testSpec = savedFiles.find(f => f.type === "test-spec");
        
        console.log('   Page Object found:', !!pageObject);
        console.log('   Test Spec found:', !!testSpec);
        
        const userActions = extractUserActions(plan);
        
        // Handle partial file generation
        const testData = {
          testCode: testSpec?.content || '// Test spec not generated',
          pageObjectCode: pageObject?.content || '// Page object not generated',
          feature: featureName,
          filename: testSpec?.filename || `tests/${featureName.toLowerCase()}.spec.ts`,
          passed: true,
          locatorStrategies: testSpec ? knowledgeBase.extractLocatorStrategies(testSpec.content) : [],
          executionTime: 0,
          url: targetUrl,
          userActions
        };
        
        console.log('   Calling knowledgeBase.storeTest with:', {
          feature: testData.feature,
          filename: testData.filename,
          hasTestCode: !!testSpec,
          hasPageObjectCode: !!pageObject
        });
        
        const storedId = await knowledgeBase.storeTest(testData);
        
        console.log('   ✅ Knowledge base stored test with ID:', storedId);

        send("status", { 
          message: "✅ Test pattern stored in knowledge base", 
          step: hasRealInspection ? 5.8 : 4.8
        });
      } catch (ragErr) {
        console.error("❌ Failed to store in knowledge base:", ragErr);
        console.error("   Error stack:", ragErr.stack);
        send("status", { 
          message: "⚠️ Warning: Failed to store in knowledge base", 
          step: hasRealInspection ? 5.8 : 4.8
        });
      }
    } else {
      console.log('❌ SKIPPED KNOWLEDGE BASE STORAGE:');
      console.log('   knowledgeBase:', !!knowledgeBase);
      console.log('   savedFiles.length:', savedFiles.length);
    }

    // ✨ STORE IN TEST STORAGE SYSTEM ✨
    // 🔥 CHANGED: >= 1 instead of === 2 to handle partial generation
    if (testStorage && savedFiles.length >= 1) {
      console.log('✅ ENTERING TEST STORAGE BLOCK');
      try {
        send("status", { 
          message: "💾 Storing test metadata...", 
          step: hasRealInspection ? 5.9 : 4.9
        });

        const testData = {
          name: featureName,
          feature: featureName,
          files: savedFiles.map(f => ({
            filename: f.filename,
            type: f.type
          })),
          status: 'pending',
          url: targetUrl,
          plan: cleanPlan
        };
        
        console.log('   Calling testStorage.storeTest with:', {
          name: testData.name,
          feature: testData.feature,
          filesCount: testData.files.length
        });
        
        const storedId = await testStorage.storeTest(testData);
        
        console.log('   ✅ Test storage stored test with ID:', storedId);

        send("status", { 
          message: "✅ Test metadata stored", 
          step: hasRealInspection ? 6 : 5
        });
      } catch (storageErr) {
        console.error("❌ Failed to store test metadata:", storageErr);
        console.error("   Error stack:", storageErr.stack);
        send("status", { 
          message: "⚠️ Warning: Failed to store test metadata", 
          step: hasRealInspection ? 6 : 5
        });
      }
    } else {
      console.log('❌ SKIPPED TEST STORAGE:');
      console.log('   testStorage:', !!testStorage);
      console.log('   savedFiles.length:', savedFiles.length);
    }

    send("status", { 
      message: `✅ Generated "${featureName}" test files successfully!`, 
      step: hasRealInspection ? 6.5 : 5.5
    });
    
    send("done", { 
      result: {
        ...parsed,
        savedFiles,
        featureName,
        storedInKnowledgeBase: !!knowledgeBase,
        storedInTestStorage: !!testStorage
      }
    });
    res.end();
  } catch (err) {
    console.error("Test Generator Error:", err);
    console.error("Error stack:", err.stack);
    send("error", { message: err.message || "Test generator failed" });
    res.end();
  }
}