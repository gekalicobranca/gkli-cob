import { primeiraEtapaFlow } from '@/features/regua/engine'
import { cicloReferencia, criarReguaFingerprint, normalizarEtapaId } from '@/features/regua/services/regua-shared'
import type { ReguaEtapa } from '@/features/regua/types'
import { reguasDisponiveis } from './canais'

type ReguaFingerprint = { id: string; carteira_id?: string | null; etapas?: Partial<ReguaEtapa>[] }
type CobrancaFingerprint = { id: string; carteira_id?: string; canais_ocupados?: string[]; reguas_email_pendentes?: string[]; canais_sem_destinatario?: string[] }

export function fingerprintInicialFlow(cobrancaId: string, regua: ReguaFingerprint, ciclo: string) {
  const etapa = primeiraEtapaFlow((regua.etapas ?? []) as ReguaEtapa[])
  if (!etapa) return null
  return criarReguaFingerprint({
    contexto: 'regua_cobranca', entidadeId: cobrancaId,
    etapaId: normalizarEtapaId(etapa.id) ?? etapa.id ?? null,
    canal: etapa.canal ?? 'whatsapp', ciclo,
  })
}

/** Mesmas fontes do processador, sem filtrar status de mensagem ou de Flow. */
export async function carregarReguasComFingerprintExistente(
  db: { from: (table: string) => any }, rows: CobrancaFingerprint[], reguas: ReguaFingerprint[],
  ciclo = cicloReferencia(),
) {
  const pares = new Map<string, Array<{ cobrancaId: string; reguaId: string }>>()
  for (const row of rows) {
    for (const regua of reguasDisponiveis(row, reguas)) {
      const fingerprint = fingerprintInicialFlow(row.id, regua, ciclo)
      if (!fingerprint) continue
      const referencias = pares.get(fingerprint) ?? []
      referencias.push({ cobrancaId: row.id, reguaId: regua.id })
      pares.set(fingerprint, referencias)
    }
  }
  const existentes = new Set<string>()
  const fingerprints = [...pares.keys()]
  const consultas: Array<() => Promise<void>> = []
  // Chaves longas: 40 por consulta mantém a URL abaixo dos limites dos proxies.
  for (let inicio = 0; inicio < fingerprints.length; inicio += 40) {
    const parte = fingerprints.slice(inicio, inicio + 40)
    for (const tabela of ['mensagens', 'lote_itens']) {
      consultas.push(async () => {
        for (let pagina = 0; ; pagina += 500) {
          let query = db.from(tabela).select('fingerprint').in('fingerprint', parte)
          if (tabela === 'lote_itens') query = query.not('mensagem_id', 'is', null)
          const { data, error } = await query.order('id').range(pagina, pagina + 499)
          if (error) throw new Error('Não foi possível conferir o histórico de mensagens. Atualize a lista antes de gerar Flows.')
          for (const item of data ?? []) existentes.add(item.fingerprint)
          if ((data ?? []).length < 500) break
        }
      })
    }
  }
  for (let inicio = 0; inicio < consultas.length; inicio += 4) {
    await Promise.all(consultas.slice(inicio, inicio + 4).map(consultar => consultar()))
  }
  const bloqueadas = new Map<string, Set<string>>()
  for (const fingerprint of existentes) {
    for (const par of pares.get(fingerprint) ?? []) {
      const ids = bloqueadas.get(par.cobrancaId) ?? new Set<string>()
      ids.add(par.reguaId)
      bloqueadas.set(par.cobrancaId, ids)
    }
  }
  return bloqueadas
}
