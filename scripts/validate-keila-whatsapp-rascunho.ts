import assert from 'node:assert/strict'
import {criarRascunhoWhatsApp,aprovarRascunhoWhatsApp} from '../features/keila/whatsapp-rascunho'
const r=criarRascunhoWhatsApp('5511984594784','Olá, Larissa. Confirme seu e-mail.','2026-10-14T14:00:00Z')
assert.equal(r.aprovacao,undefined)
const a=aprovarRascunhoWhatsApp(r,r.versao_hash,'operador','2026-10-14T14:01:00Z')
assert.equal(a.aprovacao?.usuario_id,'operador');assert.equal(a.aprovacao?.versao_hash,r.versao_hash)
assert.throws(()=>aprovarRascunhoWhatsApp({...r,texto:'Texto alterado'},r.versao_hash,'operador'),/mudou/)
assert.throws(()=>aprovarRascunhoWhatsApp({...r,destinatario:'5511999999999'},r.versao_hash,'operador'),/mudou/)
assert.equal(aprovarRascunhoWhatsApp(a,a.versao_hash,'outro').aprovacao?.usuario_id,'operador')
assert.throws(()=>criarRascunhoWhatsApp('123','teste'),/Celular/)
assert.equal(Object.hasOwn(a,'mensagem_id'),false)
console.log('PASS: aprovação separada, texto/número vinculados à versão e nenhum identificador de envio.')
