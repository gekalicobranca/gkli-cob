'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { requireRole } from '@/utils/auth/require-role'
import {
  estimatePriority,
  getFirst,
  normalizeDate,
  normalizeKey,
  onlyDigits,
  parseMoney,
} from './preview-rules'


type CondominioImportacaoRow = {
  id: string
  carteira_id: string
  nome: string
  cnpj: string | null
}

type UnidadeImportacaoRow = {
  id: string
  condominio_id: string
  carteira_id: string
  identificacao: string
  bloco: string | null
}

function splitCsvLine(line: string) {
  const delimiter = line.includes(';') ? ';' : ','
  return line.split(delimiter).map((item) => item.trim().replace(/^"|"$/g, ''))
}

function parseCsv(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length < 2) return []

  const headers = splitCsvLine(lines[0]).map(normalizeKey)

  return lines.slice(1).map((line, index) => {
    const values = splitCsvLine(line)
    const payload: Record<string, string> = {}

    headers.forEach((header, headerIndex) => {
      payload[header] = values[headerIndex] ?? ''
    })

    return {
      linha: index + 2,
      payload,
    }
  })
}

function buildImportacaoPayload(tipo: string, raw: Record<string, string>) {
  if (tipo === 'cobrancas') {
    const condominioCnpj = onlyDigits(
      getFirst(raw, ['condominio_cnpj', 'cnpj_condominio', 'cnpj'])
    )
    const unidade = getFirst(raw, ['unidade', 'identificacao', 'numero'])
    const bloco = getFirst(raw, ['bloco'])
    const responsavelNome = getFirst(raw, ['responsavel_nome', 'responsavel', 'nome'])
    const responsavelDocumento = onlyDigits(
      getFirst(raw, ['responsavel_documento', 'documento', 'cpf', 'cpf_cnpj'])
    )
    const telefone = onlyDigits(getFirst(raw, ['telefone', 'celular', 'whatsapp']))
    const email = getFirst(raw, ['email', 'e_mail'])
    const competencia = getFirst(raw, ['competencia', 'referencia', 'mes'])
    const vencimento = normalizeDate(getFirst(raw, ['vencimento', 'data_vencimento']))
    const valorOriginal = parseMoney(
      getFirst(raw, ['valor_original', 'valor', 'valor_devido', 'valor_atualizado'])
    )
    const valorAtualizado = parseMoney(
      getFirst(raw, ['valor_atualizado', 'valor_corrigido'])
    ) || valorOriginal

    return {
      condominio_cnpj: condominioCnpj,
      unidade,
      bloco,
      responsavel_nome: responsavelNome,
      responsavel_documento: responsavelDocumento,
      telefone,
      email,
      competencia,
      vencimento,
      valor_original: valorOriginal,
      valor_atualizado: valorAtualizado,
      observacoes: getFirst(raw, ['observacoes', 'obs']),
    }
  }

  return raw
}

async function enrichCobrancaPreview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: Array<{ linha: number; payload: Record<string, any> }>
) {
  const cnpjs = [
    ...new Set(
      rows
        .map((row) => onlyDigits(row.payload.condominio_cnpj ?? ''))
        .filter(Boolean)
    ),
  ]

  const { data: condominios, error: condominiosError } = await supabase
    .from('condominios')
    .select('id, carteira_id, nome, cnpj')
    .in('cnpj', cnpjs.length > 0 ? cnpjs : ['__none__'])

  if (condominiosError) {
    throw new Error(`Erro ao consultar condomínios por CNPJ: ${condominiosError.message}`)
  }

  const condominiosRows = (condominios ?? []) as CondominioImportacaoRow[]

  const condominiosByCnpj = new Map<string, CondominioImportacaoRow>(
    condominiosRows.map((condominio) => [
      onlyDigits(condominio.cnpj ?? ''),
      condominio,
    ])
  )

  const condominioIds = [...new Set(condominiosRows.map((item) => item.id))]

  const { data: unidades, error: unidadesError } = await supabase
    .from('unidades')
    .select('id, condominio_id, carteira_id, identificacao, bloco')
    .in('condominio_id', condominioIds.length > 0 ? condominioIds : ['00000000-0000-0000-0000-000000000000'])

  if (unidadesError) {
    throw new Error(`Erro ao consultar unidades: ${unidadesError.message}`)
  }

  const unidadeKey = (params: {
    condominio_id: string
    identificacao: string
    bloco?: string | null
  }) =>
    `${params.condominio_id}|${String(params.bloco ?? '').trim().toLowerCase()}|${String(params.identificacao ?? '').trim().toLowerCase()}`

  const unidadesRows = (unidades ?? []) as UnidadeImportacaoRow[]

  const unidadesByKey = new Map<string, UnidadeImportacaoRow>(
    unidadesRows.map((unidade) => [
      unidadeKey({
        condominio_id: unidade.condominio_id,
        identificacao: unidade.identificacao,
        bloco: unidade.bloco,
      }),
      unidade,
    ])
  )

  return rows.map((row) => {
    const payload = row.payload
    const erros: string[] = []
    const alertas: string[] = []

    const condominioCnpj = onlyDigits(payload.condominio_cnpj ?? '')

    if (!condominioCnpj) {
      erros.push('CNPJ do condomínio vazio')
    }

    if (condominioCnpj && condominioCnpj.length !== 14) {
      erros.push('CNPJ do condomínio inválido')
    }

    const condominio = condominiosByCnpj.get(condominioCnpj)

    if (!condominio) {
      erros.push('Condomínio não encontrado pelo CNPJ')
    }

    if (!payload.unidade) {
      erros.push('Unidade vazia')
    }

    if (!payload.vencimento) {
      erros.push('Vencimento vazio')
    }

    if (payload.valor_original <= 0) {
      erros.push('Valor original inválido')
    }

    let unidade = null
    let unidadeNova = false

    if (condominio && payload.unidade) {
      unidade = unidadesByKey.get(
        unidadeKey({
          condominio_id: condominio.id,
          identificacao: payload.unidade,
          bloco: payload.bloco,
        })
      )

      if (!unidade) {
        unidadeNova = true
        alertas.push('Unidade não encontrada: será criada na confirmação')
      }
    }

    if (!payload.telefone && !payload.email) {
      alertas.push('Sem telefone/e-mail: menor chance de conversão')
    }

    const blocked = erros.length > 0
    const priority = estimatePriority({
      valor: Number(payload.valor_atualizado ?? payload.valor_original ?? 0),
      vencimento: payload.vencimento,
      blocked,
    })

    return {
      linha: row.linha,
      payload: {
        ...payload,
        carteira_id: condominio?.carteira_id ?? null,
        condominio_id: condominio?.id ?? null,
        condominio_nome: condominio?.nome ?? null,
        unidade_id: unidade?.id ?? null,
        unidade_nova: unidadeNova,
        prioridade_estimada: priority.prioridade,
        score_estimado: priority.score,
        acao_sugerida: priority.acao,
        motivo_prioridade: priority.motivo,
      },
      valido: !blocked,
      erros,
      alertas,
    }
  })
}

function validateSimplePayload(tipo: string, payload: Record<string, string>) {
  const erros: string[] = []

  if (tipo === 'condominios') {
    if (!payload.nome) erros.push('Nome vazio')
    const cnpj = onlyDigits(payload.cnpj ?? '')
    if (!cnpj) erros.push('CNPJ vazio')
    if (cnpj && cnpj.length !== 14) erros.push('CNPJ inválido')
  }

  if (tipo === 'unidades') {
    if (!payload.condominio_cnpj && !payload.cnpj) erros.push('CNPJ do condomínio vazio')
    if (!payload.identificacao && !payload.unidade) erros.push('Identificação vazia')
  }

  return erros
}

export async function createImportacaoPreview(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])

  const tipo = String(formData.get('tipo') ?? '')
  const file = formData.get('arquivo')

  if (!['condominios', 'unidades', 'cobrancas'].includes(tipo)) {
    throw new Error('Tipo de importação inválido nesta fase.')
  }

  if (!(file instanceof File)) {
    throw new Error('Arquivo obrigatório.')
  }

  const text = await file.text()
  const parsedRows = parseCsv(text)

  if (parsedRows.length === 0) {
    throw new Error('CSV vazio ou sem linhas válidas.')
  }

  const supabase = await createClient()

  let itens: Array<{
    linha: number
    payload: Record<string, any>
    valido: boolean
    erros: string[]
    alertas?: string[]
  }>

  if (tipo === 'cobrancas') {
    const rows = parsedRows.map((row) => ({
      linha: row.linha,
      payload: buildImportacaoPayload(tipo, row.payload),
    }))

    itens = await enrichCobrancaPreview(supabase, rows)
  } else {
    itens = parsedRows.map((row) => {
      const payload = {
        ...row.payload,
        cnpj: onlyDigits(row.payload.cnpj ?? row.payload.condominio_cnpj ?? ''),
      }
      const erros = validateSimplePayload(tipo, payload)

      return {
        linha: row.linha,
        payload,
        valido: erros.length === 0,
        erros,
        alertas: [],
      }
    })
  }

  const totalValidas = itens.filter((item) => item.valido).length
  const totalInvalidas = itens.length - totalValidas
  const totalAlertas = itens.filter((item) => (item.alertas ?? []).length > 0).length

  const valorTotalValido =
    tipo === 'cobrancas'
      ? itens
          .filter((item) => item.valido)
          .reduce((sum, item) => sum + Number(item.payload.valor_atualizado ?? 0), 0)
      : 0

  const prioridadeAlta =
    tipo === 'cobrancas'
      ? itens.filter((item) => item.payload.prioridade_estimada === 'alta').length
      : 0

  const unidadesNovas =
    tipo === 'cobrancas'
      ? itens.filter((item) => item.payload.unidade_nova).length
      : 0

  const { data: importacao, error } = await supabase
    .from('importacoes')
    .insert({
      carteira_id: null,
      tipo,
      arquivo_nome: file.name,
      status: totalInvalidas > 0 ? 'com erro' : 'preview',
      total_linhas: itens.length,
      total_validas: totalValidas,
      total_invalidas: totalInvalidas,
      resumo: {
        valor_total_valido: valorTotalValido,
        prioridade_alta: prioridadeAlta,
        unidades_novas: unidadesNovas,
        linhas_com_alerta: totalAlertas,
        regra_chave: 'CNPJ do condomínio obrigatório; sem match não importa.',
      },
    })
    .select('id')
    .single()

  if (error) {
    throw new Error(`Erro ao criar importação: ${error.message}`)
  }

  const { error: itensError } = await supabase.from('importacao_itens').insert(
    itens.map((item) => ({
      importacao_id: importacao.id,
      linha: item.linha,
      payload: item.payload,
      valido: item.valido,
      erros: [...item.erros, ...(item.alertas ?? []).map((alerta) => `ALERTA: ${alerta}`)],
    }))
  )

  if (itensError) {
    throw new Error(`Erro ao criar itens da importação: ${itensError.message}`)
  }

  revalidatePath('/app/importacoes')
  redirect(`/app/importacoes/${importacao.id}`)
}

export async function confirmarImportacao(formData: FormData) {
  await requireRole(['admin', 'gestor', 'operador'])

  const importacaoId = String(formData.get('importacao_id') ?? '')

  if (!importacaoId) {
    throw new Error('Importação obrigatória.')
  }

  const supabase = await createClient()

  const { data: importacao, error: importacaoError } = await supabase
    .from('importacoes')
    .select('id, tipo, status')
    .eq('id', importacaoId)
    .maybeSingle()

  if (importacaoError) {
    throw new Error(`Erro ao carregar importação: ${importacaoError.message}`)
  }

  if (!importacao) {
    throw new Error('Importação não encontrada.')
  }

  if (importacao.status === 'concluida') {
    throw new Error('Importação já concluída.')
  }

  const { data: itens, error: itensError } = await supabase
    .from('importacao_itens')
    .select('payload')
    .eq('importacao_id', importacaoId)
    .eq('valido', true)

  if (itensError) {
    throw new Error(`Erro ao carregar itens válidos: ${itensError.message}`)
  }

  const payloads = (itens ?? []).map((item: any) => item.payload)

  if (payloads.length === 0) {
    throw new Error('Não há itens válidos para importar.')
  }

  if (importacao.tipo === 'cobrancas') {
    const unidadesParaCriar = payloads.filter((payload: any) => payload.unidade_nova)

    for (const payload of unidadesParaCriar) {
      const { data: novaUnidade, error: unidadeError } = await supabase
        .from('unidades')
        .insert({
          carteira_id: payload.carteira_id,
          condominio_id: payload.condominio_id,
          identificacao: payload.unidade,
          bloco: payload.bloco || null,
          responsavel_nome: payload.responsavel_nome || null,
          responsavel_documento: payload.responsavel_documento || null,
          telefone: payload.telefone || null,
          email: payload.email || null,
          status: 'ativa',
          observacoes: 'Criada por importação de cobranças.',
        })
        .select('id')
        .single()

      if (unidadeError) {
        throw new Error(`Erro ao criar unidade da linha importada: ${unidadeError.message}`)
      }

      payload.unidade_id = novaUnidade.id
    }

    const rows = payloads.map((payload: any) => ({
      carteira_id: payload.carteira_id,
      condominio_id: payload.condominio_id,
      unidade_id: payload.unidade_id,
      competencia: payload.competencia || null,
      vencimento: payload.vencimento,
      valor_original: Number(payload.valor_original),
      valor_atualizado: Number(payload.valor_atualizado || payload.valor_original),
      status: 'novo',
      observacoes: payload.observacoes || null,
    }))

    const { error } = await supabase.from('cobrancas').insert(rows)

    if (error) {
      throw new Error(`Erro ao importar cobranças: ${error.message}`)
    }
  }

  if (importacao.tipo === 'condominios') {
    const rows = payloads.map((payload: any) => ({
      carteira_id: payload.carteira_id || null,
      nome: payload.nome,
      cnpj: onlyDigits(payload.cnpj),
      administradora: payload.administradora || null,
      vencimento_cota_dia: Number(payload.vencimento_cota_dia || 10),
      valor_cota_condominial: parseMoney(payload.valor_cota_condominial),
      inicio_cobranca_dias: Number(payload.inicio_cobranca_dias || 30),
      status: 'ativo',
      observacoes: payload.observacoes || null,
    }))

    const { error } = await supabase.from('condominios').insert(rows)

    if (error) {
      throw new Error(`Erro ao importar condomínios: ${error.message}`)
    }
  }

  if (importacao.tipo === 'unidades') {
    throw new Error('Importação autônoma de unidades por CNPJ será refinada na próxima etapa.')
  }

  const { error: updateError } = await supabase
    .from('importacoes')
    .update({ status: 'concluida' })
    .eq('id', importacaoId)

  if (updateError) {
    throw new Error(`Erro ao concluir importação: ${updateError.message}`)
  }

  revalidatePath('/app/importacoes')
  revalidatePath(`/app/importacoes/${importacaoId}`)
  revalidatePath('/app/cobrancas')
  revalidatePath('/app/condominios')
  revalidatePath('/app/unidades')
  revalidatePath('/app')
  redirect(`/app/importacoes/${importacaoId}`)
}
