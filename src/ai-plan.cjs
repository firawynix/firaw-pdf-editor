const ALLOWED = new Set(['cover_rect', 'add_text', 'rotate', 'delete_page', 'enhance_signature']);
function cleanPlan(raw, pageCount) {
  const parsed = typeof raw === 'string' ? JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) : raw;
  if (!parsed || !Array.isArray(parsed.actions)) throw new Error('A IA não devolveu uma lista de ações válida.');
  if (parsed.actions.length > 8) throw new Error('A IA propôs ações demais.');
  const actions = parsed.actions.map(item => {
    if (!ALLOWED.has(item.type)) throw new Error(`Ação não suportada: ${item.type}`);
    const page = Number(item.page);
    if (!Number.isInteger(page) || page < 1 || page > pageCount) throw new Error('A IA indicou uma página inválida.');
    const action = { type: item.type, page };
    if (['cover_rect', 'enhance_signature'].includes(item.type)) {
      for (const key of ['x', 'y', 'width', 'height']) {
        action[key] = Number(item[key]);
        if (!Number.isFinite(action[key]) || action[key] < (key === 'width' || key === 'height' ? 1 : 0) || action[key] > 1000)
          throw new Error('A IA indicou coordenadas inválidas.');
      }
      if (action.x + action.width > 1000 || action.y + action.height > 1000) throw new Error('A área proposta sai da página.');
    }
    if (item.type === 'add_text') {
      action.x = Number(item.x); action.y = Number(item.y); action.size = Number(item.size || 14);
      action.text = String(item.text || '').slice(0, 500);
      if (![action.x, action.y].every(value => Number.isFinite(value) && value >= 0 && value <= 1000) ||
        !Number.isFinite(action.size) || action.size < 6 || action.size > 72 || !action.text.trim())
        throw new Error('Texto proposto inválido.');
    }
    if (item.type === 'rotate') {
      action.degrees = Number(item.degrees);
      if (![90, 180, 270, -90, -180, -270].includes(action.degrees)) throw new Error('Rotação proposta inválida.');
    }
    return action;
  });
  return { summary: String(parsed.summary || '').slice(0, 600), actions };
}
module.exports = { cleanPlan };
