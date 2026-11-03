# Apostilas de estudo

Aplicativo web estático (HTML, CSS e JavaScript, sem dependências) com as apostilas de Direito Civil, Penal, Processual Penal, Tributário, Administrativo, Ambiental, Empresarial e Previdenciário, de Língua Portuguesa e de Conhecimentos Gerais (SEFAZ/SC).

## Publicar no GitHub Pages

1. Crie um repositório no GitHub (por exemplo, `apostilas`).
2. Envie para a raiz do repositório todo o conteúdo desta pasta: `index.html`, `app.js`, `app.css`, `.nojekyll`, `README.md` e a pasta `data/`. A pasta tem cerca de 95 MB e muitos arquivos. Por isso, prefira o GitHub Desktop ou a linha de comando (`git add . && git commit -m "apostilas" && git push`) ao envio pelo navegador.
3. No repositório, abra Settings › Pages. Em "Build and deployment", escolha "Deploy from a branch", branch `main`, pasta `/ (root)`, e salve.
4. Em um ou dois minutos, o site fica disponível em `https://SEU-USUARIO.github.io/apostilas/`.

Atenção: no plano gratuito, o GitHub Pages exige repositório público, e o conteúdo das apostilas fica acessível a quem tiver o endereço. Com GitHub Pro, Team ou Enterprise, é possível publicar a partir de repositório privado. Mesmo assim, o site publicado continua público, salvo em organizações Enterprise com controle de acesso.

## Usar

- Navegação: índice lateral por apostila, capítulos e seções; setas ← e → trocam de capítulo; remissões "Cap. N" viram links; o progresso (capítulos lidos e último capítulo aberto) fica salvo.
- Busca: digite na caixa do topo e tecle Enter. Aparecem os títulos e as seções; o botão "Buscar no texto" percorre o texto completo de uma apostila ou de todas.
- Edição: ative o modo ✎ (ou tecle E). Passe o mouse sobre um trecho para Editar, Inserir abaixo, Ocultar ou Restaurar o original. O texto usa a marcação das apostilas: um parágrafo por linha, `- ` para lista, `## ` para título, `:::DICA título` … `:::` para caixa e `*itálico*`.
- Comentários: selecione um trecho e clique em "Comentar trecho" ou "Destacar", ou use 💬 ao lado do parágrafo. O painel 💬 (ou a tecla C) lista os comentários do capítulo, da apostila ou de todas, com as opções Ir, Editar, Resolver e Excluir.
- "Baixar .md", no fim de cada capítulo, gera o capítulo já com as suas edições.

## Onde ficam as edições e os comentários

O site publicado é somente leitura. As suas edições, os comentários, os destaques e o progresso ficam guardados no próprio navegador (IndexedDB). Em ⚙ › Anotações você pode:

- Exportar arquivo / Importar arquivo: leva as anotações para outro aparelho. A importação mescla os dados e, em cada item, prevalece a versão mais recente.
- Sincronizar com o GitHub (opcional): grava as anotações num arquivo JSON do próprio repositório (padrão `anotacoes/anotacoes.json`), pela API do GitHub. Para isso, crie um token "fine-grained" em GitHub › Settings › Developer settings › Personal access tokens, restrito a este repositório, com permissão "Contents: Read and write". Cole o token em ⚙. Ele fica só no navegador e nunca entra no arquivo exportado. Com a opção automática ligada, o site traz as anotações ao abrir e envia 15 segundos depois de cada alteração. Se o repositório for público, o arquivo de anotações também será público.

As edições não alteram os arquivos `data/*.md` do repositório; elas aparecem por cima do texto original. Para incorporar uma edição de forma definitiva, use "Baixar .md" e substitua o arquivo do capítulo em `data/<apostila>/`.

## Estrutura

- `data/catalog.json`: lista das apostilas, dos capítulos e das seções.
- `data/<apostila>/front.md`: apresentação; `chNN.md`: capítulos; `rev.md`: revisão de véspera, quando existe; `img/`: figuras.
