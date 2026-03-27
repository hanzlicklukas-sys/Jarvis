'use strict';

let chalk;
try { chalk = require('chalk'); } catch { chalk = null; }

const readline = require('readline');

// ANSI fallback if chalk not available
const c = {
  cyan: (s) => chalk ? chalk.cyan(s) : s,
  yellow: (s) => chalk ? chalk.yellow(s) : s,
  green: (s) => chalk ? chalk.green(s) : s,
  red: (s) => chalk ? chalk.red(s) : s,
  gray: (s) => chalk ? chalk.gray(s) : s,
  white: (s) => chalk ? chalk.white(s) : s,
  bold: (s) => chalk ? chalk.bold(s) : s,
  magenta: (s) => chalk ? chalk.magenta(s) : s,
  blueBright: (s) => chalk ? chalk.blueBright(s) : s
};

const JARVIS_BANNER = `
  ██╗ █████╗ ██████╗ ██╗   ██╗██╗███████╗
  ██║██╔══██╗██╔══██╗██║   ██║██║██╔════╝
  ██║███████║██████╔╝██║   ██║██║███████╗
  ██║██╔══██║██╔══██╗╚██╗ ██╔╝██║╚════██║
  ██║██║  ██║██║  ██║ ╚████╔╝ ██║███████║
  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚═╝╚══════╝
`;

class TerminalUI {
  constructor() {
    this.rl = null;
    this._spinnerInterval = null;
    this._spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this._spinnerIdx = 0;
    this._isStreaming = false;
  }

  showBanner() {
    console.log(c.cyan(JARVIS_BANNER));
    console.log(c.gray('  Just A Rather Very Intelligent System'));
    console.log(c.gray('  Powered by Claude AI\n'));
    console.log(c.gray('  Commands: /help, /quit, /clear, /memory, /voice, /forget <id>\n'));
    console.log(c.gray('─'.repeat(60)));
    console.log();
  }

  initReadline() {
    if (this.rl) return this.rl;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
      historySize: 100
    });
    return this.rl;
  }

  prompt() {
    return new Promise((resolve) => {
      const rl = this.initReadline();
      rl.question(c.white('\nYou: '), (answer) => {
        resolve(answer.trim());
      });
    });
  }

  startSpinner(message = 'JARVIS is thinking') {
    this._stopSpinner();
    process.stdout.write('\n');
    this._spinnerInterval = setInterval(() => {
      const frame = this._spinnerFrames[this._spinnerIdx % this._spinnerFrames.length];
      process.stdout.write(`\r${c.cyan(frame)} ${c.gray(message + '...')}`);
      this._spinnerIdx++;
    }, 80);
  }

  _stopSpinner() {
    if (this._spinnerInterval) {
      clearInterval(this._spinnerInterval);
      this._spinnerInterval = null;
      process.stdout.write('\r' + ' '.repeat(50) + '\r');
    }
  }

  startStreaming() {
    this._stopSpinner();
    this._isStreaming = true;
    process.stdout.write(`\n${c.cyan('JARVIS')}: `);
  }

  streamToken(token) {
    if (this._isStreaming) {
      process.stdout.write(c.cyan(token));
    }
  }

  endStreaming() {
    this._isStreaming = false;
    process.stdout.write('\n');
  }

  showResponse(text) {
    this._stopSpinner();
    console.log(`\n${c.cyan('JARVIS')}: ${c.cyan(text)}`);
  }

  showToolUse(name, input) {
    const inputStr = typeof input === 'object' ? JSON.stringify(input) : String(input);
    const truncated = inputStr.length > 80 ? inputStr.substring(0, 77) + '...' : inputStr;
    console.log(`\n${c.yellow('⚡ Tool')}: ${c.yellow(name)} ${c.gray(truncated)}`);
  }

  showToolResult(name, result) {
    const resultStr = typeof result === 'object' ? JSON.stringify(result) : String(result);
    const truncated = resultStr.length > 100 ? resultStr.substring(0, 97) + '...' : resultStr;
    console.log(`${c.green('  ✓')} ${c.gray(truncated)}`);
  }

  showError(error) {
    this._stopSpinner();
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`\n${c.red('✗ Error')}: ${c.red(msg)}`);
  }

  showInfo(info) {
    console.log(`\n${c.gray('ℹ')} ${c.gray(info)}`);
  }

  showSuccess(msg) {
    console.log(`\n${c.green('✓')} ${c.green(msg)}`);
  }

  showMemories(memories) {
    if (!memories || memories.length === 0) {
      console.log(c.gray('\n  No memories stored yet.'));
      return;
    }
    console.log(c.cyan('\n─── Memories ───────────────────────────────────────'));
    memories.forEach((m) => {
      const date = m.created_at ? new Date(m.created_at).toLocaleString() : 'unknown';
      console.log(`${c.yellow(`[${m.id}]`)} ${c.gray(`(${m.type})`)} ${m.content.substring(0, 100)}`);
      console.log(`    ${c.gray('Created: ' + date + ' | Accessed: ' + m.access_count + 'x')}`);
    });
    console.log(c.cyan('─'.repeat(50)));
  }

  showHelp() {
    console.log(c.cyan('\n─── JARVIS Commands ─────────────────────────────────'));
    const commands = [
      ['/help', 'Show this help message'],
      ['/quit or /exit', 'Exit JARVIS'],
      ['/clear', 'Clear conversation history'],
      ['/memory', 'Show stored memories'],
      ['/forget <id>', 'Delete a memory by ID'],
      ['/voice', 'Toggle voice mode (TTS + STT)'],
    ];
    commands.forEach(([cmd, desc]) => {
      console.log(`  ${c.yellow(cmd.padEnd(20))} ${c.gray(desc)}`);
    });
    console.log(c.cyan('─'.repeat(50)));
  }

  clearScreen() {
    console.clear();
    this.showBanner();
  }

  close() {
    this._stopSpinner();
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }
}

module.exports = { TerminalUI };
