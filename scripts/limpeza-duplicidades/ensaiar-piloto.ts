import { readFileSync, writeFileSync } from 'node:fs'
import { fixture, snapshotHash, apply, id } from './fixture'

async function main() {
  const [path, output] = process.argv.slice(2)
  if (!path || !output || process.argv.length !== 4) throw new Error('Uso: tsx scripts/limpeza-duplicidades/ensaiar-piloto.ts snapshot-piloto.json resultado.json')
  const data=JSON.parse(readFileSync(path,'utf8'))
  if (data.errors?.length) throw new Error('Snapshot tem consultas com erro; concluir a coleta antes do ensaio.')
  const db=await fixture({...data,central_pendencias:data.pendencias})
  const results=[]
  try {
    for(const group of data.groups) {
      const sent=data.mensagens.filter((m:any)=>m.status==='enviada' && group.ids.includes(m.cobranca_id))
      if(sent.length!==1) throw new Error('Sem indicação única de continuidade de envio para '+group.grupo_id)
      const keep=sent[0].cobranca_id
      const archive=group.ids.find((id:string)=>id!==keep)
      const hash=await snapshotHash(db,group.ids)
      let state='aplicado_no_ensaio',reason=''
      try { await apply(db,hash,keep,archive,group.grupo_id) }
      catch(error) {state='bloqueado';reason=String((error as Error).message)}
      if(state!=='bloqueado') throw new Error('Os casos reais ainda têm pendências; o ensaio deveria recusá-los.')
      if(await snapshotHash(db,group.ids)!==hash) throw new Error('O bloqueio deixou alteração parcial.')
      results.push({grupo_id:group.grupo_id,unidade:group.unidade,recibo:group.recibo,preservar_proposto:keep,arquivar_proposto:archive,estado:state,motivo:reason,impacto_potencial_centavos:group.impacto_centavos})
    }
    const blockedArchiveCount=(await db.query('select id from cobrancas where duplicada_de_id is not null')).rows.length
    // Hipótese explícita, exclusivamente no banco descartável: revisão resolveu os alertas.
    // Não altera o JSON de origem, não prova resolução real e não autoriza produção.
    await db.exec("update central_pendencias set status='resolvida'")
    const frozenMessages=(await db.query('select * from mensagens order by id')).rows
    const baselineHashes=new Map<string,string>()
    const beforeTotals=(await db.query<{registros:number;centavos:number}>('select count(*)::int registros,(sum(valor_atualizado)*100)::int centavos from ensaio_duplicidades.cobrancas_canonicas')).rows[0]
    for(const result of results){
      const hash=await snapshotHash(db,[result.preservar_proposto,result.arquivar_proposto])
      baselineHashes.set(result.grupo_id,hash)
      await apply(db,hash,result.preservar_proposto,result.arquivar_proposto,result.grupo_id)
      if(await apply(db,hash,result.preservar_proposto,result.arquivar_proposto,result.grupo_id)!=='ja_aplicado')throw new Error('Repetição não idempotente.')
    }
    const afterTotals=(await db.query<{registros:number;centavos:number}>('select count(*)::int registros,(sum(valor_atualizado)*100)::int centavos from ensaio_duplicidades.cobrancas_canonicas')).rows[0]
    const potential=results.reduce((sum,result)=>sum+result.impacto_potencial_centavos,0)
    if(beforeTotals.registros-afterTotals.registros!==5 || beforeTotals.centavos-afterTotals.centavos!==potential)throw new Error('Impacto diferente do manifesto.')
    if(JSON.stringify((await db.query('select * from mensagens order by id')).rows)!==JSON.stringify(frozenMessages))throw new Error('Mensagens foram alteradas.')
    for(const result of [...results].reverse())await db.query('select ensaio_duplicidades.reverter($1,$2)',[id(99),result.grupo_id])
    for(const result of results)if(await snapshotHash(db,[result.preservar_proposto,result.arquivar_proposto])!==baselineHashes.get(result.grupo_id))throw new Error('Reversão incompleta.')
    const summary={modo:'PGlite isolado; sem rede',executado_em:new Date().toISOString(),registros_arquivados_estado_real:blockedArchiveCount,resultados:results,
      cenario_hipotetico:{premissa:'Somente no fixture, marcar as cinco pendências como resolvidas. Não corresponde a resolução em produção.',antes:beforeTotals,depois:afterTotals,impacto_centavos:potential,mensagens_intactas:true,repeticao_idempotente:true,reversao_integral:true},
      registros_arquivados_apos_reversao:(await db.query('select id from cobrancas where duplicada_de_id is not null')).rows.length}
    writeFileSync(output,JSON.stringify(summary,null,2)+'\n')
    console.log(JSON.stringify(summary,null,2))
  } finally {await db.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1})
