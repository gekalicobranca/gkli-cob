import assert from 'node:assert/strict'
import { normalizarCelular, primeiroCelularValido } from '../lib/core/telefone'
import { escolherContatoRegua } from '../features/regua/services/regua-shared'
import { buildWhatsAppTemplatePayload, normalizeWhatsAppPhone } from '../features/mensageria/whatsapp-cloud/provider'
import { buildWhatsappWebUrl } from '../features/mensageria/whatsapp-web'
import { buildWhatsappHref } from '../features/cobrancas/workspace/contact'

const celular = '5511999991234'
for (const value of ['1133331234', '551133331234', '999991234', '10999991234', '11999991234 | 11999994321', '1.1999991234E10']) {
  assert.equal(normalizarCelular(value), null, value)
  assert.equal(normalizeWhatsAppPhone(value), '', value)
  assert.equal(buildWhatsappWebUrl(value), '', value)
  assert.throws(() => buildWhatsAppTemplatePayload({ to: value, templateName: 'teste' }))
}
assert.equal(normalizarCelular('(11) 99999-1234'), celular)
assert.equal(normalizarCelular('(55) 99999-1234'), '5555999991234')
assert.equal(primeiroCelularValido('1133331234 | 11999991234'), celular)
assert.equal(buildWhatsappHref({ telefone: '1133331234' }), null)
assert.match(buildWhatsappHref({ telefone: '1133331234 | 11999991234' })!, /wa.me\/5511999991234/)

const apoios = [
  { tipo_responsavel: 'proprietario', telefone: '1133331234', email: 'proprietario@example.com' },
  { tipo_responsavel: 'inquilino', celular: '11999991234 | 11999994321', telefone: '1144441234' },
]
assert.equal(escolherContatoRegua({ apoios, canal: 'whatsapp', preferencia: 'proprietario' }).destinatario, celular)
assert.equal(escolherContatoRegua({ apoios: [apoios[0]], canal: 'whatsapp' }).destinatario, null)
assert.equal(escolherContatoRegua({ apoios, canal: 'email' }).destinatario, 'proprietario@example.com')
assert.equal(escolherContatoRegua({ unidade: { telefone: '1133331234 | 11999991234' }, canal: 'whatsapp' }).destinatario, celular)
console.log('WhatsApp: seleção de celular, bloqueio de fixos e preservação do e-mail verificados.')
