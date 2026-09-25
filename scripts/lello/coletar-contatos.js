/* Coleta pontual e somente leitura. Executar como favorito no portal autenticado. */
(function () {
  'use strict';
  const HOST = 'https://portal.lellocondominios.com.br';
  const PATH = '/relatorios/CadastroUnidades.do';
  const CONDO = '63004';
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  function parseDetails(doc, expected) {
    const tables = [...doc.querySelectorAll('table')];
    const read = table => {
      const fields = {};
      for (const th of table?.querySelectorAll('th') || []) {
        if (th.nextElementSibling?.tagName === 'TD') fields[clean(th.textContent)] = clean(th.nextElementSibling.textContent);
      }
      return fields;
    };
    const main = tables.map(read).find(f => f.Unidade === expected);
    if (!main || !Object.hasOwn(main, 'Email') || !Object.hasOwn(main, 'Nome')) {
      throw new Error('Ficha inesperada ou sessão encerrada. Coleta interrompida; confira o portal.');
    }
    const care = tables.filter(t => /Aos cuidados de/i.test(t.closest('.panel')?.querySelector('.panel-heading')?.textContent || '')).map(read)[0] || {};
    return { condominio_codigo: CONDO, unidade_codigo: expected, nome: main.Nome,
      email: main.Email, telefone: main.Telefone || '', cuidados_nome: care.Nome || '',
      cuidados_telefone: care.Telefone || '', cuidados_celular: care.Celular || '',
      coletado_em: new Date().toISOString() };
  }
  const columns = ['condominio_codigo', 'unidade_codigo', 'nome', 'email', 'telefone', 'cuidados_nome', 'cuidados_telefone', 'cuidados_celular', 'coletado_em'];
  function csv(rows) {
    const cell = value => '"' + String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""') + '"';
    return '\uFEFF' + [columns.join(';'), ...rows.map(r => columns.map(k => cell(r[k])).join(';'))].join('\r\n');
  }
  // Interface de testes offline; não executa navegação nem consulta o portal.
  if (typeof module !== 'undefined' && module.exports) { module.exports = { parseDetails, csv }; return; }
  if (location.origin !== HOST) { alert('Abra o portal da Lello, selecione 63004 - SAFIRA e clique neste favorito.'); return; }
  if (document.getElementById('gkli-lello-coleta')) { document.getElementById('gkli-lello-coleta').scrollIntoView(); return; }
  const docs = [document];
  function frames(doc) {
    for (const frame of doc.querySelectorAll('iframe')) {
      try { if (frame.contentDocument && !docs.includes(frame.contentDocument)) { docs.push(frame.contentDocument); frames(frame.contentDocument); } } catch {}
    }
  }
  frames(document);
  const links = new Map();
  for (const doc of docs) for (const a of doc.querySelectorAll('a[name="CadastroUnidadesForm"]')) {
    const url = new URL(a.href, HOST);
    if (url.origin !== HOST || url.pathname !== PATH || url.searchParams.get('codCondo') !== CONDO) continue;
    const unit = url.searchParams.get('codUnidade');
    if (/^[a-z0-9]+$/i.test(unit || '')) links.set(unit, url.href);
  }
  if (!links.size) { alert('Abra Cadastro de Unidades do 63004 - SAFIRA antes de iniciar.'); return; }
  const queue = [...links];
  const rows = [];
  let running = false, stopped = false, offset = 0;
  const box = document.createElement('section');
  box.id = 'gkli-lello-coleta';
  box.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;background:white;color:#123;padding:22px;border:2px solid #087a94;border-radius:12px;width:360px;box-shadow:0 4px 24px #555;font:15px Arial';
  const title = document.createElement('h3'); title.textContent = 'Contatos do Safira'; box.append(title);
  const info = document.createElement('p'); info.textContent = queue.length + ' unidades. Consulta somente leitura; nenhum cadastro será alterado.'; box.append(info);
  const status = document.createElement('p'); status.textContent = 'Pronto para coletar. Mantenha esta aba aberta.'; box.append(status);
  function button(label, action) { const b = document.createElement('button'); b.textContent = label; b.style.cssText = 'margin:4px;padding:9px;cursor:pointer'; b.onclick = action; box.append(b); return b; }
  const start = button('Iniciar / continuar', async () => {
    if (running) return;
    running = true; stopped = false; start.disabled = true;
    try {
      while (offset < queue.length && !stopped) {
        const [unit, url] = queue[offset];
        status.textContent = 'Consultando ' + unit + ' — ' + offset + '/' + queue.length;
        const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error('Portal respondeu HTTP ' + response.status + '. Tente continuar mais tarde.');
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        rows.push(parseDetails(doc, unit)); offset++;
        status.textContent = offset + '/' + queue.length + ' coletadas. Já é possível baixar o CSV parcial.';
        if (offset < queue.length && !stopped) await new Promise(resolve => setTimeout(resolve, 1000));
      }
      status.textContent = offset === queue.length ? 'Concluído: ' + rows.length + ' unidades. Clique em Baixar CSV.' : 'Pausado: ' + offset + '/' + queue.length + '. Pode baixar o parcial ou continuar.';
    } catch (error) { status.textContent = error.message + ' Preservadas ' + rows.length + ' unidades; baixe o CSV parcial antes de recarregar.'; }
    finally { running = false; start.disabled = false; }
  });
  button('Pausar', () => { stopped = true; });
  button('Baixar CSV', () => {
    if (!rows.length) { status.textContent = 'Ainda não há contatos coletados.'; return; }
    const url = URL.createObjectURL(new Blob([csv(rows)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'safira-contatos-lello-' + rows.length + '-' + new Date().toISOString().slice(0,10) + '.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });
  document.body.append(box);
})();
