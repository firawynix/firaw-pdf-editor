const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'lab-dist');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, contents) => {
  const target = path.join(output, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
};
const copy = (from, to = from) => {
  const target = path.join(output, to);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, from), target);
};
const replaceAll = (value, pairs) => pairs.reduce((text, [a, b]) => text.replaceAll(a, b), value);

fs.rmSync(output, { recursive: true, force: true });

let landing = source('web/index.html');
landing = replaceAll(landing, [
  ['Edite PDFs no seu computador com Firaw - Pdf Editor, IA local opcional e integração com Stirling PDF.',
    'Edite PDFs diretamente no navegador com Firaw - Pdf Editor. O documento não é enviado ao lab.'],
  ['href="/assets/', 'href="./assets/'], ['src="/assets/', 'src="./assets/'],
  ['href="/web/', 'href="./web/'], ['href="/editor"', 'href="./editor.html"'],
  ['Sua mesa de trabalho local', 'Sua mesa de trabalho no navegador'],
  ['Abrir editor local', 'Abrir editor no navegador'],
  ['Funciona em 127.0.0.1', 'PDF editado no navegador'],
  ['Esta página roda apenas em <code>127.0.0.1</code>. O arquivo é aberto e editado no navegador. Os pedidos à IA são enviados ao Ollama no mesmo computador; a compressão opcional usa o Stirling PDF local.',
    'Esta página pública usa o lab Firawynix apenas para entregar os arquivos do editor. O PDF é aberto e editado no seu navegador; o documento não é enviado ao lab. A IA com Ollama e a integração com Stirling PDF ficam disponíveis no aplicativo Windows.'],
  ['As operações de edição acontecem no navegador deste computador. Ferramentas adicionais usam somente os serviços locais que você escolher instalar.',
    'As operações de edição do PDF acontecem no seu navegador. Para IA local e Stirling PDF, instale o aplicativo Windows pela Microsoft Store.'],
  ['A IA local ajuda a transformar pedidos em propostas que você revisa antes de aplicar.',
    'No aplicativo Windows, a IA local transforma pedidos em propostas que você revisa antes de aplicar.'],
  ['A IA local propõe ações para a página. Você vê a proposta e decide se quer aplicá-la.',
    'No aplicativo Windows, a IA local propõe ações para a página. Você decide se quer aplicá-las.'],
  ['O editor lê CPU, memória e GPU, detecta modelos no Ollama e recomenda uma opção compatível.',
    'O aplicativo Windows lê CPU, memória e GPU, detecta modelos no Ollama e recomenda uma opção compatível.'],
  ['Se o Stirling PDF estiver rodando no computador, use sua API local para comprimir o arquivo.',
    'No aplicativo Windows, use a API local do Stirling PDF para comprimir o arquivo.'],
  ['Use ferramentas diretas ou a IA local opcional.', 'Use ferramentas diretas no navegador ou a IA local no aplicativo Windows.'],
  ['Selecione uma área do documento, descreva o que quer mudar e confira a lista de ações. O resultado só muda depois da sua confirmação.',
    'Selecione uma área e ajuste o PDF no navegador. No aplicativo Windows, você também pode descrever uma mudança e revisar a proposta da IA antes de aplicá-la.'],
  ['<span>127.0.0.1</span>', '<span>NO NAVEGADOR</span>'],
  ['<small>SEM SERVIDOR EXTERNO</small>', '<small>PDF SEM UPLOAD</small>'],
  ['Feito por Firawynix · edição local', 'Feito por Firawynix · edição no navegador']
]);
write('index.html', landing);

let editor = source('web/editor.html');
editor = replaceAll(editor, [
  ['href="/assets/', 'href="./assets/'], ['src="/assets/', 'src="./assets/'],
  ['href="/src/', 'href="./src/'], ['src="/src/', 'src="./src/'],
  ['src="./src/pdf-ops.cjs"', 'src="./src/pdf-ops.js"'],
  ['href="/web/', 'href="./web/'], ['src="/web/', 'src="./web/'],
  ['src="../assets/', 'src="./assets/'],
  ['href="/"', 'href="./"'],
  ['src="/node_modules/pdf-lib/dist/pdf-lib.min.js"', 'src="./vendor/pdf-lib.min.js"'],
  ['src="./web/adapter.js"', 'src="./web/lab-adapter.js"'],
  ['EDIÇÃO LOCAL', 'EDIÇÃO NO NAVEGADOR'],
  ['Firaw - Pdf Editor | Editor local', 'Firaw - Pdf Editor | Editor no navegador'],
  ['Os arquivos ficam neste computador.', 'O PDF é editado no navegador, sem upload ao lab.'],
  ['Abra um documento para revisar páginas, ajustar áreas, melhorar assinaturas e trabalhar com IA no próprio computador.',
    'Abra um documento para revisar páginas e ajustar áreas no navegador. Para usar IA local, instale o aplicativo Windows.'],
  ['127.0.0.1 · local', 'lab · navegador'],
  ['<div class="divider"></div><div class="section-kicker">04 / STIRLING PDF LOCAL</div>', '']
]);
editor = editor.replace('<body>', '<body class="lab-public">');
editor = editor.replace('<link rel="stylesheet" href="./web/editor.css">',
  '<link rel="stylesheet" href="./web/editor.css"><link rel="stylesheet" href="./web/lab.css">');
editor = editor.replace('<div class="section-kicker">03 / ASSISTENTE</div>',
  '<div class="section-kicker">03 / APP WINDOWS</div>');
editor = editor.replace('<h2>Peça com suas palavras.</h2>', '<h2>Mais recursos no Windows.</h2><div class="lab-disclosure"><strong>PDF editado no seu navegador</strong>IA local e Stirling PDF funcionam no aplicativo Windows. Instale gratuitamente pela Microsoft Store para usar esses recursos.<br><a href="https://apps.microsoft.com/detail/9PJ592K53V5M" target="_blank" rel="noopener noreferrer">Baixar na Microsoft Store ↗</a></div>');
write('editor.html', editor);

let renderer = source('src/renderer.mjs');
renderer = renderer.replaceAll('../node_modules/pdfjs-dist/build/pdf.mjs', '../vendor/pdf.mjs')
  .replaceAll('../node_modules/pdfjs-dist/build/pdf.worker.mjs', '../vendor/pdf.worker.mjs');
write('src/renderer.mjs', renderer);
for (const file of ['src/styles.css', 'web/styles.css', 'web/editor.css',
  'web/editor-tabs.js', 'web/lab-adapter.js', 'web/lab.css', 'assets/logo.svg', 'assets/preview.png']) copy(file);
copy('src/pdf-ops.cjs', 'src/pdf-ops.js');
copy('node_modules/pdf-lib/dist/pdf-lib.min.js', 'vendor/pdf-lib.min.js');
copy('node_modules/pdfjs-dist/build/pdf.mjs', 'vendor/pdf.mjs');
copy('node_modules/pdfjs-dist/build/pdf.worker.mjs', 'vendor/pdf.worker.mjs');

console.log(`Lab estático pronto: ${output}`);
