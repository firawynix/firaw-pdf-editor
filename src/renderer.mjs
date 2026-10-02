import * as pdfjsLib from '../node_modules/pdfjs-dist/build/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../node_modules/pdfjs-dist/build/pdf.worker.mjs', import.meta.url).href;

const $ = id => document.getElementById(id);
const api = window.firawPdf;
const state = { bytes: null, originalName: '', pdf: null, page: 1, zoom: 1, selection: null, plan: null, history: [], scan: null, busy: false, renderId: 0 };
const actionNames = { cover_rect: 'Ocultar área visualmente', add_text: 'Adicionar texto', rotate: 'Girar página', delete_page: 'Excluir página', enhance_signature: 'Melhorar contraste da assinatura' };

function status(message) { $('status').textContent = message; }
function errorMessage(error) { status(error?.message || String(error)); }
function hasPdf() { return Boolean(state.pdf && state.bytes); }
function selectedRect() { return state.selection ? { ...state.selection } : null; }
function formatSelection(rect) { return rect ? `Página ${state.page}: X ${Math.round(rect.x)}, Y ${Math.round(rect.y)}, L ${Math.round(rect.width)}, A ${Math.round(rect.height)} / 1000` : 'Selecione uma área no documento para indicar o local exato.'; }
function updateUi() {
  const open = hasPdf();
  for (const id of ['saveBtn', 'mergeBtn', 'extractBtn', 'selectTool', 'rotateBtn', 'deleteBtn', 'textBtn']) $(id).disabled = !open;
  for (const id of ['coverBtn', 'signatureBtn']) $(id).disabled = !open || !state.selection;
  $('prevBtn').disabled = !open || state.page <= 1;
  $('nextBtn').disabled = !open || state.page >= state.pdf.numPages;
  $('pageIndicator').textContent = open ? `${state.page} / ${state.pdf.numPages}` : '— / —';
  $('zoomLabel').textContent = `${Math.round(state.zoom * 100)}%`;
  $('pageShell').classList.toggle('hidden', !open);
  $('emptyState').classList.toggle('hidden', open);
  $('planBtn').disabled = !open || !$('modelSelect').value || !($('prompt').value || '').trim();
  $('compressBtn').disabled = !open || $('stirlingStatus').dataset.server !== 'true';
  $('selectionInfo').textContent = formatSelection(state.selection);
  $('fileTop').textContent = open ? state.originalName : 'Nenhum documento aberto';
  $('docInfo').textContent = open ? `${state.originalName} · ${state.pdf.numPages} página(s)` : 'Abra um PDF para começar.';
  $('workspaceTitle').textContent = open ? state.originalName : 'Seu documento, do seu jeito.';
}
function resetSelection() { state.selection = null; $('selection').classList.add('hidden'); updateUi(); }
function showSelection() {
  if (!state.selection) { $('selection').classList.add('hidden'); return; }
  const rect = state.selection, canvas = $('pdfCanvas'), layer = $('selection');
  layer.style.left = `${rect.x / 10}%`; layer.style.top = `${rect.y / 10}%`;
  layer.style.width = `${rect.width / 10}%`; layer.style.height = `${rect.height / 10}%`;
  layer.classList.remove('hidden');
  $('selectionInfo').textContent = formatSelection(rect);
  $('coverBtn').disabled = false; $('signatureBtn').disabled = false;
}
async function setDocument(data, name, addHistory = false) {
  if (addHistory && state.bytes) { state.history.push(state.bytes); if (state.history.length > 5) state.history.shift(); }
  const incoming = new Uint8Array(data);
  const task = pdfjsLib.getDocument({ data: new Uint8Array(incoming), useSystemFonts: true });
  const pdf = await task.promise;
  if (state.pdf) await state.pdf.destroy();
  state.bytes = incoming; state.pdf = pdf; state.originalName = name || state.originalName || 'Documento.pdf';
  state.page = Math.max(1, Math.min(state.page, pdf.numPages)); state.plan = null;
  $('planCard').classList.add('hidden');
  resetSelection(); updateUi();
  await renderPage();
  renderThumbnails().catch(errorMessage);
  status(`Documento pronto · ${pdf.numPages} página(s).`);
}
async function renderPage() {
  if (!hasPdf()) return;
  const current = ++state.renderId;
  const page = await state.pdf.getPage(state.page);
  const stageWidth = $('stage').clientWidth - 90;
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(1.6, Math.max(.5, stageWidth / base.width)) * state.zoom;
  const viewport = page.getViewport({ scale });
  const canvas = $('pdfCanvas'), dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(viewport.width * dpr); canvas.height = Math.floor(viewport.height * dpr);
  canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: [dpr, 0, 0, dpr, 0, 0] }).promise;
  if (current !== state.renderId) return;
  showSelection(); updateUi();
  for (const thumb of document.querySelectorAll('.thumb')) thumb.classList.toggle('active', Number(thumb.dataset.page) === state.page);
}
async function renderThumbnails() {
  const container = $('thumbs'); container.replaceChildren();
  if (!hasPdf()) return;
  const pdf = state.pdf;
  const count = Math.min(pdf.numPages, 60);
  for (let index = 1; index <= count; index++) {
    if (state.pdf !== pdf) return;
    const page = await pdf.getPage(index);
    const viewport = page.getViewport({ scale: 78 / page.getViewport({ scale: 1 }).width });
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    try { await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise; }
    catch (error) { if (state.pdf !== pdf) return; throw error; }
    const button = document.createElement('button'); button.className = `thumb${index === state.page ? ' active' : ''}`; button.dataset.page = String(index);
    const label = document.createElement('span'); label.textContent = `Página ${index}`; button.append(canvas, label);
    button.onclick = async () => { state.page = index; resetSelection(); await renderPage(); };
    container.append(button);
  }
  if (pdf.numPages > 60) { const note = document.createElement('div'); note.className = 'empty-small'; note.textContent = 'Miniaturas das 60 primeiras páginas. Use as setas para as demais.'; container.append(note); }
}
async function withBusy(message, operation) {
  if (state.busy) return;
  state.busy = true; status(message);
  try { await operation(); } catch (error) { errorMessage(error); }
  finally { state.busy = false; updateUi(); }
}
async function doAction(action) {
  if (!hasPdf()) return;
  const result = await api.action(state.bytes, action);
  await setDocument(result, state.originalName, true);
}
async function enhancedPng(action) {
  const page = await state.pdf.getPage(action.page);
  if (page.rotate % 360 !== 0) throw new Error('Gire a página para a orientação original antes de ajustar uma área.');
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(2, 1600 / base.width) });
  const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  const x = Math.floor(action.x / 1000 * canvas.width), y = Math.floor(action.y / 1000 * canvas.height);
  const w = Math.max(1, Math.floor(action.width / 1000 * canvas.width)), h = Math.max(1, Math.floor(action.height / 1000 * canvas.height));
  const crop = document.createElement('canvas'); crop.width = w; crop.height = h;
  const context = crop.getContext('2d'); context.drawImage(canvas, x, y, w, h, 0, 0, w, h);
  const pixels = context.getImageData(0, 0, w, h);
  for (let i = 0; i < pixels.data.length; i += 4) {
    for (let channel = 0; channel < 3; channel++) {
      const value = pixels.data[i + channel];
      pixels.data[i + channel] = value > 235 ? 255 : Math.max(0, Math.min(255, (value - 128) * 1.28 + 116));
    }
  }
  context.putImageData(pixels, 0, 0);
  return crop.toDataURL('image/png');
}
async function pageText() {
  const page = await state.pdf.getPage(state.page);
  const content = await page.getTextContent();
  return content.items.map(item => item.str || '').join(' ').slice(0, 9000);
}
function previewImage() {
  const source = $('pdfCanvas'); const canvas = document.createElement('canvas');
  const ratio = Math.min(1, 1200 / source.width);
  canvas.width = Math.round(source.width * ratio); canvas.height = Math.round(source.height * ratio);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', .72);
}

$('openBtn').onclick = $('emptyOpen').onclick = () => withBusy('Abrindo PDF…', async () => {
  const picked = await api.open(); if (!picked) { status('Abertura cancelada.'); return; }
  state.page = 1; state.history = []; await setDocument(picked.bytes, picked.name);
});
$('saveBtn').onclick = () => withBusy('Salvando PDF…', async () => {
  const filename = state.originalName.replace(/\.pdf$/i, '') + '-Firaw.pdf';
  const file = await api.save(state.bytes, filename);
  status(file ? `Salvo em ${file}` : 'Salvamento cancelado.');
});
$('mergeBtn').onclick = () => withBusy('Juntando PDFs…', async () => {
  const picked = await api.additional(); if (!picked) { status('Operação cancelada.'); return; }
  const result = await api.merge(state.bytes, picked.bytes); await setDocument(result, state.originalName, true);
});
$('extractBtn').onclick = () => withBusy('Extraindo página…', async () => {
  const result = await api.extract(state.bytes, state.page);
  const file = await api.save(result, `pagina-${state.page}-Firaw.pdf`);
  status(file ? `Página salva em ${file}` : 'Extração cancelada.');
});
$('prevBtn').onclick = async () => { if (state.page > 1) { state.page--; resetSelection(); await renderPage(); } };
$('nextBtn').onclick = async () => { if (state.page < state.pdf.numPages) { state.page++; resetSelection(); await renderPage(); } };
$('zoomIn').onclick = async () => { state.zoom = Math.min(2.5, state.zoom + .2); await renderPage(); };
$('zoomOut').onclick = async () => { state.zoom = Math.max(.5, state.zoom - .2); await renderPage(); };
$('rotateBtn').onclick = () => withBusy('Girando página…', () => doAction({ type: 'rotate', page: state.page, degrees: 90 }));
$('deleteBtn').onclick = () => { if (confirm(`Excluir a página ${state.page} deste resultado? O original será preservado.`)) withBusy('Excluindo página…', () => doAction({ type: 'delete_page', page: state.page })); };
$('coverBtn').onclick = () => withBusy('Ocultando área…', () => doAction({ type: 'cover_rect', page: state.page, ...selectedRect() }));
$('signatureBtn').onclick = () => withBusy('Ajustando contraste…', async () => {
  const rect = selectedRect(); const png = await enhancedPng({ page: state.page, ...rect });
  await doAction({ type: 'enhance_signature', page: state.page, ...rect, png });
});
$('textBtn').onclick = () => {
  const value = prompt('Texto a adicionar:'); if (!value) return;
  const rect = selectedRect();
  withBusy('Adicionando texto…', () => doAction({ type: 'add_text', page: state.page, x: rect?.x ?? 80, y: rect?.y ?? 80, size: 14, text: value }));
};
$('selectTool').onclick = () => { resetSelection(); status('Arraste sobre a página para selecionar uma área.'); };

let dragStart = null;
$('pdfCanvas').addEventListener('pointerdown', event => {
  if (!hasPdf()) return;
  const rect = $('pdfCanvas').getBoundingClientRect();
  dragStart = { x: Math.max(0, Math.min(1000, (event.clientX - rect.left) / rect.width * 1000)),
    y: Math.max(0, Math.min(1000, (event.clientY - rect.top) / rect.height * 1000)) };
  $('pdfCanvas').setPointerCapture(event.pointerId);
});
$('pdfCanvas').addEventListener('pointermove', event => {
  if (!dragStart) return;
  const rect = $('pdfCanvas').getBoundingClientRect();
  const end = { x: Math.max(0, Math.min(1000, (event.clientX - rect.left) / rect.width * 1000)),
    y: Math.max(0, Math.min(1000, (event.clientY - rect.top) / rect.height * 1000)) };
  state.selection = { x: Math.round(Math.min(dragStart.x, end.x)), y: Math.round(Math.min(dragStart.y, end.y)),
    width: Math.round(Math.abs(end.x - dragStart.x)), height: Math.round(Math.abs(end.y - dragStart.y)) };
  showSelection();
});
$('pdfCanvas').addEventListener('pointerup', () => {
  dragStart = null;
  if (!state.selection || state.selection.width < 3 || state.selection.height < 3) resetSelection(); else updateUi();
});

async function scanAi() {
  $('aiAvailability').textContent = 'Lendo hardware e modelos locais…';
  try {
    const scan = await api.scanAi(); state.scan = scan;
    const h = scan.hardware;
    $('hardware').textContent = `${h.cpu} · ${h.threads} threads · ${h.ramGb} GB RAM · ${h.gpu}${h.vramReliable ? ` · ${h.vramGb} GB VRAM` : ''}`;
    $('recommendation').textContent = `Recomendado: ${scan.recommended.name} (${scan.recommended.mode}). ${scan.recommended.note}`;
    $('aiAvailability').textContent = scan.ollamaInstalled ? `${scan.installed.length} modelo(s) instalado(s)` : 'Ollama não encontrado';
    $('ollamaLink').classList.toggle('hidden', scan.ollamaInstalled);
    const select = $('modelSelect'); select.replaceChildren();
    const blank = document.createElement('option'); blank.value = ''; blank.textContent = scan.installed.length ? 'Selecione um modelo local' : 'Nenhum modelo instalado'; select.append(blank);
    for (const model of scan.installed) { const option = document.createElement('option'); option.value = model; option.textContent = model; select.append(option); }
    if (scan.installed.includes(scan.recommended.name)) select.value = scan.recommended.name;
    else if (scan.installed.length) select.value = scan.installed[0];
    $('installModel').disabled = !scan.ollamaInstalled || scan.installed.includes(scan.recommended.name);
    $('installModel').textContent = scan.installed.includes(scan.recommended.name) ? 'Modelo já instalado' : `Instalar ${scan.recommended.name}`;
    updateUi();
  } catch (error) { $('aiAvailability').textContent = 'Falha na verificação'; errorMessage(error); }
}
$('scanAi').onclick = scanAi;
$('installModel').onclick = () => withBusy('Instalando modelo local…', async () => {
  await api.installAi(state.scan.recommended.name); await scanAi(); status('Modelo instalado e pronto para uso.');
});
api.onAiProgress(update => { $('installProgress').textContent = `${update.status || 'Baixando'}${update.percent == null ? '' : ` · ${update.percent}%`}`; });
$('ollamaLink').onclick = event => { event.preventDefault(); api.ollamaDownload(); };
$('prompt').oninput = updateUi; $('modelSelect').onchange = updateUi;
$('planBtn').onclick = () => withBusy('A IA local está analisando esta página…', async () => {
  const requestedPage = $('prompt').value.match(/p[áa]gina\s+(\d+)/i);
  if (requestedPage) {
    const page = Number(requestedPage[1]);
    if (page < 1 || page > state.pdf.numPages) throw new Error(`O documento tem ${state.pdf.numPages} página(s); ajuste o número no pedido.`);
    if (page !== state.page) { state.page = page; resetSelection(); await renderPage(); }
  }
  const plan = await api.plan({ model: $('modelSelect').value, prompt: $('prompt').value, page: state.page,
    pageCount: state.pdf.numPages, selection: selectedRect(), text: await pageText(), image: previewImage() });
  state.plan = plan;
  $('planSummary').textContent = plan.summary || 'Proposta criada. Confira cada ação.';
  const list = $('planActions'); list.replaceChildren();
  for (const action of plan.actions) { const item = document.createElement('div'); item.className = 'plan-action'; item.textContent = `${actionNames[action.type]} · página ${action.page}${action.text ? ` · “${action.text}”` : ''}`; list.append(item); }
  if (!plan.actions.length) { const item = document.createElement('div'); item.className = 'plan-action'; item.textContent = 'Nenhuma alteração automática proposta. Selecione uma área mais precisa e tente novamente.'; list.append(item); }
  $('applyPlan').disabled = !plan.actions.length;
  $('planCard').classList.remove('hidden');
  status(plan.usedVision ? 'Proposta visual pronta para revisão.' : 'Proposta textual pronta para revisão.');
});
$('discardPlan').onclick = () => { state.plan = null; $('planCard').classList.add('hidden'); status('Proposta descartada.'); };
$('applyPlan').onclick = () => withBusy('Aplicando proposta…', async () => {
  if (!state.plan?.actions?.length) return;
  const actions = [...state.plan.actions.filter(item => item.type !== 'delete_page'),
    ...state.plan.actions.filter(item => item.type === 'delete_page').sort((a, b) => b.page - a.page)];
  let next = state.bytes;
  for (const item of actions) {
    const action = { ...item };
    if (action.type === 'enhance_signature') action.png = await enhancedPng(action);
    next = await api.action(next, action);
  }
  await setDocument(next, state.originalName, true);
  status('Proposta aplicada. Revise o resultado e salve uma cópia.');
});

async function scanStirling() {
  try {
    const result = await api.stirlingStatus();
    $('stirlingStatus').dataset.server = String(result.server);
    $('stirlingStatus').textContent = result.desktop ? 'Aplicativo Windows instalado neste computador.' : result.server ? 'Servidor local disponível em 127.0.0.1:8080.' : 'Ainda não instalado. Você pode obter a versão Windows oficial.';
    updateUi();
  } catch (error) { $('stirlingStatus').textContent = error.message; }
}
$('openStirling').onclick = () => withBusy('Abrindo Stirling PDF…', async () => { await api.stirlingOpen(); status('Stirling PDF aberto.'); });
$('getStirling').onclick = () => api.stirlingDownload();
$('compressBtn').onclick = () => withBusy('Comprimindo no Stirling local…', async () => {
  const result = await api.stirlingCompress(state.bytes); await setDocument(result, state.originalName, true);
  status('PDF comprimido pelo Stirling local. Revise e salve uma cópia.');
});

document.addEventListener('keydown', event => {
  if (event.ctrlKey && event.key.toLowerCase() === 'o') { event.preventDefault(); $('openBtn').click(); }
  if (event.ctrlKey && event.key.toLowerCase() === 's') { event.preventDefault(); if (hasPdf()) $('saveBtn').click(); }
  if (event.ctrlKey && event.key.toLowerCase() === 'z' && state.history.length) {
    event.preventDefault(); const previous = state.history.pop(); setDocument(previous, state.originalName).then(() => status('Última alteração desfeita.')).catch(errorMessage);
  }
});
window.addEventListener('resize', () => { if (hasPdf()) renderPage().catch(errorMessage); });
api.onSmokePdf?.(value => setDocument(value.bytes, value.name).catch(errorMessage));
updateUi(); scanAi(); scanStirling();
