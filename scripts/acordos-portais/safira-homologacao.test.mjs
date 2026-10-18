import test from 'node:test'
import assert from 'node:assert/strict'
import { homologarSafira } from './safira-homologacao.mjs'
const parcelas=[{id:'p1',numero:1,tipo_parcela:'parcela',vencimento:'2026-10-10',valor:100,status:'aberta',data_pagamento:null}]
const snapshot={humanos:[],acordos:[{id:'a1',unidade_id:'u1',tipo:'extrajudicial',status:'ativo',valor_acordado:100,unidade:{identificacao:'200024',acao_judicial:false},parcelas,bloqueado:false}]}
const fontes=[{resultados:[{tipo:'acordo',acordo_externo:'123',unidade:'200024',situacao_acordo:'Em Andamento',total_centavos:10000,parcelas:[{vencimento:'2026-10-10',valor_centavos:10000,status:'Contabilizado',data_pagamento:'2026-10-09'}]},{tipo:'recebimento',acordo_externo:'123',numero:1,vencimento:'2026-10-10',valor_original_centavos:10000,valor_pago_centavos:10000,data_pagamento:'2026-10-09',confirmado_na_fonte:true}]}]
test('somente cronograma completo único e recibo compatível permitem homologação e proposta de baixa',()=>{
 const r=homologarSafira(snapshot,fontes)[0];assert.equal(r.homologavel,true);assert.equal(r.pagamentos[0].resultado,'novo_recebimento')
 const duplo=structuredClone(snapshot);duplo.acordos.push({...duplo.acordos[0],id:'a2'});assert.equal(homologarSafira(duplo,fontes)[0].homologavel,false)
 const venc=structuredClone(snapshot);venc.acordos[0].parcelas[0].vencimento='2026-10-11';assert.equal(homologarSafira(venc,fontes)[0].homologavel,false)
})
test('cancelamento na fonte e prioridade humana não são convertidos em pagamento',()=>{
 const cancelado=structuredClone(fontes);cancelado[0].resultados[0].situacao_acordo='Cancelado';assert.equal(homologarSafira(snapshot,cancelado)[0].homologavel,false)
 assert.equal(homologarSafira({...snapshot,humanos:['u1']},fontes)[0].homologavel,false)
 const pago=structuredClone(snapshot);pago.acordos[0].parcelas[0].status='paga';pago.acordos[0].parcelas[0].data_pagamento='2026-10-10';assert.equal(homologarSafira(pago,fontes)[0].pagamentos[0].resultado,'ja_registrado')
})
