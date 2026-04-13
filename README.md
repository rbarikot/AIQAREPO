# 🤖 AI QA Test Case Generator

An AI-powered multi-agent system that generates production-quality Playwright test automation by **recording user actions in a real browser**, generating positive & negative test scenarios via AI, and producing Page Object Model (POM) + test specs — all orchestrated through a unified web UI and LangGraph.

---

## 🚀 Overview

AI QA Test Case Generator uses a **five-agent pipeline** backed by real browser recording and AI scenario generation to produce comprehensive Playwright TypeScript tests:

1. **Recorder Agent** — Opens a headed browser, records user clicks/fills/navigation in real-time, and captures the journey as structured data.
2. **Scenario Generator Agent** — Analyzes the recorded journey and uses GPT-4o-mini to generate 5–10 positive and 10–15 negative test scenarios (validation, security, boundary, edge cases).
3. **Enhanced Planner Agent** — Formats AI-generated scenarios into detailed, structured test plans ready for code generation.
4. **Generator Agent** — Uses the test plans + RAG knowledge base patterns + a Playwright skill file to generate Page Object classes and test specs via GPT-4o-mini.
5. **Healer Agent** — Analyzes test failures, identifies root causes, and produces fully healed code with alternative selectors.

A **LangGraph Orchestrator** ties all agents into an automated workflow with conditional self-healing loops. A **Workflow Orchestrator** manages the end-to-end record-to-generate pipeline.

---

## 🎯 Key Features

- **Browser Recording** — Records user interactions (clicks, fills, navigation) in a headed Chromium browser with automatic page snapshots
- **AI Scenario Generation** — Generates comprehensive positive and negative test scenarios from recorded journeys using structured JSON output
- **Real Browser Inspection** — Launches Chromium in headed mode to execute user journeys and extract actual DOM elements, locators, and screenshots
- **Multi-Agent LangGraph Orchestration** — `START → Planner → Generator → Executor → (Healer if failed) → END` with up to 3 healing retries
- **Unified Workflow** — One-click pipeline: Record → Generate Scenarios → Plan → Generate Tests → Heal
- **Page Object Model Generation** — Produces separate POM classes (`pages/LoginPage.ts`) and test specs (`tests/login.spec.ts`) with dynamic naming
- **RAG Knowledge Base** — Stores successful test patterns in JSON and retrieves similar examples to improve future generation
- **Self-Healing Tests** — AI-powered failure analysis with root cause classification and automatic code repair
- **Persistent Test Storage** — Full CRUD operations for generated tests with search, export/import, and statistics
- **Skill System** — Loads domain-specific Playwright best practices from `skills/playwright-qa/SKILL.md` at generation time
- **Server-Sent Events (SSE)** — Real-time streaming of agent progress to the web UI
- **Web UI** — Dark-themed 4-tab interface (Recorder / Planner / Generator / Healer) with scenario selection, live screenshots, and file display

---

## 🏗️ Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   RECORDER   │ →  │  SCENARIO    │ →  │   PLANNER    │ →  │  GENERATOR   │ →  │    HEALER    │
│              │    │  GENERATOR   │    │              │    │              │    │              │
│ Open browser │    │ Analyze      │    │ Format into  │    │ Load SKILL.md│    │ Analyze      │
│ Record clicks│    │ journey data │    │ test plans   │    │ Query RAG KB │    │ failures     │
│ Record fills │    │ AI generates │    │ Route manual │    │ Generate POM │    │ Fix code     │
│ Capture state│    │ pos+neg cases│    │ or scenario  │    │ + test specs │    │ Alt selectors│
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                                                                    │
                                                          ┌─────────┴─────────┐
                                                          │  LangGraph State  │
                                                          │    Orchestrator   │
                                                          │                   │
                                                          │ Executor → Healer │
                                                          │   (loop ≤ 3x)    │
                                                          └───────────────────┘
```

### Data Flow

```
User clicks "Start Recording"
    ↓
Recorder: Opens headed browser → User performs actions → Structured journey data
    ↓
Scenario Generator: GPT-4o-mini → Positive scenarios (5-10) + Negative scenarios (10-15)
    ↓
Planner: Formats scenarios into detailed test plans (or accepts manual input)
    ↓
Generator: GPT-4o-mini + SKILL.md + RAG Context → POM + Spec Files
    ↓
[Optional] Executor: npx playwright test → Results
    ↓
[If failures] → Healer: AI Analysis → Fixed Code → Re-execute (up to 3x)
    ↓
Storage: Save to TestStorage (index.json) + RAG Knowledge Base (knowledge-base.json)
```

---

## 🧰 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js (ES Modules) |
| **Server** | Express.js 5 with SSE streaming |
| **AI/LLM** | OpenAI GPT-4o-mini (with `response_format: json_object`) |
| **Orchestration** | LangGraph (`@langchain/langgraph`) + LangChain |
| **Browser Automation** | Playwright (Chromium) |
| **Frontend** | Vanilla HTML/CSS/JS (dark theme) |
| **Storage** | JSON-based (knowledge-base.json, test index) |

---

## 📂 Project Structure

```
AI-QA-Test-Case-Generator-master/
├── server.js                          # Express server — all routes, SSE endpoints, system init
├── package.json                       # Dependencies & project config
├── .env                               # OPENAI_API_KEY (not committed)
├── .gitignore
│
├── agents/
│   ├── recorderAgent.js               # Records user interactions in a headed browser
│   ├── scenarioGeneratorAgent.js      # AI generates positive & negative test scenarios
│   ├── enhancedPlannerAgent.js        # Formats scenarios into structured test plans
│   ├── plannerAgent.js                # Original planner — browser inspection & manual planning
│   ├── browserInspector.js            # Playwright browser launcher & DOM inspector
│   ├── testGeneratorAgent.js          # AI code generation (POM + specs) with SKILL & RAG
│   ├── healingAgent.js                # Self-healing agent for failed tests
│   ├── langGraphOrchestrator.js       # LangGraph state graph (Planner→Generator→Executor→Healer)
│   └── ragKnowledgeBase.js            # JSON-based RAG knowledge base for test patterns
│
├── utils/
│   ├── workflowOrchestrator.js        # End-to-end workflow: Record → Scenarios → Plan → Generate
│   └── testStorage.js                 # Persistent test storage with CRUD, search, export/import
│
├── skills/
│   └── playwright-qa/
│       └── SKILL.md                   # Domain knowledge loaded by Generator Agent
│
├── public/
│   ├── index.html                     # 4-tab Web UI (Recorder / Planner / Generator / Healer)
│   ├── script.js                      # Planner, Generator, Healer frontend logic
│   ├── recorder-script.js             # Recorder & Scenario Generator frontend logic
│   └── style.css                      # Dark theme styling
│
├── data/
│   ├── knowledge-base.json            # RAG knowledge base (stored test patterns)
│   └── tests/                         # Test storage index + individual test JSON files
│
├── recordings/                        # Recorded journey data, scenarios, and plans
│   ├── journey-*.json                 # Raw recorded journeys
│   ├── scenarios/                     # Generated scenario files
│   ├── plans/                         # Generated plan files
│   └── screenshots/                   # Step-by-step screenshots
│
├── pages/                             # Generated Page Object files (runtime output)
│   └── *.ts
│
├── tests/                             # Generated test spec files (runtime output)
│   └── *.spec.ts
│
└── scripts/                           # Utility scripts
```

---

## 📡 API Endpoints

### Recorder & Scenarios

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/recorder/start` | Start recording in a headed browser |
| `POST` | `/api/recorder/stop` | Stop recording & return journey data |
| `GET`  | `/api/recorder/status/:id` | Get recording session status |
| `POST` | `/api/recorder/cleanup` | Force cleanup lingering browser sessions |
| `POST` | `/api/scenarios/generate` | Generate positive & negative scenarios from journey |
| `GET`  | `/api/scenarios/:id` | Get previously generated scenarios |

### Workflow Orchestration

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/workflow/record-and-generate` | Complete end-to-end workflow |
| `POST` | `/api/workflow/stop-and-continue` | Stop recording & continue to generation |
| `GET`  | `/api/workflow/sessions` | List all workflow sessions |

### Agent Endpoints (SSE Streaming)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/agent/planner` | Hybrid planner — scenarios mode or manual browser inspection |
| `POST` | `/agent/generator` | AI test code generation (POM + specs) |
| `POST` | `/agent/healer` | Self-healing for failed tests |
| `POST` | `/agent/langgraph` | Full multi-agent orchestrated workflow |

### RAG Knowledge Base

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/rag/search` | Search similar test patterns |
| `POST` | `/api/rag/patterns` | Get successful patterns for a feature |
| `POST` | `/api/rag/store` | Store a new test pattern |
| `GET`  | `/api/rag/stats` | Knowledge base statistics |
| `POST` | `/api/rag/clear` | Clear all stored patterns |

### Test Storage

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/storage/tests` | Store a new test |
| `GET`  | `/api/storage/tests/:id` | Get test by ID |
| `POST` | `/api/storage/search` | Search tests by criteria |
| `GET`  | `/api/storage/recent` | Get recent tests |
| `PUT`  | `/api/storage/tests/:id/results` | Update test execution results |
| `DELETE` | `/api/storage/tests/:id` | Delete a test |
| `GET`  | `/api/storage/stats` | Storage statistics |
| `POST` | `/api/storage/export` | Export tests to JSON |
| `POST` | `/api/storage/import` | Import tests from JSON |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/health` | Health check with system status & stats |

---

## 🔐 Environment Setup

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd AI-QA-Test-Case-Generator-master
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Install Playwright Browsers

```bash
npx playwright install chromium
```

### 4. Create `.env` File

```
OPENAI_API_KEY=your_openai_api_key_here
```

### 5. Start the Server

```bash
node server.js
```

Open in browser: **http://localhost:5000**

---

## 🧪 Usage

### Web UI — Recorder Workflow (Recommended)

1. Open `http://localhost:5000`
2. **Recorder Tab** — Enter a base URL, click **Start Recording**. A headed browser opens — perform your actions (login, navigate, fill forms). Click **Stop & Generate Scenarios** when done.
3. The AI generates positive (happy path, boundary values, data combos) and negative (validation, security, edge cases) test scenarios.
4. Select scenarios and click **Send to Planner →**.
5. **Planner Tab** — Review the formatted test plans, click **Send to Generator →**.
6. **Generator Tab** — The AI generates Page Object + test spec files. Download or copy the generated code.
7. **Healer Tab** — If tests fail, paste the error — the healer will fix the code.

### Web UI — Manual Workflow

1. Open `http://localhost:5000`
2. **Planner Tab** — Select "Manual Input", enter a URL and describe the feature/user journey
3. **Generator Tab** — Review the plan, click Generate to produce POM + test specs
4. **Healer Tab** — If tests fail, paste the error — the healer fixes the code

### LangGraph Full Pipeline

Send a single request to run the entire automated workflow:

```bash
curl -X POST http://localhost:5000/agent/langgraph \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://example.com/login",
    "userActions": ["Login with admin/admin"],
    "featureDescription": "Login feature",
    "language": "typescript"
  }'
```

This will: inspect → plan → generate → execute → heal (if needed) → store results.

---

## 🧠 RAG Knowledge Base

The system learns from every generated test:

- **Storage** — Successful test patterns (code + locators + user actions) are saved to `data/knowledge-base.json`
- **Retrieval** — When generating new tests, the system searches for similar patterns and injects them as context into the GPT prompt
- **Improvement** — Over time, generated code quality improves as the knowledge base grows

---

## 🛡️ Security Considerations

- API key stored securely in `.env`
- `.env` excluded via `.gitignore`
- No sensitive data exposed to frontend
- Express body size limited to 50MB

---

## 👨‍💻 Author

### Ranjit Barik
QA Engineer | Test Automation | AI-Driven Testing

GitHub: https://github.com/rbarikot/AIQAREPO


