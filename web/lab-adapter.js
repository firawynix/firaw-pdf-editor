(() => {
  const maxPdf = 80 * 1024 * 1024;

  async function pickPdf() {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf,application/pdf';
      input.hidden = true;
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

  function save(bytes, name) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name || 'Firaw-editado.pdf';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return Promise.resolve(`Downloads/${link.download}`);
  }

  const windowsOnly = () => { throw new Error('Este recurso usa serviços locais do aplicativo Windows. Abra a edição da Microsoft Store.'); };
  window.firawPdf = {
    open: pickPdf,
    additional: pickPdf,
    save,
    action: (bytes, action) => window.firawPdfOps.applyAction(bytes, action),
    merge: (first, second) => window.firawPdfOps.mergeDocuments(first, second),
    extract: (bytes, page) => window.firawPdfOps.extractPage(bytes, page),
    scanAi: async () => ({
      hardware: { cpu: 'Navegador', threads: navigator.hardwareConcurrency || 0, ramGb: '—', gpu: 'Não consultada', vramReliable: false },
      recommended: { name: 'app Windows', mode: 'local', note: 'Instale pela Microsoft Store para detectar o hardware e usar o Ollama.' },
      ollamaInstalled: false,
      installed: []
    }),
    installAi: windowsOnly,
    plan: windowsOnly,
    onAiProgress: () => () => {},
    stirlingStatus: async () => ({ desktop: false, server: false }),
    stirlingOpen: windowsOnly,
    stirlingDownload: () => window.open('https://www.stirling.com/download', '_blank', 'noopener,noreferrer'),
    stirlingCompress: windowsOnly,
    ollamaDownload: () => window.open('https://apps.microsoft.com/detail/9PJ592K53V5M', '_blank', 'noopener,noreferrer')
  };
})();
