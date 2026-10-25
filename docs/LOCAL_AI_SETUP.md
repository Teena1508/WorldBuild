# WORLDBUILD Story Studio — Local AI & Offline Setup Guide

This guide details how to configure, run, and verify the fully local, offline AI-powered narrative analysis pipeline in WORLDBUILD Story Studio.

---

## 1. Zero-Cloud Privacy Architecture

WORLDBUILD Story Studio enforces a strict local privacy boundary:

- **No paid AI APIs**: Zero dependencies on OpenAI, Anthropic, Google, or any cloud LLM provider.
- **Zero outbound inference traffic**: Manuscript text, character secrets, and canon entities are **never** transmitted across the public internet.
- **Server-Side Loopback Validation**: The application strictly validates that `OLLAMA_BASE_URL` points to a local loopback address (`127.0.0.1`, `localhost`, `[::1]`) to prevent Server-Side Request Forgery (SSRF) and data leakage.
- **Pure Offline Capability**: Once Ollama and your chosen model weights are downloaded locally, the entire application functions completely without an internet connection.
- **Deterministic Rule Guarantees**: Even if Ollama is not installed or running, the Story Studio automatically executes deterministic Continuity Oracle rules on your manuscript (detecting post-mortem appearances and unlearned secrets) with 100% offline precision.

---

## 2. Choosing a Local Model & Hardware Requirements

Do not assume every computer has the same RAM or GPU capacity. Evaluate your machine's hardware before selecting a model:

| Model | Parameter Size | Minimum System RAM | VRAM (Apple Silicon / GPU) | Storage Required | Best Suited For |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`llama3.2:3b`** *(Recommended Default)* | 3 Billion | **8 GB RAM** | 2 GB | ~2.0 GB | Fast, lightweight analysis on standard laptops & MacBooks. Excellent structured JSON output. |
| **`mistral:7b`** | 7 Billion | **16 GB RAM** | 6 GB | ~4.1 GB | Rich narrative subtlety, deep nuance for complex fantasy mythologies. |
| **`llama3:8b`** | 8 Billion | **16 GB RAM** | 8 GB | ~4.7 GB | High causal reasoning for intricate non-linear timelines. |
| **`qwen2.5:7b`** | 7 Billion | **16 GB RAM** | 6 GB | ~4.5 GB | Strong instruction adherence and structured schema conformance. |

> [!TIP]
> For standard laptops or machines with 8 GB to 16 GB of RAM, `llama3.2` (3B) provides the fastest response times (typically 1–3 seconds per chapter) while consuming minimal battery and memory.

---

## 3. Step-by-Step Setup Instructions

### Step 1: Install Ollama
Download and install the official Ollama runtime for your operating system:

- **macOS**: `brew install ollama` or download the installer from [ollama.com](https://ollama.com/download/mac).
- **Linux**: Run `curl -fsSL https://ollama.com/install.sh | sh`.
- **Windows**: Download the Windows installer from [ollama.com/download/windows](https://ollama.com/download/windows).

### Step 2: Download Your Desired Model (One-Time Online Step)
While connected to the internet, open your terminal and pull your preferred model:

```bash
# Recommended default (compact and fast)
ollama pull llama3.2

# Or for larger 7B/8B models:
ollama pull mistral
ollama pull llama3:8b
```

Verify that the model is present in your local library:
```bash
ollama list
```

### Step 3: Start the Ollama Daemon
Ensure Ollama is running in the background:
```bash
ollama serve
```
By default, Ollama listens locally at `http://127.0.0.1:11434`.

---

## 4. Environment Configuration

Copy or update your `.env` file with your local model settings:

```ini
# Base URL for local Ollama runtime (must be a loopback address)
OLLAMA_BASE_URL=http://127.0.0.1:11434

# Configured model name (must match an installed model from `ollama list`)
OLLAMA_MODEL=llama3.2

# Request timeout in milliseconds (default: 60000ms / 60 seconds)
OLLAMA_TIMEOUT_MS=60000

# Optional: Allow trusted private LAN servers (e.g. air-gapped homelab server)
# OLLAMA_ALLOW_REMOTE_HOST=false
```

---

## 5. Offline Verification Procedure

To verify that Story Studio operates completely offline:

1. Start your local Ollama daemon: `ollama serve`.
2. Start the WORLDBUILD application: `npm run dev`.
3. Disconnect your computer from Wi-Fi or unplug your ethernet cable.
4. Navigate to `http://localhost:3000/vault/univ-demo-aethelgard`.
5. Click **"Story Studio"** in the top navigation ribbon.
6. Observe the green status pill: `Local AI: llama3.2 (Ready)`.
7. Click **"Analyze Chapter"**.
8. Notice that the analysis completes, producing structured canon and plot-hole findings while entirely disconnected from the internet.

---

## 6. Remote Deployment Architecture Distinction

> [!IMPORTANT]
> **Why remote websites cannot automatically access your computer's Ollama:**
> When WORLDBUILD is hosted on a remote server (e.g., Vercel, AWS, or DigitalOcean), the remote server cannot and **must not** attempt to connect to `http://localhost:11434` on a visitor's personal computer. Web browsers strictly block cross-origin requests from public HTTPS sites to internal loopback addresses for security reasons.
>
> **Recommended architectures:**
> 1. **Private Local Desktop / Studio Mode (Recommended)**: Run WORLDBUILD directly on your own workstation (`npm start` or local container). Both Next.js and Ollama run on the same private loopback network.
> 2. **Air-Gapped Studio Server**: Deploy WORLDBUILD on an internal local area network (LAN) server alongside a dedicated Ollama GPU node, with `OLLAMA_BASE_URL` pointed to the local network IP and `OLLAMA_ALLOW_REMOTE_HOST=true`.

---

## 7. Data Privacy Boundary: Stored Data vs Model Data

- **Stored in PostgreSQL**:
  - Chapter records, sequence numbering, and manuscript content.
  - Character bios, lifespans, locations, events, relationships, and secrets.
  - Author findings: status (`open`, `accepted`, `dismissed`, `resolved`), intentional exception reasons, and custom notes.
- **Sent to the Local Model**:
  - Only the currently active chapter manuscript text.
  - A filtered, bounded excerpt of canon entities that are directly mentioned in or relevant to the scene.
  - Structured prompt instructions requesting JSON output.
- **Never Sent Anywhere**:
  - Telemetry, usage logs, external tracking scripts, or cloud inference calls.
