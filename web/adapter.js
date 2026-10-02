(() => {
  const maxPdf = 80 * 1024 * 1024;
  const progressListeners = new Set();

  async function pickPdf() {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = '.pdf,application/pdf'; input.hidden = true;
      document.body.append(input);
      let done = false;
      const finish = value => { if (done) return; done = true; input.remove(); resolve(value); };
      input.oncancel = () => finish(null);
      input.onchange = async () => {
        try {
          const file = input.files?.[0];
          if (!file) return finish(null);
          if (file.size > maxPdf) throw new Error('Escolha um PDF de até 80 MB.');
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new Error('O arquivo escolhido não é um PDF.');
          finish({ name: file.name, bytes });
        } catch (error) { finish(Promise.reject(error)); }
      };
      input.click();
    });
  }
  async function request(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { 'X-Firaw-Local': '1', ...(options.headers || {}) }, cache: 'no-store' });
    if (!response.ok) {
      const message = await response.json().then(data => data.error).catch(() => null);
      throw new Error(message || `Serviço local retornou HTTP ${response.status}.`);
    }
    return response;
  }
  async function json(path, data) {
    const options = data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
    return (await request(path, options)).json();
  }
  function save(bytes, name) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = name || 'Firaw-editado.pdf';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return Promise.resolve(`Downloads/${link.download}`);
  }
  async function installAi(name) {
    const response = await request('/api/ai/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    if (response.headers.get('content-type')?.includes('application/json')) return (await response.json()).installed;
    const reader = response.body.getReader();
    const decoder = new TextDecoder(); let pending = '';
    const update = line => {
      if (!line.trim()) return;
      const value = JSON.parse(line);
      if (value.error) throw new Error(value.error);
      const progress = { status: value.status, percent: value.total ? Math.round(value.completed / value.total * 100) : null };
      for (const listener of progressListeners) listener(progress);
    };
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split('\n'); pending = lines.pop();
      for (const line of lines) update(line);
    }
    update(pending);
    return name;
  }
  async function stirlingOpen() {
    const result = await json('/api/stirling/open', {});
    if (result.url) window.open(result.url, '_blank', 'noopener,noreferrer');
    return result.mode;
  }
  function openExternal(url) { window.open(url, '_blank', 'noopener,noreferrer'); }

  window.firawPdf = {
    open: pickPdf, additional: pickPdf, save,
    action: (bytes, action) => window.firawPdfOps.applyAction(bytes, action),
    merge: (first, second) => window.firawPdfOps.mergeDocuments(first, second),
    extract: (bytes, page) => window.firawPdfOps.extractPage(bytes, page),
    scanAi: () => json('/api/ai/scan'), installAi,
    plan: value => json('/api/ai/plan', value),
    onAiProgress: callback => { progressListeners.add(callback); return () => progressListeners.delete(callback); },
    stirlingStatus: () => json('/api/stirling/status'), stirlingOpen,
    stirlingDownload: () => openExternal('https://www.stirling.com/download'),
    stirlingCompress: async bytes => new Uint8Array(await (await request('/api/stirling/compress',
      { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: bytes })).arrayBuffer()),
    ollamaDownload: () => openExternal('https://ollama.com/download/windows')
  };
})();
