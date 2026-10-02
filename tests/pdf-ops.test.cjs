const test = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');
const { applyAction, mergeDocuments, extractPage } = require('../src/pdf-ops.cjs');
const { cleanPlan } = require('../src/ai-plan.cjs');

test('edita uma cópia do PDF e preserva a entrada', async () => {
  const pdf = await PDFDocument.create(); pdf.addPage([300, 400]);
  const original = new Uint8Array(await pdf.save());
  const changed = await applyAction(original, { type: 'cover_rect', page: 1, x: 100, y: 100, width: 300, height: 40 });
  assert.notDeepEqual(changed, original);
  assert.equal((await PDFDocument.load(original)).getPageCount(), 1);
  assert.equal((await PDFDocument.load(changed)).getPageCount(), 1);
});
test('junta documentos e extrai a página indicada', async () => {
  const first = await PDFDocument.create(); first.addPage([300, 400]);
  const second = await PDFDocument.create(); second.addPage([200, 200]);
  const merged = await mergeDocuments(new Uint8Array(await first.save()), new Uint8Array(await second.save()));
  assert.equal((await PDFDocument.load(merged)).getPageCount(), 2);
  const extracted = await extractPage(merged, 2);
  assert.deepEqual((await PDFDocument.load(extracted)).getPage(0).getSize(), { width: 200, height: 200 });
});
test('rejeita coordenadas e ações inválidas da IA', () => {
  assert.throws(() => cleanPlan({ actions: [{ type: 'shell', page: 1 }] }, 1));
  assert.throws(() => cleanPlan({ actions: [{ type: 'cover_rect', page: 1, x: 900, y: 0, width: 200, height: 50 }] }, 1));
  assert.deepEqual(cleanPlan({ summary: 'ok', actions: [{ type: 'rotate', page: 1, degrees: 90 }] }, 1).actions,
    [{ type: 'rotate', page: 1, degrees: 90 }]);
});
test('impede posicionar ajustes na orientação errada após girar a página', async () => {
  const doc = await PDFDocument.create(); doc.addPage([300, 400]);
  const rotated = await applyAction(new Uint8Array(await doc.save()), { type: 'rotate', page: 1, degrees: 90 });
  await assert.rejects(() => applyAction(rotated, { type: 'cover_rect', page: 1, x: 100, y: 100, width: 100, height: 30 }), /sem rotação/);
});
