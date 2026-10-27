import {randomUUID} from 'node:crypto'
// Usa evidências coletadas; o banco confere e baixa somente pagamentos inequívocos.
export async function conciliarPendentes(db,limite=20,manual=null){
 let query=db.from('scanner_evidencias').select('id,configuracao:scanner_configuracoes!inner(ativo,condominio:condominios!inner(status))').eq('tipo','pagamentos').eq('conciliacao_status','pendente').eq('configuracao.ativo',true).eq('configuracao.condominio.status','ativo')
 if(manual)query=query.eq('configuracao_id',manual.configuracao_id).gte('observado_em',manual.iniciado_em).in('unidade_portal',manual.unidades)
 const {data,error}=await query.order('observado_em',{ascending:false}).order('id').limit(Math.min(limite,20))
 if(error)throw Error('Não foi possível consultar a fila de conciliação financeira.')
 const resumo={evidencias:0,itens:0,validados:0,divergentes:0,ambiguos:0,inconclusivos:0,baixas:0,revisoes_baixa:0,erros:0}
 const execucao=manual?.token??randomUUID()
 for(const e of data){
  const {data:r,error:re}=await db.rpc('scanner_processar_pagamentos',{p_evidencia:e.id,p_execucao:execucao})
  if(re){resumo.erros++;console.error(JSON.stringify({conciliacao_evidencia:e.id,resultado:'retomada_pendente',codigo:re.code??'banco'}));continue}
  resumo.evidencias++;resumo.itens+=r.itens??0;resumo.validados+=r.resumo?.validado??0
  resumo.divergentes+=r.resumo?.divergente??0;resumo.ambiguos+=r.resumo?.ambiguo??0;resumo.inconclusivos+=r.resumo?.inconclusivo??0
  resumo.baixas+=r.baixa?.aplicadas??0;resumo.revisoes_baixa+=r.baixa?.revisoes??0
 }
 return resumo
}
