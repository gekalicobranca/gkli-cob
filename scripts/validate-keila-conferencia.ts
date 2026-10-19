import assert from 'node:assert/strict'
import { extrairCotasLello, conferirProposta, renderizarPropostaConferida, incluirAcolhimentoProposta, hashConferencia } from '../features/keila/conferencia-proposta'
import { salvarCaso } from '../features/keila/casos-service'
async function main(){
 const header=(id:string)=>{const r:unknown[]=Array(26).fill('');r[4]='Unidade';r[10]=id;r[12]='CATIANA';return r}
 const cota=(data:string,valor:string)=>{const r:unknown[]=Array(26).fill('');r[8]=data;r[21]=valor;return r}
 const rows=[header('200035'),cota('10/08/2026','406,26'),header('100001'),cota('10/07/2026','999,99'),header('200035'),cota('10/06/2026','573,09'),header('200035'),cota('10/07/2026','409,75'),header('200035'),cota('10/09/2026','402,04'),header('200035'),cota('10/10/2026','397,08')]
 const fonte=extrairCotasLello(rows,'200035');assert.equal(fonte.length,5)
 const cadastro=fonte.filter(c=>c.vencimento<'2026-10-01').map((c,i)=>({id:String(i),vencimento:c.vencimento,status_operacional:'em_cobranca_ativa',status_financeiro:'em_aberto'}))
 const regras={dias_apos_vencimento_regua:30,despesas_acordo_avista_percentual:10,despesas_acordo_parcelado_percentual:20,parcelas_acordo_sem_aprovacao_sindico:3}
 const hoje=new Date('2026-10-13T17:00:00Z'),plano=conferirProposta(fonte,cadastro,regras,3,'2026-10-16',hoje)
 assert.equal(plano.avista.base,1791.14);assert.equal(plano.avista.total,1970.25);assert.equal(plano.parcelado.total,2149.37);assert.deepEqual(plano.parcelado.parcelas.map(p=>p.valor),[716.46,716.46,716.45]);assert.equal(plano.excluidas[0].vencimento,'2026-10-10')
 assert.throws(()=>conferirProposta([fonte[0]],cadastro,regras,3,'2026-10-16',hoje),/ausente/,'Recorte parcial não pode produzir proposta')
 assert.throws(()=>conferirProposta(fonte,cadastro.slice(1),regras,3,'2026-10-16',hoje),/Conciliação/)
 assert.throws(()=>conferirProposta(fonte,cadastro,{...regras,parcelas_acordo_sem_aprovacao_sindico:null},3,'2026-10-16',hoje),/Regras/)
 const divergente=conferirProposta(fonte,cadastro.map(c=>({...c,valor_atualizado:1})),regras,3,'2026-10-16',hoje)
 assert.equal(divergente.divergencias.length,4)
 assert.match(divergente.divergencias[0].motivo,/cadastro preservado/)
 assert.throws(()=>extrairCotasLello([...rows,header('200035'),cota('10/06/2026','573,09')],'200035'),/mesmo vencimento/)
 const repetidasSuspensas=extrairCotasLello([...rows,header('200035'),cota('01/11/2025','247,73'),header('200035'),cota('01/11/2025','247,73')],'200035')
 assert.equal(repetidasSuspensas.filter(c=>c.vencimento==='2025-11-01').length,2,'Preservar as duas linhas da fonte, sem deduplicar silenciosamente')
 const semSuspensas=conferirProposta(repetidasSuspensas,cadastro,regras,3,'2026-10-16',hoje)
 assert.equal(semSuspensas.excluidas.filter(c=>c.vencimento==='2025-11-01').length,2)
 assert.equal(semSuspensas.avista.base,plano.avista.base,'Repetições pré-2026 não entram no cálculo')
 const texto=renderizarPropostaConferida('Catiana','unidade 35, bloco 2','Safira','2026-10-13',plano)
 assert.match(texto,/716,46/);assert.match(texto,/Fora da régua/)
 const fonteBloqueada=[...fonte,{vencimento:'2025-02-10',valor:544.60,linha:99}]
 const planoBloqueado=conferirProposta(fonteBloqueada,[...cadastro,{id:'garantidora',vencimento:'2025-02-10',status_operacional:'suspenso',status_financeiro:'em_aberto',observacoes:'Suspensa: competência abrangida pelo Bloqueio Garantidora.'}],regras,3,'2026-10-16',hoje)
 assert.match(texto,/validade de 7 dias a partir do envio/);assert.match(texto,/primeira parcela passar/);
 assert.match(renderizarPropostaConferida('Teste','unidade 1','Condomínio','2026-10-13',plano,undefined,{agenteId:'lidia'}),/Lidia \| Genske Advogados/)
 assert.doesNotMatch(renderizarPropostaConferida('Teste','unidade 1','Condomínio','2026-10-13',plano,undefined,{historica:true}),/validade de 7 dias/)
 const avisoBloqueio=renderizarPropostaConferida('Monique','unidade 93','Safira','2026-10-13',planoBloqueado)
 assert.match(avisoBloqueio,/há cotas em bloqueio.*garantidora/)
 assert.doesNotMatch(avisoBloqueio,/10\/02\/2025|544,60|544.60/)
 assert.match(avisoBloqueio,/10\/10\/2026/,'Exclusões sem bloqueio continuam explicadas')
 assert.equal(planoBloqueado.parcelado.total,plano.parcelado.total)
 assert.doesNotMatch(texto,/há cotas em bloqueio/,'Não inferir garantidora sem evidência no cadastro')
 assert.equal(incluirAcolhimentoProposta(texto),texto,'Sem acolhimento, versões anteriores permanecem idênticas')
 const desculpas=incluirAcolhimentoProposta(texto,'desculpas_whatsapp_sem_retorno')
 assert.match(desculpas,/Pedimos desculpas pela falta de retorno.*WhatsApp/)
 assert.match(desculpas,/716,46/)
 assert.doesNotMatch(desculpas,/falha técnica|problema no sistema/)
 const vanessa=conferirProposta([{vencimento:'2026-07-10',valor:396.56,linha:1},{vencimento:'2026-08-10',valor:393.18,linha:2},{vencimento:'2026-10-10',valor:384.30,linha:3}],[{id:'julho',vencimento:'2026-07-10',status_operacional:'em_cobranca_ativa',status_financeiro:'em_aberto'},{id:'agosto',vencimento:'2026-08-10',status_operacional:'em_cobranca_ativa',status_financeiro:'em_aberto'}],regras,2,'2026-11-05',new Date('2026-10-14T15:00:00Z'))
 assert.equal(vanessa.parcelado.total,947.69)
 assert.deepEqual(vanessa.parcelado.parcelas.map(p=>p.vencimento),['2026-11-05','2026-12-05'])
 const aviso=renderizarPropostaConferida('Vanessa','unidade 46, bloco 6','Safira','2026-10-14',vanessa,{parcelamento_solicitado:true,segunda_via_vencimento:'2026-10-10',administradora:'Lello'})
 assert.match(aviso,/segunda via diretamente à Lello/);assert.match(aviso,/05\/11\/2026/);assert.match(aviso,/05\/12\/2026/)
 assert.doesNotMatch(aviso,/solicitamos|obtivemos|Qual opção/)
 assert.throws(()=>renderizarPropostaConferida('Vanessa','unidade 46','Safira','2026-10-14',vanessa,{parcelamento_solicitado:true,segunda_via_vencimento:'2026-07-10',administradora:'Lello'}),/fora da régua/)
 assert.notEqual(hashConferencia({texto,plano}),hashConferencia({texto:texto.replace('716,46','100,00'),plano}))
 assert.notEqual(hashConferencia(regras),hashConferencia({...regras,despesas_acordo_parcelado_percentual:25}))
 await assert.rejects(salvarCaso({} as never,{payload:{resposta_aprovada:{texto:'aprovado'},resposta_simulada:'aprovado'}} as never,{resposta_aprovada:{texto:'aprovado'},resposta_simulada:'novo valor'} as never,null),/imutável/)
 console.log('PASS: cabeçalhos repetidos e intercalados, conciliação parcial, cotas faltantes/duplicadas, totais, parcelas, exclusões e imutabilidade da aprovação.')
}
main().catch(e=>{console.error(e);process.exitCode=1})
