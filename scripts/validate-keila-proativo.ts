import assert from 'node:assert/strict'
import {destinoRespostaKeila} from '../features/keila/destino-resposta'
import {conferirProposta,renderizarPropostaConferida} from '../features/keila/conferencia-proposta'
import type {KeilaCasoPayload} from '../features/keila/casos'
const p:KeilaCasoPayload={versao:1,estado:'em_analise',intencao:'outro',unidade_ids:['unidade'],emails:[],atividades:[],proxima_acao:'Revisar',envio_permitido:false,modo:'supervisionado',contato_proativo:{origem:'solicitacao_operador',nome:'Guilherme',email:'contato@example.com',assunto:'Proposta à vista',solicitado_em:'2026-10-14T12:00:00Z'}}
assert.equal(destinoRespostaKeila(p)?.proativo,true)
assert.equal(destinoRespostaKeila(p)?.chave,'cadastro:unidade:contato@example.com')
assert.equal(p.emails.length,0,'Não fabricar e-mail recebido para um atendimento proativo')
assert.equal(destinoRespostaKeila({...p,contato_proativo:undefined}),undefined)
assert.equal(destinoRespostaKeila({...p,unidade_ids:['um','dois']}),undefined)
const recebido={chave:'outlook:novo',nome:'Guilherme',remetente:'novo@example.com',assunto:'Retorno',recebido_em:'2026-10-14T16:00:00Z',resumo:'Nova mensagem'}
assert.equal(destinoRespostaKeila({...p,emails:[recebido]})?.chave,recebido.chave,'Novo retorno invalida o destino antigo')
const regras={dias_apos_vencimento_regua:30,despesas_acordo_avista_percentual:10,despesas_acordo_parcelado_percentual:20,parcelas_acordo_sem_aprovacao_sindico:3}
const plano=conferirProposta([{vencimento:'2026-09-10',valor:389.09,linha:1},{vencimento:'2026-10-10',valor:384.30,linha:2}],[{id:'setembro',vencimento:'2026-09-10',status_operacional:'em_cobranca_ativa',status_financeiro:'em_aberto'}],regras,1,'2026-10-25',new Date('2026-10-14T15:00:00Z'))
assert.equal(plano.avista.total,428);assert.equal(plano.avista.despesas,38.91)
assert.equal(plano.parcelado.parcelas.length,1)
const texto=renderizarPropostaConferida('Guilherme','unidade 73, bloco 4','Safira','2026-10-14',plano)
assert.match(texto,/25\/10\/2026/);assert.match(texto,/428,00/);assert.match(texto,/10%/)
assert.doesNotMatch(texto,/Em 1 parcelas|20%|Qual opção/)
console.log('PASS: origem proativa sem e-mail fabricado, prioridade do novo retorno, setembro à vista com 10%, outubro excluído e vencimento em 25/10.')
