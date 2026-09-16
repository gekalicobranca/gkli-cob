import { createAdminClient } from '@/utils/supabase/admin'
import { analiseResumida } from '@/features/condominios/relatorio-inadimplencia/leitura'
import {
  competenciaDaDataBase,
  contextoFromGkitJurSnapshot,
  fetchGkitJurRelatorioInadimplencia,
  snapshotErroGkitJur,
  snapshotSucessoGkitJur,
  temMesmoCnpjDoJur,
} from '@/features/condominios/relatorio-inadimplencia/gkit-jur'

type AdminClient = ReturnType<typeof createAdminClient>
type Logger = Pick<typeof console, 'log' | 'error'>

async function claimPendente(db: AdminClient) {
  const { data: item, error } = await db.from('relatorios_inadimplencia_unificados')
    .select('id, carteira_id, condominio_id, conversao_relatorio_id, tentativas, competencia')
    .eq('status', 'pendente')
    .lte('elegivel_em', new Date().toISOString())
    .order('elegivel_em', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!item) return null

  const { data: claimed, error: claimError } = await db.from('relatorios_inadimplencia_unificados')
    .update({ status: 'processando', iniciado_em: new Date().toISOString(), atualizado_em: new Date().toISOString(), tentativas: Number(item.tentativas ?? 0) + 1 })
    .eq('id', item.id)
    .eq('status', 'pendente')
    .select('id, carteira_id, condominio_id, conversao_relatorio_id, competencia')
    .maybeSingle()
  if (claimError) throw claimError
  return claimed
}

async function processarUm(db: AdminClient, item: any, logger: Logger) {
  const { data: conversao, error: conversaoError } = await db.from('conversoes_relatorio')
    .select('id, nome_arquivo, preview_json, carteira_id, condominio_id')
    .eq('id', item.conversao_relatorio_id)
    .maybeSingle()
  if (conversaoError) throw conversaoError
  if (!conversao) throw new Error('Conversão financeira não encontrada.')

  const { data: condominio, error: condominioError } = await db.from('condominios')
    .select('id, nome, cnpj')
    .eq('id', item.condominio_id)
    .maybeSingle()
  if (condominioError) throw condominioError
  if (!condominio?.cnpj) throw new Error('Condomínio sem CNPJ para consulta ao GKIT-Jur.')

  const preview: any = conversao.preview_json ?? {}
  const analise = preview.analiseInadimplencia ?? analiseResumida(preview.rankingMensal, conversao.nome_arquivo)
  const competencia = item.competencia || competenciaDaDataBase(analise.dataBase)
  const cnpj = String(condominio.cnpj).replace(/\D/g, '')

  try {
    const response = await fetchGkitJurRelatorioInadimplencia({ cnpj, competencia })
    if (!temMesmoCnpjDoJur(response, cnpj)) throw new Error('O GKIT-Jur retornou cliente com CNPJ diferente do condomínio.')
    const snapshot = snapshotSucessoGkitJur({ cnpj, competencia, response })
    const contextoJur = contextoFromGkitJurSnapshot(snapshot)
    const contextoAtual = preview.relatorioInadimplenciaContexto ?? {}
    const previewAtualizado = {
      ...preview,
      relatorioInadimplenciaContexto: {
        ...contextoAtual,
        ...contextoJur,
        fontes: [...(contextoAtual.fontes ?? []), ...(contextoJur.fontes ?? [])],
        atualizadoEm: new Date().toISOString(),
      },
    }

    const { error: updateConversaoError } = await db.from('conversoes_relatorio')
      .update({ preview_json: previewAtualizado, atualizado_em: new Date().toISOString() })
      .eq('id', conversao.id)
    if (updateConversaoError) throw updateConversaoError

    const { error: updateMarcadorError } = await db.from('relatorios_inadimplencia_unificados')
      .update({
        status: 'pronto',
        finalizado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
        jur_consulta_status: 'sucesso',
        jur_consultado_em: snapshot.consultadoEm,
        jur_snapshot_json: snapshot as any,
        preview_json: { contextoAtualizado: true, processos: response.processos.todos.length, preJuridicos: response.preJuridicos.length },
        erro_mensagem: null,
      })
      .eq('id', item.id)
    if (updateMarcadorError) throw updateMarcadorError
    logger.log(`Relatório unificado pronto: ${condominio.nome} (${competencia})`)
    return { id: item.id, condominio: condominio.nome, status: 'pronto' as const }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao processar relatório unificado.'
    const snapshot = snapshotErroGkitJur({ cnpj, competencia, erro: message })
    const contextoJur = contextoFromGkitJurSnapshot(snapshot)
    const previewAtualizado = {
      ...preview,
      relatorioInadimplenciaContexto: {
        ...(preview.relatorioInadimplenciaContexto ?? {}),
        ...contextoJur,
        atualizadoEm: new Date().toISOString(),
      },
    }
    await db.from('conversoes_relatorio')
      .update({ preview_json: previewAtualizado, atualizado_em: new Date().toISOString() })
      .eq('id', conversao.id)
    await db.from('relatorios_inadimplencia_unificados')
      .update({
        status: 'erro',
        finalizado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
        jur_consulta_status: 'erro',
        jur_consultado_em: snapshot.jurConsultadoEm,
        jur_snapshot_json: snapshot as any,
        erro_mensagem: message,
      })
      .eq('id', item.id)
    logger.log(`Relatório unificado com erro: ${condominio.nome} (${competencia}) - ${message}`)
    return { id: item.id, condominio: condominio.nome, status: 'erro' as const, erro: message }
  }
}

export async function processarRelatoriosInadimplenciaPendentes(input: { limit?: number; logger?: Logger } = {}) {
  const limit = Math.max(1, Math.min(50, Number(input.limit ?? process.env.RELATORIO_INADIMPLENCIA_LIMIT ?? 10)))
  const logger = input.logger ?? console
  const db = createAdminClient()
  const resultados = []
  while (resultados.length < limit) {
    const item = await claimPendente(db)
    if (!item) break
    resultados.push(await processarUm(db, item, logger))
  }
  return { processados: resultados.length, resultados }
}
