const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('firawPdf', {
  open: () => ipcRenderer.invoke('pdf:open'), additional: () => ipcRenderer.invoke('pdf:open-additional'),
  save: (bytes, name) => ipcRenderer.invoke('pdf:save', bytes, name),
  action: (bytes, action) => ipcRenderer.invoke('pdf:action', bytes, action),
  merge: (first, second) => ipcRenderer.invoke('pdf:merge', first, second),
  extract: (bytes, page) => ipcRenderer.invoke('pdf:extract', bytes, page),
  scanAi: () => ipcRenderer.invoke('ai:scan'), installAi: name => ipcRenderer.invoke('ai:install', name),
  plan: request => ipcRenderer.invoke('ai:plan', request),
  onAiProgress: callback => ipcRenderer.on('ai:progress', (_event, value) => callback(value)),
  stirlingStatus: () => ipcRenderer.invoke('stirling:status'), stirlingOpen: () => ipcRenderer.invoke('stirling:open'),
  stirlingDownload: () => ipcRenderer.invoke('stirling:download'), stirlingCompress: bytes => ipcRenderer.invoke('stirling:compress', bytes),
  ollamaDownload: () => ipcRenderer.invoke('ollama:download'),
  onSmokePdf: callback => ipcRenderer.on('pdf:smoke', (_event, value) => callback(value))
});
