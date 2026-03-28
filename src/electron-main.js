'use strict';

const { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Electron apps don't inherit shell PATH — add Homebrew locations so sox/rec can be found
process.env.PATH = [
  process.env.PATH,
  '/usr/local/bin',
  '/opt/homebrew/bin',
  '/usr/bin',
  '/bin'
].filter(Boolean).join(':');

let win = null;
let tray = null;
let memory, brain, voice;

const SETTINGS_PATH = path.join(__dirname, '../data/settings.json');
const DEFAULT_SETTINGS = {
  voiceEnabled: true,
  ttsEnabled: true,
  userName: 'User',
  systemPrompt: "You are JARVIS, an advanced AI assistant. You are helpful, precise, and slightly witty - like Tony Stark's AI. Use tools proactively. Be concise."
};

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')) };
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings) {
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

async function initBackend() {
  try {
    memory = require('./memory');
    brain = require('./brain');
    voice = require('./voice');
  } catch (err) {
    console.error('[main] Backend init error:', err.message);
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#060608',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false
  });

  win.loadFile(path.join(__dirname, '../ui/index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });
}

function setupIPC() {
  ipcMain.on('chat:send', async (event, { message, history }) => {
    try {
      let fullResponse = '';
      await brain.chat(message, (token) => {
        const toolStart = token.match(/^\n\[Tool: ([^\]]+)\]\n$/);
        const toolEnd = token.match(/^\n\[Tool Done: ([^\]]+)\]\n$/);
        if (toolStart) {
          win?.webContents.send('chat:token', { type: 'tool_start', toolName: toolStart[1] });
        } else if (toolEnd) {
          win?.webContents.send('chat:token', { type: 'tool_end', toolName: toolEnd[1] });
        } else {
          fullResponse += token;
          win?.webContents.send('chat:token', { type: 'text', token });
        }
      });
      win?.webContents.send('chat:done', { fullResponse });
      const settings = loadSettings();
      if (settings.ttsEnabled && fullResponse) {
        voice?.speak(fullResponse).catch(() => {});
      }
    } catch (err) {
      win?.webContents.send('chat:error', { error: err.message });
    }
  });

  ipcMain.handle('memory:getAll', () => { try { return memory?.getAllMemories() || []; } catch { return []; } });
  ipcMain.handle('memory:delete', (e, { id }) => { try { memory?.forgetMemory(id); return { success: true }; } catch (e) { return { error: e.message }; } });
  ipcMain.handle('settings:get', () => loadSettings());
  ipcMain.handle('settings:save', (e, s) => { saveSettings(s); return { success: true }; });
  ipcMain.handle('voice:listen', async () => { try { const t = await voice?.listen(6000); return { transcript: t || '' }; } catch (e) { return { error: e.message }; } });
  ipcMain.handle('voice:stop', () => { voice?.stopSpeaking(); return { success: true }; });
  ipcMain.handle('actions:getRecent', () => { try { return memory?.getRecentActions(20) || []; } catch { return []; } });
}

app.whenReady().then(async () => {
  await initBackend();
  setupIPC();
  createWindow();

  globalShortcut.register('CommandOrControl+Shift+J', () => {
    if (win?.isVisible()) win.hide(); else { win?.show(); win?.focus(); }
  });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!win) createWindow(); else { win.show(); win.focus(); } });
app.on('will-quit', () => globalShortcut.unregisterAll());
