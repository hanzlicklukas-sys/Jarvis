'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvis', {
  sendMessage: (msg, history) => ipcRenderer.send('chat:send', { message: msg, history }),
  onToken: (cb) => ipcRenderer.on('chat:token', (e, d) => cb(d)),
  onDone: (cb) => ipcRenderer.on('chat:done', (e, d) => cb(d)),
  onError: (cb) => ipcRenderer.on('chat:error', (e, d) => cb(d)),
  removeListeners: (ch) => ipcRenderer.removeAllListeners(ch),
  getAllMemories: () => ipcRenderer.invoke('memory:getAll'),
  deleteMemory: (id) => ipcRenderer.invoke('memory:delete', { id }),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  listen: () => ipcRenderer.invoke('voice:listen'),
  stopSpeaking: () => ipcRenderer.invoke('voice:stop'),
  getRecentActions: () => ipcRenderer.invoke('actions:getRecent'),
});
