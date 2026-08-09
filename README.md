# Gestão à Vista — Base Oeste

Pacote preparado para GitHub Pages.

Arquivos principais na raiz:
- index.html
- style.css
- app.js
- config.js
- dados-fallback.json

## Publicação
No GitHub: Settings > Pages > Source: GitHub Actions.
O workflow em `.github/workflows/static.yml` publica o conteúdo da raiz.

## Imagem lateral
O `config.js` procura `imagens/sidebar.png`. Se você já possui essa imagem no repositório, mantenha-a nesse caminho. Se ela não existir, o painel continua funcionando, apenas sem a arte fotográfica lateral.

## Dados
O painel tenta carregar o Google Sheets. Se a planilha estiver indisponível, usa `dados-fallback.json`.


## Alerta de quilometragem das viaturas
Na aba `Viaturas`, use uma coluna chamada `KM Restante` (também são aceitos nomes equivalentes como `Quilometragem restante` ou `KM para revisão`).

Cores do nome da viatura na Tela 3:
- acima de 1000 km: branco
- de 501 a 1000 km: verde
- de 1 a 500 km: laranja
- 0 km ou valor negativo: vermelho

Se a coluna estiver vazia ou não existir, o nome permanece branco.
