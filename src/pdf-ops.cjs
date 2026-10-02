const { PDFDocument, StandardFonts, rgb, degrees } = typeof module !== 'undefined' && module.exports
  ? require('pdf-lib') : globalThis.PDFLib;

function assertPage(doc, number) {
  if (!Number.isInteger(number) || number < 1 || number > doc.getPageCount()) throw new Error('Página inválida.');
  return doc.getPage(number - 1);
}
function finite(value, min, max, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${label} inválido.`);
  return number;
}
function rectOnPage(page, action) {
  if (page.getRotation().angle % 360 !== 0) throw new Error('Ajuste áreas apenas em páginas sem rotação. Gire a página para a orientação original.');
  const { width, height } = page.getSize();
  const x = finite(action.x, 0, 1000, 'X') / 1000 * width;
  const y = finite(action.y, 0, 1000, 'Y') / 1000 * height;
  const w = finite(action.width, 1, 1000, 'Largura') / 1000 * width;
  const h = finite(action.height, 1, 1000, 'Altura') / 1000 * height;
  if (x + w > width + 1 || y + h > height + 1) throw new Error('A área ultrapassa a página.');
  return { x, y: height - y - h, width: w, height: h };
}

async function applyAction(bytes, action) {
  if (!(bytes instanceof Uint8Array) && !(typeof Buffer !== 'undefined' && Buffer.isBuffer(bytes))) throw new Error('PDF inválido.');
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
  const type = action?.type;
  if (type === 'rotate') {
    const page = assertPage(doc, action.page);
    const angle = finite(action.degrees, -270, 270, 'Rotação');
    if (angle % 90) throw new Error('A rotação deve ser múltipla de 90°.');
    page.setRotation(degrees((page.getRotation().angle + angle + 360) % 360));
  } else if (type === 'delete_page') {
    assertPage(doc, action.page);
    if (doc.getPageCount() === 1) throw new Error('Não é possível excluir a última página.');
    doc.removePage(action.page - 1);
  } else if (type === 'cover_rect') {
    const page = assertPage(doc, action.page);
    page.drawRectangle({ ...rectOnPage(page, action), color: rgb(1, 1, 1), borderWidth: 0 });
  } else if (type === 'add_text') {
    const page = assertPage(doc, action.page);
    if (page.getRotation().angle % 360 !== 0) throw new Error('Adicione texto apenas em páginas sem rotação.');
    const { width, height } = page.getSize();
    const x = finite(action.x, 0, 1000, 'X') / 1000 * width;
    const y = finite(action.y, 0, 1000, 'Y') / 1000 * height;
    const size = finite(action.size || 14, 6, 72, 'Tamanho');
    const value = String(action.text || '').slice(0, 500);
    if (!value.trim()) throw new Error('Texto vazio.');
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText(value, { x, y: height - y - size, font, size, color: rgb(0.08, 0.12, 0.2), maxWidth: width - x });
  } else if (type === 'enhance_signature') {
    const page = assertPage(doc, action.page);
    const rect = rectOnPage(page, action);
    if (typeof action.png !== 'string' || action.png.length > 8_000_000 || !action.png.startsWith('data:image/png;base64,'))
      throw new Error('Imagem da assinatura inválida.');
    const png = await doc.embedPng(action.png);
    page.drawImage(png, rect);
  } else throw new Error('Ação não suportada.');
  return new Uint8Array(await doc.save());
}

async function mergeDocuments(first, second) {
  const target = await PDFDocument.load(first);
  const source = await PDFDocument.load(second);
  const pages = await target.copyPages(source, source.getPageIndices());
  pages.forEach(page => target.addPage(page));
  return new Uint8Array(await target.save());
}

async function extractPage(bytes, pageNumber) {
  const source = await PDFDocument.load(bytes);
  assertPage(source, pageNumber);
  const target = await PDFDocument.create();
  const [page] = await target.copyPages(source, [pageNumber - 1]);
  target.addPage(page);
  return new Uint8Array(await target.save());
}
if (typeof module !== 'undefined' && module.exports) module.exports = { applyAction, mergeDocuments, extractPage };
else globalThis.firawPdfOps = { applyAction, mergeDocuments, extractPage };
