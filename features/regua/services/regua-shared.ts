import { LOTE_STATUS } from '@/lib/core/status'

export type ReguaContadores = {
  avaliadas: number
  criadas: number
  puladas: number
  duplicadas: number
  erros: number
}

export type ReguaLoteContext = {
  id: string
  carteiraId?: string
  contadores: ReguaContadores
}

export type DestinatarioPreferencialRegua = 'proprietario' | 'inquilino' | 'qualquer'

type UnidadeContato = {
  responsavel_nome?: string | null
  telefone?: string | null
  email?: string | null
}

type ResponsavelApoioContato = UnidadeContato & {
  tipo_responsavel?: string | null
}

export function normalizarDestinatarioPreferencial(value?: string | null): DestinatarioPreferencialRegua {
  if (value === 'inquilino' || value === 'qualquer') return value
  return 'proprietario'
}

function normalizarTipoResponsavel(value?: string | null) {
  const tipo = String(value ?? '').trim().toLowerCase()
  if (tipo === 'inquilino') return 'inquilino'
  if (tipo === 'proprietario' || tipo === 'proprietário') return 'proprietario'
  return 'nao_informado'
}

export function escolherContatoRegua(params: {
  unidade?: UnidadeContato | null
  apoio?: ResponsavelApoioContato | null
  canal?: string | null
  preferencia?: string | null
}) {
  const preferencia = normalizarDestinatarioPreferencial(params.preferencia)
  const unidade = params.unidade ?? {}
  const apoio = params.apoio ?? null
  const canal = params.canal === 'email' ? 'email' : 'whatsapp'

  const candidatos = [
    apoio
      ? {
          nome: apoio.responsavel_nome ?? unidade.responsavel_nome ?? null,
          telefone: apoio.telefone ?? null,
          email: apoio.email ?? null,
          tipo: normalizarTipoResponsavel(apoio.tipo_responsavel),
          origem: 'responsaveis_unidades',
        }
      : null,
    {
      nome: unidade.responsavel_nome ?? null,
      telefone: unidade.telefone ?? null,
      email: unidade.email ?? null,
      tipo: 'nao_informado',
      origem: 'unidades',
    },
  ].filter(Boolean) as Array<{
    nome: string | null
    telefone: string | null
    email: string | null
    tipo: string
    origem: string
  }>

  const preferidos = preferencia === 'qualquer'
    ? candidatos
    : candidatos.filter((contato) => contato.tipo === preferencia)
  const ordenados = [
    ...preferidos,
    ...candidatos.filter((contato) => !preferidos.includes(contato)),
  ]
  const escolhido = ordenados.find((contato) => canal === 'email' ? contato.email : contato.telefone) ?? ordenados[0] ?? null

  return {
    nome: escolhido?.nome ?? unidade.responsavel_nome ?? 'responsável',
    telefone: escolhido?.telefone ?? null,
    email: escolhido?.email ?? null,
    destinatario: canal === 'email' ? escolhido?.email ?? null : escolhido?.telefone ?? null,
    tipoResponsavel: escolhido?.tipo ?? 'nao_informado',
    origem: escolhido?.origem ?? null,
    preferencia,
  }
}

export async function carregarPreferenciasDestinatarioReguas(
  supabase: any,
  reguaIds: Array<string | null | undefined>,
) {
  const ids = [...new Set(reguaIds.filter(Boolean) as string[])]
  if (!ids.length) return new Map<string, DestinatarioPreferencialRegua>()

  const { data, error } = await supabase
    .from('reguas')
    .select('id, destinatario_preferencial')
    .in('id', ids)

  if (error) return new Map<string, DestinatarioPreferencialRegua>()
  return new Map(
    ((data ?? []) as any[]).map((row) => [
      row.id,
      normalizarDestinatarioPreferencial(row.destinatario_preferencial),
    ]),
  )
}

export function novoContador(): ReguaContadores {
  return { avaliadas: 0, criadas: 0, puladas: 0, duplicadas: 0, erros: 0 }
}

export function cicloReferencia(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function normalizarEtapaId(etapaId?: string | null) {
  if (!etapaId) return null
  return etapaId.startsWith('default-') ? null : etapaId
}

export function criarReguaFingerprint(params: {
  contexto: 'regua_cobranca' | 'regua_acordo'
  entidadeId: string
  etapaId?: string | null
  canal: string
  ciclo: string
}) {
  return [
    params.contexto,
    params.entidadeId,
    params.etapaId ?? 'sem_etapa',
    params.canal,
    params.ciclo,
  ].join(':')
}

export function statusFinalDoLote(contadores: ReguaContadores, fallback = LOTE_STATUS.PENDENTE_APROVACAO) {
  return contadores.erros > 0 ? LOTE_STATUS.CONCLUIDO_COM_FALHAS : fallback
}

export function resumoContadores(contadores: ReguaContadores, extras: Record<string, unknown> = {}) {
  return {
    ...extras,
    total_avaliadas: contadores.avaliadas,
    total_criadas: contadores.criadas,
    total_puladas: contadores.puladas,
    total_duplicadas: contadores.duplicadas,
    total_erros: contadores.erros,
  }
}

export function incrementarContador(
  total: ReguaContadores,
  lote: ReguaContadores,
  key: keyof ReguaContadores,
) {
  total[key] += 1
  lote[key] += 1
}
