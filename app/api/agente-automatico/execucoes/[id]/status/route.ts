import { NextResponse } from 'next/server'
import { requireAuthenticatedApiUser } from '@/app/api/_lib/auth'
import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { applyCarteiraScope } from '@/utils/auth/apply-carteira-scope'
import { resumirMonitor } from '@/features/agente-automatico/monitor'

export const dynamic = 'force-dynamic'
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const autenticacao = await requireAuthenticatedApiUser()
  if (autenticacao.response) return autenticacao.response
  try {
    const { id } = await context.params
    const scope = await getPermittedCarteiras()
    const supabase = await createClient()
    const query = supabase.from('agente_execucoes').select(
      'id, carteira_id, receita_id, condominio_id, status, tentativas, created_at, iniciado_em, finalizado_em, erro_mensagem, arquivos:agente_arquivos(id,nome_arquivo,status_validacao,created_at)'
    ).eq('id', id)
    const { data: execucao, error } = await applyCarteiraScope(query, scope.carteiraIds).maybeSingle()
    if (error) throw error
    if (!execucao) return NextResponse.json({ ok: false, error: 'Execução não encontrada.' }, { status: 404 })
    const admin = createAdminClient()
    const { data: receita, error: receitaError } = await admin.from('agente_receitas').select('script_key').eq('id', execucao.receita_id).maybeSingle()
    if (receitaError) throw receitaError
    const [logsResult, workerResult] = await Promise.all([
      admin.from('agente_logs').select('id,step,nivel,mensagem,created_at').eq('execucao_id', id).order('created_at', { ascending: false }).limit(50),
      receita?.script_key ? admin.from('agente_workers').select('ultimo_sinal_em').eq('script_key', receita.script_key).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ])
    if (logsResult.error) throw logsResult.error
    if (workerResult.error) throw workerResult.error
    const arquivos = [...(execucao.arquivos ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))
    const arquivo = arquivos[0] ?? null
    let conversao = null
    if (execucao.condominio_id) {
      let conversaoQuery = admin.from('conversoes_relatorio').select('id,status,total_cobrancas,total_parcelas,criado_em,atualizado_em')
        .eq('condominio_id', execucao.condominio_id).eq('carteira_id', execucao.carteira_id)
        .gte('criado_em', execucao.created_at).like('origem', 'captacao_automatizada:%')
        .order('criado_em', { ascending: false }).limit(1)
      if (arquivo?.nome_arquivo) conversaoQuery = conversaoQuery.eq('nome_arquivo', arquivo.nome_arquivo)
      const result = await conversaoQuery.maybeSingle()
      if (result.error) throw result.error
      conversao = result.data
    }
    const ultimoSinal = workerResult.data?.ultimo_sinal_em ?? null
    const resumo = resumirMonitor(execucao, arquivo, conversao, ultimoSinal)
    return NextResponse.json({ ok: true, ...resumo, execucao, arquivo, conversao,
      worker: { scriptKey: receita?.script_key ?? null, ultimoSinal, online: resumo.online }, logs: logsResult.data ?? [], consultadoEm: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ ok: false, error: 'Não foi possível atualizar o monitor. Tentaremos novamente.' }, { status: 503 })
  }
}
