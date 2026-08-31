import { NextResponse } from 'next/server'
import { requireAuthenticatedApiUser } from '@/app/api/_lib/auth'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: Context) {
  const autenticacao = await requireAuthenticatedApiUser()
  if (autenticacao.response) return autenticacao.response

  const { id } = await context.params
  const supabase = await createClient()
  const { data: execucao, error } = await supabase.from('agente_execucoes').select(`
    id, condominio_id, status, created_at, iniciado_em, finalizado_em, erro_mensagem,
    arquivos:agente_arquivos(id, status_validacao, created_at)
  `).eq('id', id).maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  if (!execucao) return NextResponse.json({ ok: false, error: 'Execução não encontrada.' }, { status: 404 })

  const arquivos = Array.isArray(execucao.arquivos) ? execucao.arquivos : []
  const { data: conversao } = execucao.condominio_id
    ? await supabase.from('conversoes_relatorio')
      .select('id, status, total_cobrancas, total_parcelas, criado_em, atualizado_em')
      .eq('condominio_id', execucao.condominio_id)
      .like('origem', 'captacao_automatizada:%')
      .gte('criado_em', execucao.created_at)
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle()
    : { data: null }

  const status = String(execucao.status ?? '')
  const conversaoStatus = String(conversao?.status ?? '')
  const falhou = ['falha', 'precisa_intervencao', 'cancelada'].includes(status)
  const concluida = ['concluido', 'concluido_com_alertas'].includes(conversaoStatus)
  let currentStep = 1
  let detail = 'Aguardando o agente remoto assumir a execução'

  if (status === 'em_execucao') {
    currentStep = 2
    detail = 'Agente remoto acessando o portal e captando o relatório'
  } else if (status === 'sucesso' && !arquivos.length) {
    currentStep = 2
    detail = 'Captação concluída; aguardando o arquivo do relatório'
  } else if (arquivos.length && !conversao) {
    currentStep = 3
    detail = 'Arquivo captado; aguardando o motor de conversão'
  } else if (conversao && !concluida) {
    currentStep = 4
    detail = conversaoStatus === 'aguardando_validacao'
      ? 'Conversão pronta; aguardando a importação automática'
      : 'Convertendo e conciliando as cobranças'
  } else if (concluida) {
    currentStep = 5
    detail = 'Importação e régua concluídas'
  }

  return NextResponse.json({
    ok: true,
    state: falhou ? 'error' : concluida ? 'completed' : 'running',
    currentStep,
    detail: falhou ? execucao.erro_mensagem || 'A execução requer intervenção.' : detail,
    execucao: { id: execucao.id, status, iniciadoEm: execucao.iniciado_em, finalizadoEm: execucao.finalizado_em },
    arquivo: arquivos[0] ?? null,
    conversao: conversao ?? null,
  })
}
