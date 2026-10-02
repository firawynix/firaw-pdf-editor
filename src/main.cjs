const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { applyAction, mergeDocuments, extractPage } = require('./pdf-ops.cjs');
const { MODELS, scanHardware, recommend } = require('./ai-config.cjs');
const { cleanPlan } = require('./ai-plan.cjs');

let mainWindow;
const MAX_PDF = 80 * 1024 * 1024;
const OLLAMA = 'http://127.0.0.1:11434';
const STIRLING = 'http://127.0.0.1:8080';

function window() {
  mainWindow = new BrowserWindow({ width: 1540, height: 960, minWidth: 1100, minHeight: 700,
    title: 'Firaw - Pdf Editor', icon: path.join(__dirname, '..', 'assets', 'icon.ico'), backgroundColor: '#07111b',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  if (process.argv.includes('--smoke')) {
    mainWindow.webContents.on('console-message', (_event, level, message) => console.log(`RENDERER ${level}: ${message}`));
    setTimeout(() => { console.error('SMOKE_TIMEOUT'); app.exit(1); }, 30000).unref();
    mainWindow.webContents.once('did-finish-load', async () => {
    try {
    console.log('SMOKE_LOADED');
    const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
    const sample = await PDFDocument.create();
    const page = sample.addPage([595, 842]);
    const font = await sample.embedFont(StandardFonts.Helvetica);
    page.drawText('Firaw Pdf Editor - verificacao local', { x: 70, y: 750, size: 20, font, color: rgb(0.05, 0.4, 0.5) });
    mainWindow.webContents.send('pdf:smoke', { name: 'amostra.pdf', bytes: new Uint8Array(await sample.save()) });
    console.log('SMOKE_SENT');
    await new Promise(resolve => setTimeout(resolve, 5000));
    const visible = await mainWindow.webContents.executeJavaScript("document.querySelector('#pageIndicator')?.textContent");
    if (visible !== '1 / 1') { console.error(`PDF não carregou: ${visible}`); app.exit(1); return; }
    const ai = await mainWindow.webContents.executeJavaScript("({selected: document.querySelector('#modelSelect')?.value, status: document.querySelector('#aiAvailability')?.textContent})");
    if (!ai.selected || ai.status.includes('Verificando') || ai.status.includes('Lendo')) { console.error(`IA não detectada: ${JSON.stringify(ai)}`); app.exit(1); return; }
    const image = await mainWindow.capturePage();
    await fs.writeFile(path.join(app.getPath('temp'), 'firaw-pdf-smoke.png'), image.toPNG());
    console.log(`SMOKE_OK: ${visible} · IA ${ai.selected}`); app.quit();
    } catch (error) { console.error('SMOKE_ERROR', error); app.exit(1); }
    });
  }
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
}
app.whenReady().then(() => { window(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) window(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

function bytes(input) {
  if (!input || !Number.isFinite(input.length) || input.length > MAX_PDF) throw new Error('PDF vazio ou maior que 80 MB.');
  return new Uint8Array(input);
}
async function readPdf(file) {
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > MAX_PDF) throw new Error('Escolha um PDF de até 80 MB.');
  const data = await fs.readFile(file);
  if (data.subarray(0, 5).toString() !== '%PDF-') throw new Error('O arquivo escolhido não é um PDF.');
  return { name: path.basename(file), path: file, bytes: new Uint8Array(data) };
}
ipcMain.handle('pdf:open', async () => {
  const chosen = await dialog.showOpenDialog(mainWindow, { title: 'Abrir PDF', filters: [{ name: 'PDF', extensions: ['pdf'] }], properties: ['openFile'] });
  return chosen.canceled ? null : readPdf(chosen.filePaths[0]);
});
ipcMain.handle('pdf:open-additional', async () => {
  const chosen = await dialog.showOpenDialog(mainWindow, { title: 'Escolher PDF para juntar', filters: [{ name: 'PDF', extensions: ['pdf'] }], properties: ['openFile'] });
  return chosen.canceled ? null : readPdf(chosen.filePaths[0]);
});
ipcMain.handle('pdf:save', async (_event, data, suggested) => {
  const chosen = await dialog.showSaveDialog(mainWindow, { title: 'Salvar PDF', defaultPath: suggested || 'Firaw-editado.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (chosen.canceled || !chosen.filePath) return null;
  await fs.writeFile(chosen.filePath, bytes(data));
  return chosen.filePath;
});
ipcMain.handle('pdf:action', (_event, data, action) => applyAction(bytes(data), action));
ipcMain.handle('pdf:merge', (_event, first, second) => mergeDocuments(bytes(first), bytes(second)));
ipcMain.handle('pdf:extract', (_event, data, number) => extractPage(bytes(data), number));

async function tags() {
  const response = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error('Ollama não respondeu.');
  const data = await response.json();
  return (data.models || []).filter(model => model.size > 0 && !model.name.includes(':cloud'));
}
async function ensureOllama() {
  try { await tags(); return; } catch { /* Tenta iniciar a instalação local. */ }
  const executable = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe');
  try { await fs.access(executable); } catch { throw new Error('Instale o Ollama no computador para usar a IA local.'); }
  const child = spawn(executable, ['serve'], { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => {}); child.unref();
  for (let i = 0; i < 18; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    try { await tags(); return; } catch { /* Aguarda o serviço. */ }
  }
  throw new Error('O Ollama está instalado, mas não iniciou. Abra-o e tente novamente.');
}
ipcMain.handle('ai:scan', async () => {
  const hardware = await scanHardware();
  let recommended = recommend(hardware);
  const ollamaInstalled = await fs.access(path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe')).then(() => true).catch(() => false);
  let installed = [];
  try { await ensureOllama(); installed = (await tags()).map(item => item.name); } catch { /* Estado mostrado na interface. */ }
  if (installed.includes('qwen3.5:9b') && hardware.ramGb >= 12) recommended = {
    name: 'qwen3.5:9b', downloadGb: 0, runtimeGb: 9, vision: true,
    mode: 'modelo visual já instalado', note: 'Aproveita a IA multimodal disponível neste computador; nenhum download é necessário.'
  };
  return { hardware, recommended, ollamaInstalled, installed };
});
ipcMain.handle('ai:install', async (event, name) => {
  if (!MODELS.some(model => model.name === name)) throw new Error('Modelo não recomendado.');
  await ensureOllama();
  if ((await tags()).some(item => item.name === name)) return name;
  const response = await fetch(`${OLLAMA}/api/pull`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: name, stream: true }) });
  if (!response.ok || !response.body) throw new Error(`Falha ao instalar: HTTP ${response.status}.`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder(); let pending = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split('\n'); pending = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const update = JSON.parse(line);
      if (update.error) throw new Error(update.error);
      event.sender.send('ai:progress', { status: update.status, percent: update.total ? Math.round(update.completed / update.total * 100) : null });
    }
  }
  return name;
});
ipcMain.handle('ai:plan', async (_event, request) => {
  const { model, prompt, page, pageCount, selection, text, image } = request || {};
  if (!Number.isInteger(page) || !Number.isInteger(pageCount) || page < 1 || page > pageCount || pageCount > 1000) throw new Error('Página inválida.');
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 2000) throw new Error('Escreva um pedido de até 2.000 caracteres.');
  const installed = await tags();
  const info = installed.find(item => item.name === model);
  if (!info) throw new Error('Selecione um modelo instalado neste computador.');
  const isVision = /^gemma3:(4b|12b|27b|latest)/.test(model) || /^qwen3\.5:/.test(model);
  const images = isVision && typeof image === 'string' && image.startsWith('data:image/jpeg;base64,') && image.length < 4_000_000 ? [image.split(',')[1]] : [];
  const system = `Você planeja alterações visuais em um PDF. Responda somente JSON válido: {"summary":"...","actions":[...]}. Ações permitidas: cover_rect {type,page,x,y,width,height} para ocultar visualmente área; add_text {type,page,x,y,size,text}; rotate {type,page,degrees}; delete_page {type,page}; enhance_signature {type,page,x,y,width,height}. Coordenadas x,y,width,height vão de 0 a 1000, origem no canto superior esquerdo da página. Se a posição for incerta, retorne actions vazias e explique na summary que o usuário deve selecionar a área. Nunca invente ação fora da lista. Para assinatura, preserve identidade e traços; apenas melhora contraste na área existente. Não afirme que cover_rect apaga dados subjacentes. Máximo 8 ações.`;
  const user = `Pedido: ${prompt}\nPágina exibida: ${page} de ${pageCount}.\nSeleção na página (0-1000): ${selection ? JSON.stringify(selection) : 'nenhuma'}.\nTexto extraído desta página: ${String(text || '').slice(0, 9000)}\nUse a seleção quando o pedido se referir a uma área específica.`;
  const response = await fetch(`${OLLAMA}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(180000),
    body: JSON.stringify({ model, stream: false, think: false, format: 'json', options: { temperature: 0, num_ctx: 8192 },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user, ...(images.length ? { images } : {}) }] }) });
  if (!response.ok) throw new Error(`Ollama retornou HTTP ${response.status}.`);
  const data = await response.json();
  const plan = cleanPlan(data.message?.content || '', pageCount);
  if (data.done_reason === 'length') throw new Error('A resposta da IA foi interrompida. Tente um pedido mais curto.');
  return { ...plan, model, usedVision: images.length > 0 };
});

async function stirlingExecutable() {
  const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], path.join(process.env.LOCALAPPDATA || '', 'Programs')].filter(Boolean);
  const names = ['Stirling-PDF', 'Stirling PDF', 'StirlingPDF'];
  for (const root of roots) for (const name of names) for (const exe of ['Stirling-PDF.exe', 'Stirling PDF.exe', 'StirlingPDF.exe']) {
    const candidate = path.join(root, name, exe);
    if (await fs.access(candidate).then(() => true).catch(() => false)) return candidate;
  }
  return null;
}
ipcMain.handle('stirling:status', async () => {
  const executable = await stirlingExecutable();
  let server = false;
  try { server = (await fetch(STIRLING, { signal: AbortSignal.timeout(2000) })).ok; } catch { /* Servidor ausente. */ }
  return { desktop: Boolean(executable), server };
});
ipcMain.handle('stirling:open', async () => {
  const executable = await stirlingExecutable();
  if (executable) { spawn(executable, [], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); return 'desktop'; }
  try { if ((await fetch(STIRLING, { signal: AbortSignal.timeout(2000) })).ok) { await shell.openExternal(STIRLING); return 'server'; } }
  catch { /* Exibe instrução. */ }
  throw new Error('Stirling PDF não encontrado. Instale a versão Windows oficial pelo botão abaixo.');
});
ipcMain.handle('stirling:download', () => shell.openExternal('https://www.stirling.com/download'));
ipcMain.handle('ollama:download', () => shell.openExternal('https://ollama.com/download/windows'));
ipcMain.handle('stirling:compress', async (_event, input) => {
  const data = bytes(input);
  const form = new FormData(); form.set('fileInput', new Blob([data], { type: 'application/pdf' }), 'firaw.pdf');
  const response = await fetch(`${STIRLING}/api/v1/misc/compress-pdf`, { method: 'POST', body: form, signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`Stirling local retornou HTTP ${response.status}. Confira se a API está habilitada.`);
  const result = new Uint8Array(await response.arrayBuffer());
  if (result.length < 5 || Buffer.from(result.subarray(0, 5)).toString() !== '%PDF-') throw new Error('Stirling não devolveu um PDF.');
  return result;
});
