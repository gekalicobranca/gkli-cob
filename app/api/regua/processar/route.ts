import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { normalizeRelationsList } from '@/utils/supabase/normalize-relation'
import { carregarEtapasDeReguaAdmin } from '@/features/regua/queries'
import { diasDesdeVencimento, formatDateBR, formatMoneyBR, isCobrancaElegivelParaRegua, montarMensagem, selecionarEtapa } from '@/features/regua/engine'
import type { ReguaTom } from '@/features/regua/types'

function isAuthorized(req: Request) {
  const secret = process.env.REGUA_CRON_SECRET
  if (!secret) return true
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${secret}`
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('cobrancas')
    .select(`
      id,
      carteira_id,
      competencia,
      vencimento,
      valor_atualizado,
      status,
      condominios(id, nome, inicio_cobranca_dias, intensidade_regua, regua_cobranca_id),
      unidades(id, identificacao, responsavel_nome, telefone, email)
    `)
    .in('status', ['novo', 'em cobrança ativa', 'em negociação'])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = normalizeRelationsList((data ?? []) as any[], ['condominios', 'unidades']) as any[]
  let criadas = 0
  let puladas = 0

  for (const row of rows) {
    const condominio = row.condominios
    const unidade = row.unidades
    const inicio = Number(condominio?.inicio_cobranca_dias ?? 30)

    if (!isCobrancaElegivelParaRegua({ vencimento: row.vencimento, inicioCobrancaDias: inicio })) {
      puladas += 1
      continue
    }

    const etapas = await carregarEtapasDeReguaAdmin(condominio?.regua_cobranca_id)
    const diasAtraso = diasDesdeVencimento(row.vencimento)
    const etapa = selecionarEtapa({ etapas, diasAtraso, inicioCobrancaDias: inicio }) ?? etapas[0]
    const intensidade = (condominio?.intensidade_regua ?? etapa?.tom ?? 'medio') as ReguaTom
    const contexto = {
      responsavel: unidade?.responsavel_nome ?? 'responsável',
      unidade: unidade?.identificacao ?? 'unidade',
      condominio: condominio?.nome ?? 'condomínio',
      competencia: row.competencia ?? '',
      vencimento: formatDateBR(row.vencimento),
      valor: formatMoneyBR(row.valor_atualizado),
    }
    const mensagem = montarMensagem({ tipo: 'cobranca', etapa, intensidade, contexto })
    const destinatario = etapa?.canal === 'email' ? unidade?.email : unidade?.telefone

    if (!destinatario) {
      puladas += 1
      await supabase.from('regua_execucoes').insert({
        carteira_id: row.carteira_id,
        cobranca_id: row.id,
        tipo: 'cobranca',
        canal: etapa?.canal ?? 'whatsapp',
        status: 'pulado',
        erro_msg: 'Responsável sem destinatário para o canal selecionado.',
        payload: { mensagem, destinatario, contexto, etapa_default_id: etapa?.id },
      } as any)
      continue
    }

    await supabase.from('regua_execucoes').insert({
      carteira_id: row.carteira_id,
      cobranca_id: row.id,
      regua_etapa_id: etapa?.id?.startsWith('default-') ? null : etapa?.id,
      tipo: 'cobranca',
      canal: etapa?.canal ?? 'whatsapp',
      status: 'pendente',
      payload: { mensagem, destinatario, contexto, etapa_default_id: etapa?.id },
    } as any)

    await supabase.from('mensagens').insert({
      carteira_id: row.carteira_id,
      contexto: 'regua_cobranca',
      canal: etapa?.canal ?? 'whatsapp',
      destinatario,
      conteudo: mensagem,
      status: 'pendente',
      scheduled_at: new Date().toISOString(),
    } as any)

    criadas += 1
  }

  return NextResponse.json({ ok: true, criadas, puladas })
}

export async function GET(req: Request) {
  return POST(req)
}
