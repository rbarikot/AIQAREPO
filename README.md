# 🤖 AI QA Test Case Generator

An AI-powered full-stack web application that generates structured QA test cases and executable Playwright automation scripts from feature descriptions.

---

## 🚀 Overview

AI QA Test Case Generator is designed to help QA engineers and developers automate the process of writing:

- Structured manual test cases  
- Priority-based classification (High / Medium / Low)  
- Positive and negative test scenarios  
- Executable Playwright automation scripts  
- Exportable CSV test documentation  

This project demonstrates real-world integration of Large Language Models (LLMs) into a full-stack QA workflow.

---

## 🎯 Purpose

Writing test cases and automation scripts manually is repetitive and time-consuming.

This tool leverages AI to:

- Convert feature requirements into structured QA artifacts  
- Automatically scaffold Playwright automation scripts  
- Improve QA productivity  
- Demonstrate AI-driven testing innovation  
- Serve as a foundation for RAG-based intelligent testing systems  

---

## 🏗️ Architecture
```

Frontend (HTML / CSS / JavaScript)
↓
Node.js + Express Backend
↓
OpenAI API (LLM)
↓
Structured JSON Response
↓
Rendered Test Cases + Automation Script

```


---

## 🧰 Tech Stack

### Frontend
- HTML5  
- CSS3 (Custom styling + Google Fonts)  
- Vanilla JavaScript (Fetch API, DOM manipulation)

### Backend
- Node.js  
- Express.js  
- OpenAI API  
- dotenv  
- CORS  

### AI Integration
- GPT model for structured test case generation  
- Enforced JSON output format  
- Controlled temperature for deterministic responses  

---

## ✨ Features Implemented

- Generate structured test cases from feature input  
- Optional negative test case generation  
- Automatic priority assignment  
- Playwright automation script generation  
- Copy script to clipboard  
- Download test cases as CSV  
- Regenerate with modified options  
- Clear/reset UI state  
- Error handling for invalid AI responses  
- Secure API key management via `.env`  

---

## 📂 Project Structure

```
ai-testcase-generator/
│
├── public/
│ ├── index.html
│ ├── style.css
│ └── script.js
│
├── services/ # Reserved for future AI / RAG services
│
├── server.js # Express backend server
├── package.json # Project metadata and dependencies
├── package-lock.json # Dependency lock file
├── .env # Environment variables (NOT committed)
└── .gitignore # Git ignore configuration
```


---

## 🔐 Environment Setup

### 1️⃣ Clone the Repository

```bash
git clone <your-repository-url>
cd ai-testcase-generator

2️⃣ Install Dependencies
npm install

3️⃣ Create .env File
OPENAI_API_KEY=your_openai_api_key_here

4️⃣ Run the Server
node server.js

Open in browser:
http://localhost:5000

🧪 Example Usage

Input:

ATM withdrawal functionality


Output:

Structured manual test cases

Negative scenarios (invalid PIN, insufficient balance)

Fully scaffolded Playwright test script

Downloadable CSV test documentation
```

<h2>🔎 Planned Enhancement: RAG Integration</h2>

The next phase of development includes implementing Retrieval-Augmented Generation (RAG).

Why RAG?

Current generation is prompt-based only.
RAG will allow:

Injection of QA standards

Use of historical test cases

Regulatory compliance enforcement

Domain-specific testing intelligence

<h2>Planned RAG Architecture</h2>

```
User Input
    ↓
Embed Feature Text
    ↓
Search Vector Store
    ↓
Retrieve Relevant QA Documents
    ↓
Augment Prompt with Context
    ↓
Generate Context-Aware Test Cases
```

🛡️ Security Considerations

API key stored securely in .env

.env excluded via .gitignore

No sensitive data exposed to frontend

<h2>👨‍💻 Author</h2>

<h3>Sarath Sasidharan</h3>
QA Engineer | Test Automation | AI-Driven Testing

This project was built to demonstrate practical implementation of AI in QA workflows, combining structured test design, automation scaffolding, and full-stack LLM integration.

GitHub: https://github.com/sharath-sasidharan

LinkedIn: https://www.linkedin.com/in/sarath-sasidharan-74b30b136/

