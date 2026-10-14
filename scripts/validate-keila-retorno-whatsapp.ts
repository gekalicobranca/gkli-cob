import assert from 'node:assert/strict'
import {montarAvisoFalhaEmail,type FalhaEmailKeila} from '../features/keila/retorno-email-whatsapp'
const f:FalhaEmailKeila={id:'retorno',destinatario:'contato@example.com',classificacao:'inexistente',motivo:'550 5.1.1 no such user',recebido_em:'2026-10-14T12:00:00Z',outlook_url:'https://outlook.cloud.microsoft/mail/'}
const inexistente=montarAvisoFalhaEmail(f,'Maria Silva','+55 (11) 99999-9999')
assert.match(inexistente.rascunho!.texto,/endereço não foi encontrado/)
assert.equal(inexistente.rascunho!.destinatario,'5511999999999')
assert.equal(inexistente.rascunho!.aprovacao,undefined)
assert.equal(inexistente.rascunho!.liberacao,undefined)
const cheia=montarAvisoFalhaEmail({...f,classificacao:'temporaria',motivo:'452 4.2.2 mailbox full'},'Maria','5511999999999')
assert.match(cheia.rascunho!.texto,/sem espaço/)
assert.doesNotMatch(cheia.rascunho!.texto,/não foi encontrado|inválido/)
const conexao=montarAvisoFalhaEmail({...f,classificacao:'temporaria',motivo:'connection timed out'},'Maria','5511999999999')
assert.match(conexao.rascunho!.texto,/falha temporária/)
assert.doesNotMatch(conexao.rascunho!.texto,/sem espaço|inexistente/)
assert.equal(montarAvisoFalhaEmail({...f,classificacao:'revisao'},'Maria','5511999999999').rascunho,undefined)
assert.equal(montarAvisoFalhaEmail(f,'Maria',null).rascunho,undefined)
assert.equal(montarAvisoFalhaEmail(f,'Maria','1133334444').rascunho,undefined)
assert.equal(montarAvisoFalhaEmail(f,'Maria','5500999999999').rascunho,undefined)
console.log('PASS: inexistência, quota, conexão, diagnóstico inconclusivo e celular ausente; nenhum aviso aprovado ou liberado automaticamente.')
