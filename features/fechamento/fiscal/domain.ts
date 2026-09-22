export type FiscalSnapshot = {
  periodo_id: string; carteira_id: string; condominio_id: string; tipo_faturamento: string
  competencia: string; emissor_razao_social: string | null; emissor_cnpj: string | null
  tomador_razao_social: string | null; tomador_cnpj: string | null; valor_faturamento: string
}
export type FiscalPayload = {
  source_id: string; fechamento_id: string; condominio_id: string; carteira_id: string
  empresa_nome: string; empresa_documento: string; cliente_nome: string; cliente_documento: string
  competencia: string; servico: string; descricao: string; valor: string
}
export class FiscalDeliveryError extends Error {
  constructor(message: string, public conflict = false) { super(message) }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function sourceId(snapshot: FiscalSnapshot) {
  for (const id of [snapshot.periodo_id, snapshot.carteira_id, snapshot.condominio_id]) if (!UUID.test(id)) throw new FiscalDeliveryError('Referência de fechamento, carteira ou condomínio inválida.')
  if (!/^[a-z0-9_]{1,60}$/.test(snapshot.tipo_faturamento)) throw new FiscalDeliveryError('Tipo de faturamento inválido.')
  // Nunca use o ID do faturamento: a apuração o recria. A chave natural permanece.
  return `cob:${snapshot.periodo_id}:${snapshot.carteira_id}:${snapshot.condominio_id}:${snapshot.tipo_faturamento}`
}
function required(value: string | null, label: string) {
  const result = value?.trim() ?? ''
  if (!result || result.length > 200) throw new FiscalDeliveryError(`${label}: preencha até 200 caracteres no cadastro de origem.`)
  return result
}
export function createFiscalPayload(snapshot: FiscalSnapshot, mapping: Record<string, string>): FiscalPayload {
  const reference = sourceId(snapshot)
  const carteiraId = mapping[snapshot.carteira_id]
  if (!carteiraId || !UUID.test(carteiraId)) throw new FiscalDeliveryError('Carteira sem vínculo válido com o Core. Configure o mapeamento da integração.')
  const document = (value: string | null, label: string) => {
    const result = (value ?? '').replace(/[.\-/\s]/g, '')
    if (!/^\d{14}$/.test(result)) throw new FiscalDeliveryError(`CNPJ ${label} ausente ou inválido no faturamento.`)
    return result
  }
  const competencia = snapshot.competencia.slice(0, 7)
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(competencia)) throw new FiscalDeliveryError('Competência inválida no fechamento.')
  const valor = snapshot.valor_faturamento
  if (!/^\d{1,12}\.\d{2}$/.test(valor) || Number(valor) <= 0) throw new FiscalDeliveryError('Valor do faturamento deve ser positivo e ter duas casas decimais.')
  return {
    source_id: reference, fechamento_id: snapshot.periodo_id, condominio_id: snapshot.condominio_id,
    carteira_id: carteiraId.toLowerCase(), empresa_nome: required(snapshot.emissor_razao_social, 'Empresa emissora'),
    empresa_documento: document(snapshot.emissor_cnpj, 'do emissor'),
    cliente_nome: required(snapshot.tomador_razao_social, 'Tomador'), cliente_documento: document(snapshot.tomador_cnpj, 'do tomador'),
    competencia, servico: snapshot.tipo_faturamento,
    descricao: `Repasse de cobrança extrajudicial · competência ${competencia.split('-').reverse().join('/')}.`, valor,
  }
}
export function parseCarteiraMapping(raw: string | undefined): Record<string, string> {
  let mapping: unknown
  try { mapping = JSON.parse(raw ?? '{}') } catch { throw new FiscalDeliveryError('Mapeamento de carteiras inválido na configuração da integração.') }
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) throw new FiscalDeliveryError('Mapeamento de carteiras inválido.')
  for (const [key, value] of Object.entries(mapping)) if (!UUID.test(key) || typeof value !== 'string' || !UUID.test(value)) throw new FiscalDeliveryError('O mapeamento de carteiras deve conter apenas UUIDs do Cob e do Core.')
  return mapping as Record<string, string>
}
