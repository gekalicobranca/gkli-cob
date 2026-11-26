import type { createAdminClient } from "@/utils/supabase/admin"
import { reciboSemPonto } from "./identidade-recibo"

type Linha = {
  unidade: string
  bloco?: string
  recibo: string
  vencimento: string
  valorPrincipal: number
  chavePlanilhaLello?: string
  unidadeReciboLello?: string
}
type Cadastro = {
  unidade_id: string
  unidades: { identificacao: string; bloco: string | null }
  vencimento: string | null
  valor_original: number | null
  observacoes: string | null
  origem_importacao: string | null
  arquivada_em?: string | null
}

function escopoUnidade(bloco: string | null | undefined, unidade: string) {
  return JSON.stringify([bloco?.trim() ?? "", unidade.trim().toUpperCase().replace(/^0+(?=\d)/, "")])
}

// A chave da planilha identifica unidade e data; dois lançamentos podem compartilhá-la.
export function resolverRecibosLello<T extends Linha>(linhas: T[], cadastro: Cadastro[]) {
  const porData = new Map<string, Cadastro[]>()
  for (const cota of cadastro) {
    if (cota.arquivada_em || !cota.unidades || !cota.vencimento) continue
    const chave = escopoUnidade(cota.unidades.bloco, cota.unidades.identificacao) + "|" + cota.vencimento
    const grupo = porData.get(chave) ?? []
    grupo.push(cota)
    porData.set(chave, grupo)
  }
  const usados = new Set<string>()
  return linhas.map(linha => {
    const legado = linha.chavePlanilhaLello ?? linha.recibo
    const [dia, mes, ano] = String(linha.vencimento ?? "").split("/")
    const codigo = /^LELLO-(\d+)-/.exec(legado)?.[1]
    const revisar = () => new Error(`Lello · unidade ${linha.unidade}, vencimento ${linha.vencimento}: confira o recibo no portal. A planilha não identifica a cota de forma única.`)
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(linha.vencimento) || !codigo || legado !== `LELLO-${codigo}-${linha.unidade}-${ano}${mes}${dia}`) throw revisar()
    const unidade = escopoUnidade(linha.bloco, linha.unidade)
    const chave = unidade + `|${ano}-${mes}-${dia}`
    const grupo = porData.get(chave) ?? []
    if (new Set(grupo.map(cota => cota.unidade_id)).size > 1) throw revisar()
    if (!Number.isFinite(linha.valorPrincipal) || linha.valorPrincipal <= 0) throw revisar()
    const candidatas = grupo.filter(cota => cota.valor_original != null &&
      Math.round(Number(cota.valor_original) * 100) === Math.round(linha.valorPrincipal * 100))
    if (candidatas.length > 1 || (grupo.length > 0 && !candidatas.length)) throw revisar()
    const cota = candidatas[0]
    let recibo = legado
    if (cota) {
      const obs = cota.observacoes ?? ""
      // Importações antigas guardam "recibo 12345678" ou o marcador no meio do texto.
      // Só aceitar identificadores explicitamente rotulados, sem escolher entre recibos conflitantes.
      const marcadores = [...obs.matchAll(/\brecibo(?:[ \t]*:[ \t]*|[ \t]+)(LELLO-[^\s|]+|[\d.]{6,})(?=\s|\||$)/gi)]
        .map(match => reciboSemPonto(match[1]).toUpperCase())
      const portais = new Set(marcadores.filter(marcador => /^\d{6,}$/.test(marcador)))
      const aliases = marcadores.filter(marcador => marcador.startsWith("LELLO-"))
      if (portais.size > 1 || aliases.some(alias => alias !== legado)) throw revisar()
      const portal = [...portais][0]
      const alias = aliases[0]
      const origemPortal = cota.origem_importacao?.startsWith(`Espelhamento Lello ${codigo} - `)
      const origemLegada = /^(?:Conciliação Lello(?:\s|$)|importacao_cobrancas(?:\s|$)|conversao_relatorio(?:\s|$))/i.test(cota.origem_importacao ?? "")
      if (portal && (alias === legado || origemPortal || origemLegada)) recibo = portal
      else if (alias !== legado) throw revisar()
    }
    // Uma repetição pode representar duas cotas reais, mas nunca autoriza usar o mesmo recibo duas vezes.
    const identidade = JSON.stringify([unidade, recibo])
    if (usados.has(identidade) || (linha.chavePlanilhaLello && linha.recibo !== recibo)) throw revisar()
    usados.add(identidade)
    if (recibo === legado) return linha
    return { ...linha, recibo, chavePlanilhaLello: legado, unidadeReciboLello: cota.unidade_id }
  })
}

export async function carregarCadastroRecibosLello(db: ReturnType<typeof createAdminClient>, carteira: string, condominio: string) {
  const linhas: Cadastro[] = []
  for (let inicio = 0; ; inicio += 500) {
    const { data, error } = await db.from("cobrancas")
      .select("unidade_id,unidades!inner(identificacao,bloco),vencimento,valor_original,observacoes,origem_importacao,arquivada_em")
      .eq("condominio_id", condominio).eq("carteira_id", carteira).eq("unidades.condominio_id", condominio)
      .is("duplicada_de_id", null).is("duplicada_origem_excluida_id", null)
      .is("arquivada_em", null)
      .order("id").range(inicio, inicio + 499).overrideTypes<Cadastro[], { merge: false }>()
    if (error) throw new Error(`Falha ao conferir recibos da Lello: ${error.message}`)
    linhas.push(...(data ?? []))
    if (!data || data.length < 500) return linhas
  }
}
