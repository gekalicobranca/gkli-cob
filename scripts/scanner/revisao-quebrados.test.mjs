import test from 'node:test'
import assert from 'node:assert/strict'
import {PIQUERI,periodoNegociado,revisarAcordo,resumirRevisao} from './revisao-quebrados-modelo.mjs'
import {promptInterpretacao,prepararEntrada} from './interpretacao.mjs'
import {renderizarRevisaoQuebrados} from './revisao-quebrados-html.mjs'

const base=()=>({acordo:{id:'a',status:'quebrado',tipo:'extrajudicial',condominio_id:'c',carteira_id:'w',unidade_id:'u',valor_acordado:100,observacoes:'Período negociado: 05/2026 a 07/2026. Datas estimadas pelo vencimento.'},condominio:{id:'c',nome:'Condomínio de teste'},unidade:{id:'u',condominio_id:'c',carteira_id:'w',identificacao:'41',bloco:'02'},hoje:'2026-11-03',cotas:[{id:'b',condominio_id:'c',carteira_id:'w',unidade_id:'u',competencia:'06/2026',valor_original:100}],parcelas:[{id:'p1',numero:1,status:'paga',valor:50,vencimento:'2026-09-01',data_pagamento:'2026-09-01'},{id:'p2',numero:2,status:'vencida',valor:50,vencimento:'2026-10-01'}]})

test('períodos explícitos: intervalo, meses avulsos e divergência; datas de parcelas não definem cotas',()=>{
 assert.deepEqual(periodoNegociado(base().acordo).meses,['2026-05','2026-06','2026-07'])
 assert.deepEqual(periodoNegociado({observacoes:'Período negociado: 07/2023 e 03/2025.'}).meses,['2023-07','2025-03'])
 assert.deepEqual(periodoNegociado({observacoes:'Período negociado 05/02/2026 a 05/04/2026. Pagamentos posteriores.'}).meses,['2026-02','2026-03','2026-04'])
 assert.deepEqual(periodoNegociado({observacoes:'Período: 10/11/2025 a 10/11/2025.'}).meses,['2025-11'])
 assert.deepEqual(periodoNegociado({observacoes:'Período de débito: 10/04/2025 a 10/04/2025 | Parcela 01/2026.'}).meses,['2025-04'])
 assert.deepEqual(periodoNegociado({observacoes:'Período: 01/2000 a 01/2050.'}).meses,[])
 assert.deepEqual(periodoNegociado({observacoes:'Parcela em 01/10/2026; recibo em 01/11/2026.'}).meses,[])
 const d=periodoNegociado({observacoes:'Período negociado: 01/2026 a 03/2026.\nPeríodo negociado: 01/2026 a 04/2026.'})
 assert.equal(d.divergente,true);assert.deepEqual(d.meses,[])
})

test('mesma unidade, valor e competência só produzem candidata; data estimada não confirma pagamento nem saldo',()=>{
 const raw=base(),antes=JSON.stringify(raw),r=revisarAcordo(raw)
 assert.equal(r.cotas_abrangidas_app.length,0);assert.equal(r.cotas_candidatas_sem_vinculo.length,1)
 assert.equal(r.valor_nominal_parcelas_pagas_app_centavos,5000);assert.equal(r.valor_pagamentos_confirmados_centavos,null)
 assert.equal(r.saldo_residual_confirmado_centavos,null);assert.equal(r.parcelas_vencidas.length,1)
 assert.equal(r.estado,'pendente_documentos');assert.equal(r.situacao_administradora,null)
 assert.equal(r.baixa_permitida,false);assert.equal(r.liberar_cotas,false);assert.deepEqual(r.alteracoes_realizadas,[])
 assert.ok(r.faltantes.some(x=>x.includes('estimados')));assert.equal(JSON.stringify(raw),antes)
})

test('vínculo explícito exige carteira, condomínio e unidade; recibo auditado não comprova quebra',()=>{
 const raw=base();raw.acordo.cobranca_id='b'
 const r=revisarAcordo({...raw,baixas:[{acordo_id:'a',condominio_id:'c',carteira_id:'w',unidade_id:'u',recibo:'123',data_pagamento:'2026-09-02',valor_pago_centavos:4900,evidencia_sha256:'hash'}]})
 assert.equal(r.cotas_abrangidas_app.length,1);assert.equal(r.valor_pagamentos_confirmados_centavos,4900)
 assert.equal(r.saldo_residual_confirmado_centavos,null);assert.equal(r.estado,'pendente_documentos')
 const outro=revisarAcordo({...raw,cotas:[{...raw.cotas[0],carteira_id:'outra'}]})
 assert.equal(outro.cotas_abrangidas_app.length,0);assert.deepEqual(outro.cotas_vinculos_invalidos,['b'])
})

test('Piqueri excluído por ID ou nome; classificação rompido preservada e protocolo faz parte do prompt real',()=>{
 const raw=base()
 assert.equal(revisarAcordo({...raw,acordo:{...raw.acordo,condominio_id:PIQUERI}}),null)
 assert.equal(revisarAcordo({...raw,condominio:{id:'outro',nome:'Residencial Piqueri'}}),null)
 assert.equal(revisarAcordo({...raw,acordo:{...raw.acordo,status:'quitado'}}),null)
 const r=revisarAcordo({...raw,acordo:{...raw.acordo,status:'rompido',numero_processo:'1000000-00.2026.8.26.0001',observacoes:'[BBZ:0001:12345678]'}})
 assert.equal(r.identificadores_administrativos[0].identificador,'12345678');assert.notEqual(r.cnj_formato,'12345678')
 assert.equal(prepararEntrada({acordos:[{id:'a',status:'rompido'}]}).candidatos[0].status,'rompido')
 assert.match(promptInterpretacao,/nenhum número de dias autoriza/);assert.match(promptInterpretacao,/Piqueri está excluído/)
 assert.deepEqual(resumirRevisao([r]).categorias_sem_vinculo,{sem_periodo_inequivoco:1})
})

test('relatório preserva revisão, escapa dados e mostra consulta no fuso de São Paulo',()=>{
 const r=revisarAcordo({...base(),condominio:{id:'c',nome:'<script>inválido</script>'}})
 const html=renderizarRevisaoQuebrados({consultado_em:'2026-11-03T20:35:00Z',resumo:resumirRevisao([r]),casos:[r]})
 assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'))
 assert.match(html,/03\/11\/2026, 17:35/);assert.match(html,/Situação na administradora: não confirmada/)
 assert.match(html,/não autoriza baixas ou liberação/)
})
