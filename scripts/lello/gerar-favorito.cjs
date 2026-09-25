const fs = require('node:fs');
const path = require('node:path');
const target = process.argv[2] || 'safira';
const configs = {
  safira: { code: '63004', name: 'Safira', slug: 'safira' },
  topazio: { code: '8759', name: 'VN Casa Topázio', slug: 'vn-casa-topazio' },
  conext: { code: '62905', name: 'CO NEXT LIBERDADE', slug: 'co-next-liberdade' },
};
if (!configs[target]) throw new Error('Use safira, topazio ou conext.');
const { code, name, slug } = configs[target];
const label = `${code} - ${name.toUpperCase()}`;
let source = fs.readFileSync(path.join(__dirname, 'coletar-contatos.js'), 'utf8');
source = source.replaceAll('63004', code).replaceAll('SAFIRA', name.toUpperCase()).replaceAll('Safira', name).replaceAll('safira-contatos', `${slug}-contatos`);
const bookmark = 'javascript:' + encodeURIComponent(source);
const dir = path.resolve(__dirname, '../../output/lello');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `coletar-${target}.html`), `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Coletar contatos do ${name}</title>
<style>body{font:18px/1.6 system-ui;max-width:760px;margin:60px auto;padding:24px;color:#123}a{display:inline-block;padding:14px 24px;background:#087a94;color:white;border-radius:8px}li{margin:16px 0}</style>
<h1>Coletar contatos do ${name}</h1><p>Ferramenta de uso único para o condomínio ${code}. Consulta os cadastros na sua sessão da Lello e gera um CSV local. Não altera o portal, não envia mensagens e não conecta ao GKLI.</p>
<ol><li>Mostre a barra de favoritos do Edge com <b>Ctrl+Shift+B</b>.</li>
<li>Arraste este botão para a barra de favoritos:<br><a href="${bookmark}">Coletar ${name}</a></li>
<li>Volte ao portal da Lello já conectado, selecione <b>${label} → Cadastro de Unidades</b>.</li>
<li>Clique no favorito <b>Coletar ${name}</b> e depois em <b>Iniciar / continuar</b>.</li>
<li>Mantenha a aba aberta e o condomínio selecionado. Ao terminar, clique em <b>Baixar CSV</b>.</li></ol>
<p>Os dados ficam na memória da aba até o download. É possível pausar e baixar um arquivo parcial. Recarregar a página perde o progresso. Se a sessão expirar, baixe o parcial antes de entrar novamente.</p>
<p>O telefone e o celular de “Aos cuidados de” têm colunas próprias. Os códigos de unidade permanecem iguais aos da Lello; não há conversão automática para o cadastro do GKLI.</p></html>`);
console.log(path.join(dir, `coletar-${target}.html`));
