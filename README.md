# 🤖 AI QA Test Case Generator

An AI-powered multi-agent system that generates production-quality Playwright test automation from a URL and user actions. It launches a real browser, inspects the live page, generates Page Object Model (POM) + test specs, executes them, and self-heals failures — all orchestrated via LangGraph.

---

## 🚀 Overview

AI QA Test Case Generator uses a **three-agent pipeline** backed by real browser inspection to produce Playwright TypeScript tests that actually work:

1. **Planner Agent** — Parses user actions, launches Chromium, performs a multi-step browser journey, and extracts real page elements & locators.
2. **Generator Agent** — Uses the live inspection data + RAG knowledge base patterns + a Playwright skill file to generate Page Object classes and test specs via GPT-4o-mini.
3. **Healer Agent** — Analyzes test failures, identifies root causes, and produces fully healed code with alternative selectors.

A **LangGraph Orchestrator** ties all three agents into an automated workflow with conditional self-healing loops.

---

## 🎯 Key Features

- **Real Browser Inspection** — Launches Chromium to execute user journeys and extract actual DOM elements, locators, and screenshots
- **Multi-Agent LangGraph Orchestration** — `START → Planner → Generator → Executor → (Healer if failed) → END` with up to 3 healing retries
- **Page Object Model Generation** — Produces separate POM classes (`pages/LoginPage.ts`) and test specs (`tests/login.spec.ts`)
- **RAG Knowledge Base** — Stores successful test patterns in JSON and retrieves similar examples to improve future generation
- **Self-Healing Tests** — AI-powered failure analysis with root cause classification and automatic code repair
- **Persistent Test Storage** — Full CRUD operations for generated tests with search, export/import, and statistics
- **Skill System** — Loads domain-specific Playwright best practices from `skills/playwright-qa/SKILL.md` at generation time
- **Server-Sent Events (SSE)** — Real-time streaming of agent progress to the web UI
- **Web UI** — Dark-themed 3-tab interface (Planner / Generator / Healer) with live page preview, screenshots, and file display

---

## 🏗️ Architecture

```
┌──────────────┐      ┌───────────────┐      ┌──────────────┐
│   PLANNER    │ ───→ │   GENERATOR   │ ───→ │    HEALER    │
│              │      │               │      │              │
│ Parse actions│      │ Load SKILL.md │      │ Analyze      │
│ Launch browser│     │ Query RAG KB  │      │ failures     │
│ Execute journey│    │ Generate POM  │      │ Fix code     │
│ Extract elements│   │ + test specs  │      │ Alt selectors│
└──────────────┘      └───────────────┘      └──────────────┘
                              │
                    ┌─────────┴─────────┐
                    │  LangGraph State  │
                    │    Orchestrator   │
                    │                   │
                    │ Executor → Healer │
                    │   (loop ≤ 3x)    │
                    └───────────────────┘
```

### Data Flow (LangGraph Workflow)

```
User Input (URL + Actions)
    ↓
Planner: Browser Inspection → Journey Data + Element Map
    ↓
Generator: GPT-4o-mini + SKILL.md + RAG Context → POM + Spec Files
    ↓
Executor: npx playwright test → Results
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
| **AI/LLM** | OpenAI GPT-4o-mini |
| **Orchestration** | LangGraph (`@langchain/langgraph`) + LangChain |
| **Browser Automation** | Playwright (Chromium) |
| **Frontend** | Vanilla HTML/CSS/JS (dark theme) |
| **Storage** | JSON-based (knowledge-base.json, test index) |

---

## 📂 Project Structure

```
AI-QA-Test-Case-Generator-master/
├── server.js                          # Express server — routes, SSE endpoints, system init
├── package.json                       # Dependencies & project config
├── .env                               # OPENAI_API_KEY (not committed)
├── .gitignore
│
├── agents/
│   ├── plannerAgent.js                # Parses user actions → browser journey → test plan
│   ├── browserInspector.js            # Playwright browser launcher & DOM inspector
│   ├── testGeneratorAgent.js          # AI code generation (POM + specs) with SKILL & RAG
│   ├── healingAgent.js                # Self-healing agent for failed tests
│   ├── langGraphOrchestrator.js       # LangGraph state graph (Planner→Generator→Executor→Healer)
│   └── ragKnowledgeBase.js            # JSON-based RAG knowledge base for test patterns
│
├── services/
│   └── playwrightGenerator.js         # Legacy Playwright spec scaffolder
│
├── utils/
│   └── testStorage.js                 # Persistent test storage with CRUD, search, export/import
│
├── skills/
│   └── playwright-qa/
│       └── SKILL.md                   # Domain knowledge loaded by Generator Agent
│
├── public/
│   ├── index.html                     # 3-tab Web UI (Planner / Generator / Healer)
│   ├── script.js                      # Frontend SSE handling, tab switching, file display
│   └── style.css                      # Dark theme styling
│
├── data/
│   ├── knowledge-base.json            # RAG knowledge base (stored test patterns)
│   └── tests/                         # Test storage index + individual test JSON files
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

### Agent Endpoints (SSE Streaming)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/agent/planner` | Browser inspection & test planning |
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

### Web UI (Recommended)

1. Open `http://localhost:5000`
2. **Planner Tab** — Enter a URL and describe the user journey (e.g., "Login with admin/admin, navigate to dashboard")
3. **Generator Tab** — Review the plan, click Generate to produce POM + test specs
4. **Healer Tab** — If tests fail, paste the error — the healer will fix the code

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

GitHub: https://github.com/sharath-sasidharan


