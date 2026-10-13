import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { baixarAnexosKeila } from './anexos'
const caso = '8b21abcc-4c1d-5bb5-a350-005efc2422d2'
const bytes = Buffer.from('%PDF-1.4\nfixture')
const hash = createHash('sha256').update(bytes).digest('hex')
const ref = { nome: 'boleto.pdf', sha256: hash, storage_path: `keila/${caso}/${hash}.pdf` }
const db = { storage: { from: () => ({ download: async () => ({ data: new Blob([bytes]), error: null }) }) } } as any
test('confere integridade antes de entregar documento', async () => {
  assert.equal((await baixarAnexosKeila(db, caso, [ref]))[0].content.equals(bytes), true)
})
test('bloqueia documento de outro atendimento e alteração de conteúdo', async () => {
  await assert.rejects(baixarAnexosKeila(db, 'd56c4903-3494-5a60-aedf-44c5a65d3ac3', [ref]), /fora/)
  const errado = 'a'.repeat(64)
  await assert.rejects(baixarAnexosKeila(db, caso, [{ ...ref, sha256: errado, storage_path: `keila/${caso}/${errado}.pdf` }]), /Integridade/)
})
