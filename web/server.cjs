const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Readable } = require('node:stream');
const { MODELS, scanHardware, recommend } = require('../src/ai-config.cjs');
const { cleanPlan } = require('../src/ai-plan.cjs');

const root = path.resolve(__dirname, '..');
const host = '127.0.0.1';
const port = Number(process.env.FIRAW_PDF_PORT || 4173);
const ollama = 'http://127.0.0.1:11434';
const stirling = 'http://127.0.0.1:8080';
const maxPdf = 80 * 1024 * 1024;
const files = new Map([
  ['/', 'web/index.html'], ['/editor', 'web/editor.html'],
  ['/web/styles.css', 'web/styles.css'], ['/web/editor.css', 'web/editor.css'],
  ['/web/adapter.js', 'web/adapter.js'], ['/web/editor-tabs.js', 'web/editor-tabs.js'],
  ['/src/styles.css', 'src/styles.css'], ['/src/renderer.mjs', 'src/renderer.mjs'],
  ['/src/pdf-ops.cjs', 'src/pdf-ops.cjs'],
  ['/assets/logo.svg', 'assets/logo.svg'], ['/assets/preview.png', 'assets/preview.png'],
  ['/assets/icon.png', 'assets/icon.png'],
  ['/node_modules/pdf-lib/dist/pdf-lib.min.js', 'node_modules/pdf-lib/dist/pdf-lib.min.js'],
  ['/node_modules/pdfjs-dist/build/pdf.mjs', 'node_modules/pdfjs-dist/build/pdf.mjs'],
  ['/node_modules/pdfjs-dist/build/pdf.worker.mjs', 'node_modules/pdfjs-dist/build/pdf.worker.mjs']
]);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

function send(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function checkLocal(req) {
  const expected = `${host}:${port}`;
  if (req.headers.host !== expected || req.headers['x-firaw-local'] !== '1' ||
    (req.headers.origin && req.headers.origin !== `http://${expected}`) ||
    (req.method !== 'GET' && req.headers.origin !== `http://${expected}`))
    throw Object.assign(new Error('Acesso local não autorizado.'), { status: 403 });
}
async function body(req, limit) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Arquivo ou pedido muito grande.'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function json(req, limit = 4_500_000) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json'))
    throw Object.assign(new Error('Formato de pedido inválido.'), { status: 415 });
  return JSON.parse((await body(req, limit)).toString('utf8'));
}
async function tags() {
  const response = await fetch(`${ollama}/api/tags`, { signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error('Ollama não respondeu.');
  const data = await response.json();
  return (data.models || []).filter(model => model.size > 0 && !model.name.includes(':cloud'));
}
async function ensureOllama() {
  try { await tags(); return; } catch { /* Inicia a instalação local existente. */ }
  const executable = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe');
  try { await fs.access(executable); } catch { throw new Error('Instale o Ollama no computador para usar a IA local.'); }
  const child = spawn(executable, ['serve'], { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => {}); child.unref();
  for (let i = 0; i < 18; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    try { await tags(); return; } catch { /* Aguarda o serviço local. */ }
  }
  throw new Error('O Ollama está instalado, mas não iniciou. Abra-o e tente novamente.');
}
async function scanAi() {
  const hardware = await scanHardware();
  let recommended = recommend(hardware);
  const executable = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe');
  const fileInstalled = await fs.access(executable).then(() => true).catch(() => false);
  let installed = [], running = false;
  try { await ensureOllama(); installed = (await tags()).map(item => item.name); running = true; } catch { /* Editor segue sem IA. */ }
  if (installed.includes('qwen3.5:9b') && hardware.ramGb >= 12) recommended = {
    name: 'qwen3.5:9b', downloadGb: 0, runtimeGb: 9, vision: true,
    mode: 'modelo visual já instalado', note: 'Aproveita a IA multimodal disponível neste computador; nenhum download é necessário.'
  };
  return { hardware, recommended, ollamaInstalled: fileInstalled || running, installed };
}
async function planAi(request) {
  const { model, prompt, page, pageCount, selection, text, image } = request || {};
  if (!Number.isInteger(page) || !Number.isInteger(pageCount) || page < 1 || page > pageCount || pageCount > 1000)
    throw new Error('Página inválida.');
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 2000)
    throw new Error('Escreva um pedido de até 2.000 caracteres.');
  const installed = await tags();
  if (!installed.some(item => item.name === model)) throw new Error('Selecione um modelo instalado neste computador.');
  const isVision = /^gemma3:(4b|12b|27b|latest)/.test(model) || /^qwen3\.5:/.test(model);
  const images = isVision && typeof image === 'string' && image.startsWith('data:image/jpeg;base64,') && image.length < 4_000_000
    ? [image.split(',')[1]] : [];
  const system = 'Você planeja alterações visuais em um PDF. Responda somente JSON válido: {"summary":"...","actions":[...]}. Ações permitidas: cover_rect {type,page,x,y,width,height} para ocultar visualmente área; add_text {type,page,x,y,size,text}; rotate {type,page,degrees}; delete_page {type,page}; enhance_signature {type,page,x,y,width,height}. Coordenadas x,y,width,height vão de 0 a 1000, origem no canto superior esquerdo da página. Se a posição for incerta, retorne actions vazias e explique na summary que o usuário deve selecionar a área. Nunca invente ação fora da lista. Para assinatura, preserve identidade e traços; apenas melhora contraste na área existente. Não afirme que cover_rect apaga dados subjacentes. Máximo 8 ações.';
  const user = `Pedido: ${prompt}\nPágina exibida: ${page} de ${pageCount}.\nSeleção na página (0-1000): ${selection ? JSON.stringify(selection) : 'nenhuma'}.\nTexto extraído desta página: ${String(text || '').slice(0, 9000)}\nUse a seleção quando o pedido se referir a uma área específica.`;
  const response = await fetch(`${ollama}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(180000), body: JSON.stringify({ model, stream: false, think: false, format: 'json',
      options: { temperature: 0, num_ctx: 8192 }, messages: [{ role: 'system', content: system },
        { role: 'user', content: user, ...(images.length ? { images } : {}) }] }) });
  if (!response.ok) throw new Error(`Ollama retornou HTTP ${response.status}.`);
  const data = await response.json();
  if (data.done_reason === 'length') throw new Error('A resposta da IA foi interrompida. Tente um pedido mais curto.');
  return { ...cleanPlan(data.message?.content || '', pageCount), model, usedVision: images.length > 0 };
}
async function stirlingExecutable() {
  const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], path.join(process.env.LOCALAPPDATA || '', 'Programs')].filter(Boolean);
  for (const root of roots) for (const name of ['Stirling-PDF', 'Stirling PDF', 'StirlingPDF'])
    for (const exe of ['Stirling-PDF.exe', 'Stirling PDF.exe', 'StirlingPDF.exe']) {
      const candidate = path.join(root, name, exe);
      if (await fs.access(candidate).then(() => true).catch(() => false)) return candidate;
    }
  return null;
}
async function stirlingStatus() {
  const executable = await stirlingExecutable();
  let server = false;
  try { server = (await fetch(stirling, { signal: AbortSignal.timeout(2000) })).ok; } catch { /* Servidor ausente. */ }
  return { desktop: Boolean(executable), server };
}
async function handleApi(req, res, pathname) {
  checkLocal(req);
  if (pathname === '/api/ai/scan' && req.method === 'GET') return send(res, 200, await scanAi());
  if (pathname === '/api/ai/plan' && req.method === 'POST') return send(res, 200, await planAi(await json(req)));
  if (pathname === '/api/ai/install' && req.method === 'POST') {
    const { name } = await json(req, 1000);
    if (!MODELS.some(model => model.name === name)) throw new Error('Modelo não recomendado.');
    await ensureOllama();
    if ((await tags()).some(item => item.name === name)) return send(res, 200, { installed: name });
    const remote = await fetch(`${ollama}/api/pull`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: name, stream: true }) });
    if (!remote.ok || !remote.body) throw new Error(`Falha ao instalar: HTTP ${remote.status}.`);
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' });
    try { for await (const chunk of Readable.fromWeb(remote.body)) res.write(chunk); }
    finally { res.end(); }
    return;
  }
  if (pathname === '/api/stirling/status' && req.method === 'GET') return send(res, 200, await stirlingStatus());
  if (pathname === '/api/stirling/open' && req.method === 'POST') {
    const executable = await stirlingExecutable();
    if (executable) {
      const child = spawn(executable, [], { detached: true, stdio: 'ignore', windowsHide: true });
      child.on('error', () => {}); child.unref(); return send(res, 200, { mode: 'desktop' });
    }
    if ((await stirlingStatus()).server) return send(res, 200, { mode: 'server', url: stirling });
    throw new Error('Stirling PDF não encontrado. Instale a versão Windows oficial pelo botão abaixo.');
  }
  if (pathname === '/api/stirling/compress' && req.method === 'POST') {
    if (req.headers['content-type'] !== 'application/pdf') throw Object.assign(new Error('Formato inválido.'), { status: 415 });
    const data = await body(req, maxPdf);
    if (data.subarray(0, 5).toString() !== '%PDF-') throw new Error('PDF inválido.');
    const form = new FormData(); form.set('fileInput', new Blob([data], { type: 'application/pdf' }), 'firaw.pdf');
    const remote = await fetch(`${stirling}/api/v1/misc/compress-pdf`, { method: 'POST', body: form, signal: AbortSignal.timeout(180000) });
    if (!remote.ok) throw new Error(`Stirling local retornou HTTP ${remote.status}. Confira se a API está habilitada.`);
    const result = Buffer.from(await remote.arrayBuffer());
    if (result.subarray(0, 5).toString() !== '%PDF-') throw new Error('Stirling não devolveu um PDF.');
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': result.length, 'Cache-Control': 'no-store' });
    res.end(result); return;
  }
  return send(res, 404, { error: 'Recurso não encontrado.' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${host}:${port}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url.pathname);
    if (req.method !== 'GET' || req.headers.host !== `${host}:${port}`) return send(res, 403, { error: 'Acesso não autorizado.' });
    const file = files.get(url.pathname);
    if (!file) return send(res, 404, { error: 'Página não encontrada.' });
    const data = await fs.readFile(path.join(root, file));
    res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Content-Length': data.length,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    res.end(data);
  } catch (error) {
    if (!res.headersSent) send(res, error.status || 500, { error: error.message || 'Falha local.' });
    else res.end();
  }
});
server.listen(port, host, () => console.log(`Firaw - Pdf Editor local: http://${host}:${port}/`));
