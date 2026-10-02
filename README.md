# Firaw - Pdf Editor

Aplicativo Windows local com identidade Firawynix para abrir, revisar e salvar PDFs. Os arquivos são lidos no computador. O editor combina operações próprias, IA local pelo Ollama e acesso separado ao aplicativo oficial Stirling PDF.

## O que funciona nesta versão

- Abrir, visualizar e salvar uma cópia do PDF; navegar, girar e excluir páginas.
- Selecionar uma área para cobertura visual ou ajuste de contraste de uma assinatura já presente.
- Adicionar texto simples, juntar outro PDF e extrair a página atual.
- Pedir mudanças em linguagem natural. O modelo instalado no Ollama recebe texto extraído e, quando visual, uma imagem da página atual. O aplicativo valida a proposta, mostra as ações e só as aplica após o clique da pessoa.
- Detectar CPU, RAM, GPU e, quando o Windows fornece o dado, VRAM. Ver modelos locais e recomendar um modelo visual. O download de um modelo novo começa apenas ao clicar em **Instalar recomendado**.
- Detectar e abrir o Stirling PDF oficial instalado. Quando existe um servidor Stirling local na porta 8080, a compressão usa sua API em `127.0.0.1`.

**Limites:** a cobertura é visual; o texto ou imagem sob ela pode permanecer no PDF. A melhora de assinatura ajusta contraste na área selecionada, sem verificar autoria nem criar assinatura nova. Ajustes por coordenada exigem uma página sem rotação. Textos adicionados usam a fonte padrão do PDF. PDFs com senha não são editados. O aplicativo não usa servidor remoto para PDFs ou IA.

## Página e editor no navegador local

Execute `npm run web:open` nesta pasta para iniciar e abrir a página, ou `npm run web` e acesse `http://127.0.0.1:4173/`. A página Firaw tem a barra inferior fixa e leva ao editor em `http://127.0.0.1:4173/editor`. O serviço escuta apenas no próprio computador. O PDF é aberto e editado no navegador; IA e compressão opcionais conversam com Ollama e Stirling PDF locais. Nenhum documento é enviado a um servidor Firawynix.

## Lab público

A versão de demonstração está em [lab.firawynix.com.br/firawpdf/](https://lab.firawynix.com.br/firawpdf/). Ela abre, edita e baixa PDFs no navegador, sem upload do documento ao lab. A IA local e a integração com Stirling PDF estão disponíveis no aplicativo Windows da Microsoft Store.

Para gerar a versão estática, execute `npm ci` e `npm run build:lab`. A saída fica em `lab-dist/`; publique essa pasta sob `/firawpdf/` seguindo o procedimento interno do lab. Todos os recursos usam caminhos relativos para funcionar nessa rota.

## Usar e desenvolver

1. [Instale a edição da Microsoft Store](https://apps.microsoft.com/detail/9PJ592K53V5M) ou, para executar o código-fonte no Windows, use `npm ci` e `npm start` nesta pasta.
2. Abra um PDF, selecione uma área arrastando sobre a página e use as ferramentas ou escreva um pedido no painel de IA.
3. Revise a proposta antes de aplicar. Use **Salvar como…** para gravar um novo arquivo. `Ctrl+Z` desfaz até cinco edições da sessão.

`npm test` valida as operações centrais. `npm run smoke` abre um PDF de teste e captura a janela em `%TEMP%/firaw-pdf-smoke.png`. `npm run dist` gera o executável portátil x64. Os executáveis, pacotes da Store e dependências instaladas são gerados localmente e não fazem parte do repositório.

## Microsoft Store

O produto está [disponível na Microsoft Store](https://apps.microsoft.com/detail/9PJ592K53V5M), sob o ID `9PJ592K53V5M`. A publicação foi confirmada em 1º de outubro de 2026. Os pacotes validados são `release/store/Firaw-Pdf-Editor-1.0.0-x64.appx` e `release/store/Firaw-Pdf-Editor-1.0.0-ia32.appx`. `npm run dist:store` recria esses pacotes com a identidade reservada no Partner Center. A política de privacidade publicada está em `store/PRIVACIDADE.txt`.

O [Stirling PDF](https://www.stirling.com/download) é distribuído separadamente por seus autores. Esta aplicação não incorpora nem renomeia seu código. A API local documentada pelo projeto pode variar entre versões; o app verifica se ela está disponível antes de habilitar a compressão. O [PDFCraft](https://github.com/PDFCraftTool/pdfcraft) não foi incorporado nesta etapa.
