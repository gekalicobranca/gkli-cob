import { escolherContatoRegua } from '@/features/regua/services/regua-shared'
import { motivoSaneamentoMaestro } from './maestro-elegibilidade'

// As pendências salvas retratam a montagem, não o cadastro atual.
export function motivosSaneamentoAtuais(rows: any[], montagens: any[], apoios: any[], preferencias: Map<string, string>) {
  const cobrancas = new Map(rows.map(row => [row.id, row]))
  const motivos = new Map<string, string>()
  const normalizar = (value: unknown) => String(value ?? '').trim().toLowerCase()
  for (const job of montagens) {
    for (const pendencia of job.pendencias ?? []) {
      if (!pendencia.saneamento) continue
      const row = cobrancas.get(pendencia.cobranca_id)
      if (!row) continue
      const unidade = Array.isArray(row.unidade) ? row.unidade[0] : row.unidade
      const contatos = apoios.filter(apoio => apoio.condominio_id === row.condominio_id
        && normalizar(apoio.unidade) === normalizar(unidade?.identificacao)
        && (!apoio.bloco || normalizar(apoio.bloco) === normalizar(unidade?.bloco)))
      const contato = escolherContatoRegua({ unidade, apoios: contatos, canal: 'email', preferencia: preferencias.get(job.regua_id) })
      const motivo = motivoSaneamentoMaestro(unidade?.responsavel_nome, contato.destinatario)
      if (motivo) motivos.set(row.id, motivo)
    }
  }
  return motivos
}
