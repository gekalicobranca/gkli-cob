import {validarLink} from './core.mjs'

// Só ordena documentos já oferecidos pelo portal, com escopo exato.
export function loteDocumentos(links,{codigo,unidade,visitados=[],acordos=[],recibos=[],limite=3}){
 const todos=[...new Set(links)].map(href=>{
  const u=new URL(validarLink(href,codigo,unidade,'/relatorios/Acordo.do'))
  const acordo=u.searchParams.get('codAcordo'),recibo=u.searchParams.get('numrecibo')
  if(!/^\d+$/.test(acordo||'')||(recibo&&!/^\d+$/.test(recibo)))throw Error('Identificador de recebimento inválido.')
  return {href:u.href,prioridade:recibos.includes(recibo)?0:acordos.includes(acordo)?1:2}
 })
 if(todos.length>1000)throw Error('Histórico excede limite seguro de documentos.')
 const vistos=new Set(visitados),pendentes=todos.filter(x=>!vistos.has(x.href)).sort((a,b)=>a.prioridade-b.prioridade||a.href.localeCompare(b.href))
 return {links:pendentes.slice(0,limite).map(x=>x.href),restantes:Math.max(0,pendentes.length-limite),total:todos.length,
  visitados:todos.filter(x=>vistos.has(x.href)).map(x=>x.href)}
}
export function diagnosticoFinanceiro(d){
 if(d.diagnostico)return d.diagnostico
 if(d.historico_progresso?.pendente)return 'historico_parcial'
 if(d.status==='consultado')return d.pagamentos?.length?'documentos_disponiveis':'sem_pagamento_localizado'
 if(d.recebimentos?.length||d.vinculos_bbz?.processos?.length)return 'documentos_disponiveis'
 if(/suspens|adiad|pausa/i.test(d.motivo??''))return 'acesso_adiado'
 if(/indispon[ií]vel|n[aã]o (?:disponibilizado|dispon[ií]vel)|n[aã]o validado|excedeu|exige homologação/i.test(d.motivo??''))return 'sem_acesso'
 if(/v[ií]nculo|identificador|duplicada|diverge/i.test(d.motivo??''))return 'revisao_identidade'
 if(/formato|tabela|incompleto|interpreta/i.test(d.motivo??''))return 'revisao_documento'
 return 'sem_pagamento_localizado'
}
