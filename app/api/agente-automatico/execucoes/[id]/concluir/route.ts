import { NextRequest, NextResponse } from 'next/server'
import { requireCronSecret } from '@/app/api/_lib/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { processarRelatorioCaptado } from '@/features/captacao-automatizada/processar-relatorio'
import { POST as confirmarConversao } from '@/app/api/conversao-relatorio/confirmar/route'
import { enfileirarMontagemMaestro } from '@/features/flows/cobranca/maestro-montagem'

export const runtime = 'nodejs'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const unauthorized = requireCronSecret(request)
  if (unauthorized) return unauthorized
  const { id } = await context.params
  const db = createAdminClient()
  try {
    const { data: execucao, error } = await db.from('agente_execucoes')
      .select('id, origem, condominio_id, carteira_id, status').eq('id', id).single()
    if (error || !execucao) throw new Error(error?.message || 'Execução não encontrada.')
    if (!['maestro', 'maestro_agendada', 'agenda_mensal'].includes(execucao.origem ?? '')) {
      return NextResponse.json({ ok: false, error: 'Execução não foi disparada pelo Maestro.' }, { status: 403 })
    }
    if (!execucao.condominio_id || !['em_execucao', 'sucesso'].includes(execucao.status)) {
      throw new Error('Execução sem condomínio ou fora da etapa de conclusão.')
    }
    const { data: arquivo, error: arquivoError } = await db.from('agente_arquivos')
      .select('id, nome_arquivo, storage_path, status_validacao').eq('execucao_id', id)
      .order('created_at', { ascending: false }).limit(1).single()
    if (arquivoError || !arquivo) throw new Error(arquivoError?.message || 'Arquivo não encontrado.')
    if (!['aguardando_validacao', 'validado'].includes(arquivo.status_validacao)) {
      throw new Error('Arquivo não está disponível para validação automática.')
    }
    const { data: existente, error: existenteError } = await db.from('conversoes_relatorio')
      .select('id, condominio_id, carteira_id').eq('id', arquivo.id).maybeSingle()
    if (existenteError) throw new Error(existenteError.message)
    if (existente && (existente.condominio_id !== execucao.condominio_id || existente.carteira_id !== execucao.carteira_id)) {
      throw new Error('Conversão não corresponde ao condomínio e carteira da execução.')
    }
    if (!existente) {
      const { data: download, error: downloadError } = await db.storage.from('agente-relatorios').download(arquivo.storage_path)
      if (downloadError || !download) throw new Error(downloadError?.message || 'Falha ao baixar relatório.')
      const resumo = await processarRelatorioCaptado({ buffer: Buffer.from(await download.arrayBuffer()), nomeArquivo: arquivo.nome_arquivo }, {
        condominioId: execucao.condominio_id, conversaoId: arquivo.id,
      })
      if (resumo.carteiraId !== execucao.carteira_id) throw new Error('Carteira do condomínio diverge da execução.')
    }
    const response = await confirmarConversao(new NextRequest(new URL('/api/conversao-relatorio/confirmar', request.url), {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: request.headers.get('authorization')! },
      body: JSON.stringify({ conversaoId: arquivo.id, condominioId: execucao.condominio_id, carteiraId: execucao.carteira_id, limparCobrancasAnteriores: false }),
    }))
    const result = await response.json()
    if (!response.ok || !result.ok) throw new Error(result.error || 'Falha na importação.')
    await enfileirarMontagemMaestro(id, arquivo.id)
    const { error: updateError } = await db.from('agente_arquivos').update({ status_validacao: 'validado' }).eq('id', arquivo.id)
    if (updateError) throw new Error(updateError.message)
    const { error: logError } = await db.from('agente_logs').insert({
      execucao_id: id, nivel: 'info', step: 'importacao_automatica',
      mensagem: 'Relatório validado e importado automaticamente por disparo do Maestro.',
      metadata_json: { conversao_id: arquivo.id },
    })
    if (logError) throw new Error(logError.message)
    return NextResponse.json({ ok: true, conversaoId: arquivo.id, montagemFlows: 'enfileirada' })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Falha ao concluir execução.' }, { status: 500 })
  }
}
