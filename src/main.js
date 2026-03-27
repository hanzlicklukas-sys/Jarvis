'use strict';

// Load environment variables first
const path = require('path');
const fs = require('fs');

// Check for .env file
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config();
}

const readline = require('readline');
const memory = require('./memory');
const brain = require('./brain');
const voice = require('./voice');
const { TerminalUI } = require('../ui/terminal');
const { scheduleReminder, scheduleDailyBriefing, listReminders } = require('../proactive/scheduler');

const ui = new TerminalUI();
let voiceMode = false;

// ─── Interactive setup ────────────────────────────────────────────────────────

async function runSetup() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const question = (q) => new Promise(resolve => rl.question(q, resolve));

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║         JARVIS First-Time Setup          ║');
  console.log('╚══════════════════════════════════════════╝\n');
  console.log('No .env file found. Let\'s set up your API keys.\n');
  console.log('You can skip any key by pressing Enter (features will be limited).\n');

  const anthropicKey = await question('Anthropic API key (required for Claude): ');
  const openaiKey = await question('OpenAI API key (for voice/Whisper STT): ');
  const weatherKey = await question('OpenWeatherMap API key (for weather): ');
  const braveKey = await question('Brave Search API key (for web search): ');

  rl.close();

  const envContent = [
    `ANTHROPIC_API_KEY=${anthropicKey || 'your_anthropic_key_here'}`,
    `OPENAI_API_KEY=${openaiKey || 'your_openai_key_here_for_whisper_stt'}`,
    `WEATHER_API_KEY=${weatherKey || 'your_openweathermap_key_here'}`,
    `BRAVE_SEARCH_API_KEY=${braveKey || 'your_brave_search_key_here'}`
  ].join('\n') + '\n';

  fs.writeFileSync(envPath, envContent, 'utf8');
  require('dotenv').config({ path: envPath });
  console.log('\n✓ .env file created. Starting JARVIS...\n');
}

// ─── Command handlers ─────────────────────────────────────────────────────────

async function handleCommand(cmd) {
  const parts = cmd.trim().split(/\s+/);
  const command = parts[0].toLowerCase();

  switch (command) {
    case '/quit':
    case '/exit':
      ui.showInfo('Goodbye. Shutting down JARVIS...');
      voice.stopSpeaking();
      ui.close();
      process.exit(0);
      break;

    case '/clear':
      brain.clearHistory();
      ui.clearScreen();
      ui.showSuccess('Conversation history cleared.');
      break;

    case '/memory': {
      const memories = memory.getAllMemories(20);
      ui.showMemories(memories);
      break;
    }

    case '/forget': {
      const id = parseInt(parts[1]);
      if (isNaN(id)) {
        ui.showError('Usage: /forget <id>  (use /memory to see IDs)');
      } else {
        const success = memory.forgetMemory(id);
        if (success) {
          ui.showSuccess(`Memory ${id} deleted.`);
        } else {
          ui.showError(`No memory found with id=${id}`);
        }
      }
      break;
    }

    case '/voice':
      voiceMode = !voiceMode;
      ui.showInfo(`Voice mode ${voiceMode ? 'ON' : 'OFF'}`);
      if (voiceMode) {
        ui.showInfo('JARVIS will now speak responses and listen for your voice.');
        try {
          await voice.speak('Voice mode activated. I am listening.');
        } catch (err) {
          ui.showError('TTS error: ' + err.message);
        }
      }
      break;

    case '/help':
      ui.showHelp();
      break;

    default:
      ui.showError(`Unknown command: ${command}. Type /help for available commands.`);
  }
}

// ─── Main conversation loop ───────────────────────────────────────────────────

async function mainLoop() {
  ui.showBanner();

  // Initialize memory DB
  try {
    memory.getDb();
    ui.showInfo('Memory system initialized.');
  } catch (err) {
    ui.showError('Memory system failed to initialize: ' + err.message);
  }

  // Schedule daily briefing
  try {
    scheduleDailyBriefing(9, async () => {
      const briefing = await brain.chat(
        'Give me a brief morning briefing. Check the time and wish me good morning. Keep it under 3 sentences.',
        null
      );
      ui.showResponse('\n[Daily Briefing] ' + briefing);
      if (voiceMode) {
        try { await voice.speak(briefing); } catch { /* ignore */ }
      }
    });
  } catch { /* scheduler not critical */ }

  ui.showInfo('JARVIS ready. Type your message or a command (/help).\n');

  while (true) {
    let userInput;

    // Voice or text input
    if (voiceMode) {
      ui.showInfo('Listening... (speak now)');
      try {
        userInput = await voice.listen(6000);
        if (!userInput || !userInput.trim()) {
          ui.showInfo('No speech detected. Falling back to text input.');
          userInput = await ui.prompt();
        } else {
          console.log(`\nYou (voice): ${userInput}`);
        }
      } catch (err) {
        ui.showError('Voice input error: ' + err.message + '. Using text input.');
        userInput = await ui.prompt();
      }
    } else {
      userInput = await ui.prompt();
    }

    if (!userInput) continue;

    // Handle slash commands
    if (userInput.startsWith('/')) {
      await handleCommand(userInput);
      continue;
    }

    // Process with Claude
    ui.startSpinner('JARVIS is thinking');

    let firstToken = true;
    let fullResponse = '';

    try {
      fullResponse = await brain.chat(userInput, (token) => {
        // Handle tool notification tokens
        if (token.startsWith('\n[Tool:')) {
          if (firstToken) {
            ui._stopSpinner();
            firstToken = false;
          }
          // Extract tool name for display
          const match = token.match(/\[Tool: ([^\]]+)\]/);
          if (match) {
            ui.showToolUse(match[1], '');
          }
          return;
        }

        if (firstToken) {
          ui._stopSpinner();
          ui.startStreaming();
          firstToken = false;
        }
        ui.streamToken(token);
        fullResponse += token; // Note: brain.chat already returns full; this is for display only
      });

      if (firstToken) {
        // No tokens streamed yet (edge case)
        ui._stopSpinner();
        ui.showResponse(fullResponse);
      } else {
        ui.endStreaming();
      }

    } catch (err) {
      ui._stopSpinner();
      ui.showError(err.message);
      continue;
    }

    // Voice output
    if (voiceMode && fullResponse) {
      try {
        // Speak in background (non-blocking for next input)
        voice.speak(fullResponse).catch(() => {});
      } catch { /* ignore */ }
    }
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

(async () => {
  // Check if .env exists; if not, run setup
  if (!fs.existsSync(envPath)) {
    await runSetup();
  }

  // Verify Anthropic key
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_anthropic_key_here') {
    console.error('\n✗ ANTHROPIC_API_KEY is not set. JARVIS cannot function without it.');
    console.error('  Add your key to .env or run setup again.\n');
    process.exit(1);
  }

  await mainLoop();
})();
