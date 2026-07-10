```markdown
# ⚡ Tiny Coder CLI (`tinycoder`)

A lightning-fast, zero-overhead, highly localized terminal coding companion tailored strictly for resource-constrained systems. Unlike bulky autonomous agents that consume massive token cycles, `tinycoder` operates on a strict, direct-action request/response model optimized to turn small, 1–2B parameter models (like `Qwen2.5-Coder:1.5b` or `Llama3.2:1b`) into precision development tools.

---

## 🚀 Key Architectural Pillars

* **Zero Agentic Overhead:** No endless agent loops, background thinking, or autonomous logic. Every action is synchronous, direct, and under your command.
* **Resource-Sipping Contexts:** Avoids parsing full codebases. It reads only high-level directory structures, `package.json`, and explicit files you select via interactive fuzzy finding.
* **Deterministic Patching Engine:** Utilizes an exact `SEARCH/REPLACE` block diff parser. If a micro-model hallucination breaks the block format, `tinycoder` triggers a single, isolated, silent validation retry before dropping back to clipboard copy-pasting.
* **Git Sandbox Isolation:** The utility has absolutely zero permissions to run system Git commands. Your staging area and commits remain completely untouched.
* **Ultra-Lean UI:** Built natively with Node.js streams, `chalk`, and `boxen`. It bypasses heavy CLI rendering engines for instant rendering and true real-time token streaming.

---

## 🛠️ Prerequisites & Local Environment Setup

`tinycoder` runs completely isolated on your machine via an OpenAI-compatible endpoint. The recommended local backend is **Ollama**.

1. Download and install [Ollama](https://ollama.com).
2. Start the local server daemon:
   ```bash
   ollama serve

```

3. Pull the targeted low-resource coding and reasoning models:
```bash
ollama pull qwen2.5-coder:1.5b
ollama pull llama3.2:1b

```



---

## 📥 Installation

Install the companion globally using npm:

```bash
# Clone the repository and hop inside
cd tinycoder

# Install lightweight structural dependencies
npm install

# Link the binary executable globally to your system path
npm link

```

Once linked, initialize the interface from within **any target codebase directory** on your machine by typing:

```bash
tinycoder

```

---

## 🗂️ Project Directory Topology

```text
tinycoder/
├── bin/
│   └── tinycoder.js          # Global terminal entry orchestration wrap
├── src/
│   ├── index.js              # State initialization and principal app shell loop
│   ├── config/
│   │   └── configManager.js  # Global (~/.config) vs Local JSON profile hierarchy
│   ├── ui/
│   │   ├── terminal.js       # Pure Node.js high-performance streamer view
│   │   └── prompts.js        # Optimized Enquirer autocomplete fuzzy file query
│   ├── llm/
│   │   ├── api.js            # Ollama fetch stream pipeline & 1-time retry gatekeeper
│   │   └── roles.js          # Specialized micro-model single-task system prompts
│   ├── fs/
│   │   ├── fileExplorer.js   # Fast recursive layout scanner (respects .gitignore)
│   │   ├── contextEditor.js  # Safe management layers for TINY*.md documents
│   │   └── diffParser.js     # Deterministic SEARCH/REPLACE block code injector
│   └── commands/
│       └── handlers.js       # Action router and setting manager backend
├── package.json
└── README.md

```

---

## 🎮 Command Guide & Slash Routing

If you type a prompt without a prefix command, `tinycoder` automatically routes your request to the default configured assistant (typically `/code`).

| Command | Operational Focus | Primary Target Model (Default) | Artifact Generated |
| --- | --- | --- | --- |
| `/code <msg>` | Contextual editing with precise code alterations | `qwen2.5-coder:1.5b` | Direct File Mutation |
| `/power <msg>` | Complex algorithmic adjustments or refactors | `qwen2.5-coder:7b` | Direct File Mutation |
| `/gather` | Compiles current directory tree mapping layouts | `llama3.2:1b` | `TINYCONTEXT.md` |
| `/plan <msg>` | Converts complex user specs into tactical tasks | `llama3.2:1b` | `TINYPLAN.md` |
| `/ask <msg>` | Pure chat, architectural discussions, or debug support | `llama3.2:1b` | Console Output Only |
| `/review` | Deep inspection of selected code for safety/syntax | `qwen2.5-coder:1.5b` | Console Output Only |
| `/test` | Automates execution-ready spec testing blocks | `qwen2.5-coder:1.5b` | Console Output Only |
| `/settings` | Graphical configuration dashboard manager | N/A | Updates configuration |
| `/help` | Renders terminal command utility index | N/A | Console Output Only |
| `/exit` | Terminals operational runtime cleanly | N/A | N/A |

---

## 🧠 Smart Context Management (`TINY*.md`)

To safely stay inside the restricted $4k$–$8k$ token context windows of 1B/2B parameters models, `tinycoder` avoids analyzing unneeded files. Instead, it relies on two external markdown state managers:

1. **`TINYCONTEXT.md`**: Generated automatically by running `/gather`. It scans your files names, project anatomy, and dependency versions (`package.json`) to map the structural blueprint without scanning entire file bodies.
2. **`TINYPLAN.md`**: Generated by running `/plan <your feature idea>`. It writes an incremental development plan mapping exactly how to implement your feature.

When calling `/code` or `/power`, `tinycoder` looks for these files in your root directory. If present, it injects them as condensed context windows so the small model understands your project architecture instantly.

---

## 📝 Code Modification System

To prevent rewriting entire documents, models are forced via system prompts to generate structural modification patches using strict block markers:

```text
<<<<<<< SEARCH
function calculateTotal(price) {
    return price + 10;
}
=======
function calculateTotal(price, tax = 0.22) {
    return price + (price * tax);
}
>>>>>>> REPLACE

```

### The Auto-Correction Engine

1. **Extraction:** The JavaScript regex engine isolates the `SEARCH` text block.
2. **Identity Verification:** The exact segment must match your local file, down to spaces and tabs.
3. **Fallback Level 1 (Auto-Retry):** If the 1B model misses a boundary character, `tinycoder` intercepts the failure, builds a correction instruction, and requests a fast re-generation block from the LLM.
4. **Fallback Level 2 (Manual Copy):** If the retry still violates the structural mask, the tool logs a notification and drops the raw stream stream into the terminal console so you can manually insert the patch.

---

## ⚙️ Settings Profile Precedence

Configurations are stored across two explicit scopes:

* **Global Configuration:** Kept inside `~/.config/tinycoder/config.json`.
* **Local Project Configuration:** Kept inside a custom `tinycoder.json` located within the root directory of a specific project workspace.

> ⚠️ **Precedence Rule:** Local configuration criteria (`tinycoder.json`) completely overwrite global configurations. Use local files to change model mappings for individual repositories without altering system defaults.

### Default Global JSON Configuration Shape

```json
{
    "endpoint": "[http://127.0.0.1:11434/api](http://127.0.0.1:11434/api)",
    "defaultRole": "code",
    "models": {
        "code": "qwen2.5-coder:1.5b",
        "power": "qwen2.5-coder:7b",
        "gather": "llama3.2:1b",
        "plan": "llama3.2:1b",
        "ask": "llama3.2:1b",
        "review": "qwen2.5-coder:1.5b",
        "test": "qwen2.5-coder:1.5b"
    }
}

```

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for further details.

```

```