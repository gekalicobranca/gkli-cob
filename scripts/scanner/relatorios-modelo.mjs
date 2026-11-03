export const COPIA_RELATORIO='edi.neves@gekali.com.br'
export const REMETENTE_RELATORIO='cobranca@gekali.com.br'
const dinheiro=v=>v==null?'não informado':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)/100)
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const data=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'não informada'
export const dataHora=v=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(v))

export function ocorrenciasAcordosGraiche(evidencias,acordos,{incluirJudiciais=false}={}){
 const achados=[]
 for(const e of evidencias){
  const c=e.dados?.conferencia_acordos
  if(c?.versao!==1||!['unidade_nao_disponivel','unidade_disponivel','identidade_ambigua'].includes(c.situacao))continue
  if(String(c.fonte??'').split('?')[0]!=='https://servc9-1.webware.com.br/bin/rt/gAcordo.asp')continue
  for(const a of acordos.filter(a=>a.unidade_id===e.unidade_portal&&(a.tipo==='extrajudicial'||incluirJudiciais&&a.tipo==='judicial')&&['ativo','em_dia','em_atraso','vencido'].includes(a.status))){
   const ausente=c.situacao==='unidade_nao_disponivel'
   const judicial=a.tipo==='judicial'
   achados.push({acordo_id:a.id,unidade_id:a.unidade_id,evidencia_id:e.id,
    ...(judicial?{tipo_revisao:'judicial',baixa_permitida:false,revisao_humana_obrigatoria:true}:{}),
    categoria:judicial?'Conferência de acordo judicial — revisão obrigatória':ausente?'Acordo não localizado na consulta disponível':'Correspondência de acordo para revisão',
    motivo:ausente?'A unidade do acordo vigente no app não está disponível no filtro de acordos deste acesso.':'A consulta não estabelece correspondência inequívoca entre o acordo do app e um contrato do portal.',
    app:judicial?'Acordo judicial vigente no app; revisão humana obrigatória e baixa automática bloqueada.':'Acordo extrajudicial vigente no app.',
    portal:ausente?'Unidade ausente no seletor consultado. O filtro não comprova inexistência do acordo, quitação ou pagamento.':'Unidade disponível ou identidade ambígua no filtro; número do contrato e cronograma ainda precisam de conferência.',
    acao:judicial?'Encaminhar ao responsável pela revisão judicial; conferir identidade do acordo, documentos e cronograma. O scanner não autoriza baixa automática deste caso.':'Conferir emissão, registro do contrato, número externo e cronograma com a administradora. Exigir recibo, valor e data efetiva antes de qualquer baixa.'})
  }
 }
 return achados
}

export function ocorrenciasFinanceiras(auditorias){
 const achados=[]
 for(const a of auditorias)for(const i of a.itens??[]){
  if(i.acordo_id&&i.resultado==='inconclusivo'&&i.motivo==='Acordo sem vínculo externo homologado.'&&a.documentos_disponiveis){
   achados.push({acordo_id:i.acordo_id,unidade_id:a.unidade_id,categoria:'Correspondência de acordo para revisão',motivo:'O acordo do app ainda não tem correspondência confirmada com os documentos da administradora.',
    app:'Acordo registrado no app; identificação externa ainda não confirmada.',portal:'Histórico consultado com documentos disponíveis. Isso não comprova que o acordo do app esteja ausente no portal.',
    acao:'Localizar o documento correspondente e conferir unidade, número do acordo e cronograma antes de vincular ou baixar.',evidencia_id:a.evidencia_id,item_id:i.id})
   continue
  }
  // Falta de extrato/recibo e ausência de vínculo não são divergências comprovadas.
  if(!['divergente','ambiguo','revisao'].includes(i.resultado)||!i.fonte||typeof i.fonte!=='object')continue
  achados.push({acordo_id:i.acordo_id??null,cobranca_id:i.tipo==='cobranca'?i.id:null,unidade_id:a.unidade_id,
   categoria:i.resultado==='divergente'?'Divergência financeira documentada':'Vínculo financeiro para revisão',
   motivo:String(i.motivo??'Conferência necessária.'),
   app:`Vencimento ${data(i.app?.vencimento)}; valor original ${dinheiro(i.app?.valor)}; pagamento ${data(i.app?.data_pagamento)}`,
   portal:`Vencimento ${data(i.fonte.vencimento)}; valor original ${dinheiro(i.fonte.valor)}; valor pago ${dinheiro(i.fonte.pago)}; pagamento ${data(i.fonte.data)}; recibo ${i.fonte.recibo??'não informado'}`,
   acao:'Conferir identificação, valores e datas com o documento da administradora antes de qualquer correção.',
   evidencia_id:a.evidencia_id,item_id:i.id})
 }
 return achados
}

export function montarRelatorio({condominio,portal,consultadoEm,responsavel,itens,resumo={}}){
 const quando=dataHora(consultadoEm),titulo=`Scanner | ${itens.length} ocorrências para revisão | ${condominio}`.slice(0,170)
 const linhas=[`RELATÓRIO DE CONFERÊNCIA — ${condominio}`,`Administradora/portal: ${portal}`,`Consulta: ${quando} (Brasília)`,`Responsável: ${responsavel}`,
  `Remetente: ${REMETENTE_RELATORIO}`,`Cópia: ${COPIA_RELATORIO}`,'',
  `Unidades abrangidas pela conferência: ${resumo.unidades??'conferência dirigida'}. Ocorrências para revisão: ${itens.length}.`,
  `Consultas financeiras sem acesso/adiadas: ${resumo.sem_acesso??0}. Históricos parciais: ${resumo.parciais??0}. Conciliações ainda pendentes: ${resumo.conciliacoes_pendentes??0}. Cadastros restritos, sem atualização: ${resumo.cadastros_restritos??0}.`,
  resumo.origem??(resumo.coleta_falhou?'A coleta foi interrompida; este relatório contém apenas as evidências preservadas.':'Conferência limitada às evidências disponíveis.'),
  'Falhas de acesso e ausência de recibos limitam a conferência; não comprovam divergência nem pagamento.','']
 for(const [n,i]of itens.entries())linhas.push(`${n+1}. Unidade ${i.unidade??'não identificada'}${i.bloco&&i.bloco!=='0'?' / bloco '+i.bloco:''} — ${i.categoria}`,
  `Situação: ${i.motivo}`,`App: ${i.app}`,`Administradora: ${i.portal}`,`Providência: ${i.acao}`,'')
 if(!itens.length)linhas.push('Nenhuma divergência documentada foi identificada nas evidências disponíveis deste lote. As limitações acima permanecem pendentes.','')
 linhas.push('Este relatório solicita conferência humana. Seu envio não altera cadastros, acordos ou pagamentos e não importa novas cobranças.')
 const texto=linhas.join('\n')
 const html='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(titulo)+'</title><style>body{font:15px/1.5 Arial,sans-serif;color:#213547;margin:32px;max-width:1100px}h1{font-size:23px}table{border-collapse:collapse;width:100%;margin:24px 0}th,td{border:1px solid #ccd5df;padding:10px;text-align:left;vertical-align:top}th{background:#eff4f8}small{color:#52616d}@media print{body{margin:12mm}tr{break-inside:avoid}}</style><h1>'+esc(condominio)+' — conferência do scanner</h1><p>'+esc(portal)+' · '+esc(quando)+' (Brasília)<br>Responsável: '+esc(responsavel)+'</p><p>'+esc(linhas[7])+'<br>'+esc(linhas[8])+'</p><table><thead><tr><th>Unidade</th><th>Ocorrência</th><th>App</th><th>Administradora</th><th>Providência</th></tr></thead><tbody>'+itens.map(i=>'<tr><td>'+esc(i.unidade)+(i.bloco&&i.bloco!=='0'?'<br>Bloco '+esc(i.bloco):'')+'</td><td><b>'+esc(i.categoria)+'</b><br>'+esc(i.motivo)+'</td><td>'+esc(i.app)+'</td><td>'+esc(i.portal)+'</td><td>'+esc(i.acao)+'</td></tr>').join('')+'</tbody></table><p>'+esc(itens.length?'Ausência na consulta disponível não comprova inexistência do acordo nem quitação.':linhas.at(-3))+'</p><small>'+esc(linhas.at(-1))+'</small></html>'
 return {assunto:titulo,texto,html}
}
