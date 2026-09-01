import { NextResponse } from 'next/server'
import { requireAuthenticatedApiUser } from '@/app/api/_lib/auth'
import { createAdminClient } from '@/utils/supabase/admin'
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
    arquivos:agente_arquivos(id, nome_arquivo, status_validacao, created_at)
  `).eq('id', id).maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  if (!execucao) return NextResponse.json({ ok: false, error: 'Execução não encontrada.' }, { status: 404 })

  const arquivos = Array.isArray(execucao.arquivos)
    ? [...execucao.arquivos].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    : []
  const arquivo = arquivos[0] ?? null
  const admin = createAdminClient()
  let conversaoQuery = admin.from('conversoes_relatorio')
    .select('id, status, total_cobrancas, total_parcelas, criado_em, atualizado_em')
    .like('origem', 'captacao_automatizada:%')
    .order('criado_em', { ascending: false })
    .limit(1)

  conversaoQuery = arquivo?.nome_arquivo
    ? conversaoQuery.eq('nome_arquivo', arquivo.nome_arquivo)
    : conversaoQuery.eq('condominio_id', execucao.condominio_id).gte('criado_em', execucao.created_at)

  const { data: conversao } = await conversaoQuery.maybeSingle()

  const status = String(execucao.status ?? '')
  const conversaoStatus = String(conversao?.status ?? '')
  const falhou = ['falha', 'precisa_intervencao', 'cancelada'].includes(status)
  const concluida = ['concluido', 'concluido_com_alertas'].includes(conversaoStatus)
  const referenciaAtividade = conversao?.atualizado_em || conversao?.criado_em || execucao.finalizado_em || execucao.iniciado_em || execucao.created_at
  const minutosSemAvanco = Math.max(0, (Date.now() - new Date(referenciaAtividade).getTime()) / 60_000)
  const travada = status === 'sucesso' && arquivos.length > 0 && !concluida && minutosSemAvanco >= 5
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
    detail = conversaoStatus === 'concluido_com_alertas'
      ? 'Importação e régua concluídas com alertas'
      : 'Importação e régua concluídas'
  }

  if (travada) {
    detail = conversao
      ? 'A conversão não avançou nos últimos 5 minutos. Verifique os alertas do Maestro.'
      : 'O arquivo foi captado, mas a conversão não iniciou em até 5 minutos.'
  }

  return NextResponse.json({
    ok: true,
    state: falhou || travada ? 'error' : concluida ? 'completed' : 'running',
    currentStep,
    detail: falhou ? execucao.erro_mensagem || 'A execução requer intervenção.' : detail,
    execucao: { id: execucao.id, status, iniciadoEm: execucao.iniciado_em, finalizadoEm: execucao.finalizado_em },
    arquivo,
    conversao: conversao ?? null,
  })
}
