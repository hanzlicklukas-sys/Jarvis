# JARVIS AI Assistant

> Just A Rather Very Intelligent System — powered by Claude AI

```
  ██╗ █████╗ ██████╗ ██╗   ██╗██╗███████╗
  ██║██╔══██╗██╔══██╗██║   ██║██║██╔════╝
  ██║███████║██████╔╝██║   ██║██║███████╗
  ██║██╔══██║██╔══██╗╚██╗ ██╔╝██║╚════██║
  ██║██║  ██║██║  ██║ ╚████╔╝ ██║███████║
  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚═╝╚══════╝
```

JARVIS is a Node.js AI assistant with a Tony Stark-inspired personality. It integrates Claude AI, voice I/O, persistent memory, 21 built-in tools, and ships as both a terminal app and a native Electron desktop app (.dmg / .exe).

---

## Prerequisites

- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **npm 9+** (bundled with Node 20)
- **API keys** — see below

---

## Installation

```bash
# 1. Clone or download the project
cd Jarvis

# 2. Install dependencies
npm install

# 3. Copy the example env file
cp .env.example .env

# 4. Fill in your API keys
nano .env   # or any text editor
```

---

## API Keys

### Anthropic (required)
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an account → API Keys → **Create Key**
3. Copy the key into `.env` as `ANTHROPIC_API_KEY`

### OpenAI — for Whisper STT (optional)
1. Go to [platform.openai.com](https://platform.openai.com)
2. API Keys → **Create new secret key**
3. Copy into `.env` as `OPENAI_API_KEY`

### OpenWeatherMap — weather tool (optional)
1. Go to [openweathermap.org/api](https://openweathermap.org/api)
2. Sign up → My API Keys → **Generate**
3. Copy into `.env` as `WEATHER_API_KEY`

### Brave Search API — web search (optional)
1. Go to [brave.com/search/api](https://brave.com/search/api/)
2. Subscribe to the free tier → **Copy API key**
3. Copy into `.env` as `BRAVE_SEARCH_API_KEY`

> Without Brave Search, JARVIS falls back to DuckDuckGo's instant answer API (no key required, limited results).

---

## Running JARVIS

### Terminal mode (development)
```bash
npm start
# or with auto-restart on file changes:
npm run dev
```

On first run, if no `.env` is found, JARVIS will interactively ask for your API keys.

### Electron desktop app (development)
```bash
npx electron src/electron-main.js
```

---

## Building for Distribution

### Generate icons first
```bash
npm run generate-icons
```
Place a custom `1024x1024` PNG at `assets/icon-source.png` before running this, or a JARVIS-themed placeholder will be generated automatically.

### macOS (.dmg — universal)
```bash
npm run build:app -- --mac
# Output: dist/JARVIS-*.dmg
```
Produces separate builds for Apple Silicon (arm64) and Intel (x64).

### Windows (.exe installer)
```bash
npm run build:app -- --win
# Output: dist/JARVIS Setup *.exe
```

### Single-file binaries (no Electron)
```bash
npm run build:win        # → dist/jarvis-win.exe
npm run build:mac-arm    # → dist/jarvis-mac-arm
npm run build:mac-intel  # → dist/jarvis-mac-intel
```
These use `pkg` to bundle the terminal app into a self-contained binary.

---

## Commands & Hotkeys

### Terminal commands
| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/quit` or `/exit` | Exit JARVIS |
| `/clear` | Clear conversation history |
| `/memory` | Show all stored memories |
| `/forget <id>` | Delete a memory by ID |
| `/voice` | Toggle voice mode (TTS + STT) |

### Electron hotkeys
| Hotkey | Action |
|--------|--------|
| `Cmd/Ctrl + Shift + J` | Show / hide JARVIS window |
| `Enter` | Send message |

---

## Built-in Tools (21)

JARVIS can use these tools autonomously when answering your requests:

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents |
| `write_file` | Write to a file |
| `append_file` | Append to a file |
| `list_directory` | List directory contents |
| `create_directory` | Create a directory |
| `delete_file` | Delete file or directory |
| `move_file` | Move / rename a file |
| `search_files` | Glob search in directory |
| `web_search` | Search via Brave / DuckDuckGo |
| `fetch_url` | Fetch and parse a webpage |
| `run_command` | Execute shell commands |
| `get_weather` | Current weather for a city |
| `save_memory` | Save to persistent memory |
| `recall_memory` | Search memory |
| `get_time` | Current date and time |
| `calculate` | Safe math evaluation |
| `set_reminder` | Set a timed reminder |
| `list_reminders` | List pending reminders |
| `cancel_reminder` | Cancel a reminder |
| `get_system_info` | CPU / RAM / disk info |
| `open_application` | Open an app by name |

---

## Customizing JARVIS's Personality

Create a file at `data/system_prompt.txt` to override the default personality:

```bash
cat > data/system_prompt.txt << 'EOF'
You are JARVIS, but sassier. You occasionally reference sci-fi movies.
You are extremely concise — never more than 2 sentences unless asked for detail.
You have access to the filesystem and internet. Use tools without asking.
EOF
```

JARVIS will pick this up automatically on next startup (no restart required mid-conversation — takes effect on the next message).

---

## Project Structure

```
Jarvis/
├── src/
│   ├── main.js           # Entry point, conversation loop
│   ├── brain.js          # Claude AI integration + tool loop
│   ├── memory.js         # SQLite persistent memory
│   ├── voice.js          # TTS (say) + STT (Whisper)
│   ├── electron-main.js  # Electron wrapper
│   └── tools/
│       └── index.js      # All 21 tool implementations
├── ui/
│   ├── terminal.js       # Terminal UI (chalk + readline)
│   └── index.html        # Electron HTML UI
├── proactive/
│   └── scheduler.js      # node-schedule reminders + briefings
├── scripts/
│   └── generate-icons.js # Icon generation (sharp + png-to-ico)
├── data/                 # SQLite DB + custom system prompt
├── assets/               # Icons (.png, .ico, .icns)
├── .env                  # Your API keys (not committed)
├── .env.example          # Template
├── electron-builder.yml  # Electron packaging config
└── package.json
```

---

## Troubleshooting

### "ANTHROPIC_API_KEY not configured"
Make sure your `.env` file exists and contains a valid key:
```bash
cat .env   # should show your key
```

### "better-sqlite3" build errors
```bash
npm rebuild better-sqlite3
# or on macOS, install Xcode Command Line Tools:
xcode-select --install
```

### Voice mode not working (TTS)
- **macOS**: uses built-in `say` command — should work out of the box
- **Windows**: requires SAPI — usually pre-installed
- **Linux**: install `espeak`: `sudo apt install espeak`

### Voice mode not working (STT / Whisper)
- Requires `OPENAI_API_KEY` in `.env`
- Requires `sox` for audio recording:
  - macOS: `brew install sox`
  - Linux: `sudo apt install sox`
  - Windows: [sox.sourceforge.net](http://sox.sourceforge.net)

### Electron app shows blank window
Run `npm install` to ensure all dependencies are installed, then try:
```bash
npx electron src/electron-main.js --enable-logging
```

### `pkg` binary build fails
```bash
npm install -g pkg
# then retry:
npm run build:win
```

### Memory database errors
Delete and recreate the database:
```bash
rm data/jarvis.db
npm start   # will recreate automatically
```

---

## License

MIT — use freely, modify liberally, blame Tony Stark.
