import { calcularDespesasAcordo } from '../acordos/calculo-despesas'
import { simularPropostaKeila } from './casos'
import { formatarEmailAgente, type AgenteVirtualId } from '../agentes-virtuais/perfis'
import { percentualDespesas } from '../condominios/condicoes-acordo'

export type KeilaAcordo = {
  id: string; unidade_id: string; unidade: string; etapa: 'possivel_acordo' | 'acordo_firmado' | 'acordo_efetivado'
  exige_aprovacao?: boolean
  base: number; despesas: number; total: number; percentual: number
  parcelas: { numero: number; valor: number; vencimento: string; tipo_parcela: string; status: string }[]
  destinatario: string | null; cc: string[]; assunto: string; solicitado_em?: string
}

export function montarPropostaKeila(cobrancas: Parameters<typeof simularPropostaKeila>[0], dias: number,
  quantidade: number, vencimento: string, hoje = new Date(), condicoes?: {
    despesas_acordo_avista_percentual: number | null; despesas_acordo_parcelado_percentual: number | null
    parcelas_acordo_sem_aprovacao_sindico: number | null
  }) {
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 120) throw new Error('Informe entre 1 e 120 parcelas.')
  const percentual = percentualDespesas(quantidade === 1 ? condicoes?.despesas_acordo_avista_percentual ?? 10 : condicoes?.despesas_acordo_parcelado_percentual ?? 20)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento) || new Date(`${vencimento}T12:00:00Z`).toISOString().slice(0, 10) !== vencimento)
    throw new Error('Vencimento inválido.')
  const hojeCivil = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(hoje)
  if (vencimento < hojeCivil) throw new Error('O vencimento não pode estar no passado.')
  const simulacao = simularPropostaKeila(cobrancas, dias, hoje)
  if (!simulacao) throw new Error('Não há cobranças elegíveis dentro da régua.')
  const selecionadas = cobrancas.filter(c => simulacao.cobrancaIds.includes(c.id))
  const calculo = calcularDespesasAcordo(selecionadas.map(c => ({ id: c.id, valor: Number(c.valor_atualizado) })), [], percentual, 0,
    { quantidadeParcelas: quantidade, entrada: 0 })
  const centavos = Math.round(calculo.total * 100)
  const [ano, mes, dia] = vencimento.split('-').map(Number)
  const parcelas = Array.from({ length: quantidade }, (_, i) => {
    const ultimoDia = new Date(Date.UTC(ano, mes + i, 0)).getUTCDate()
    const data = new Date(Date.UTC(ano, mes - 1 + i, Math.min(dia, ultimoDia)))
    return { numero: i + 1, valor: (Math.floor(centavos / quantidade) + (i < centavos % quantidade ? 1 : 0)) / 100,
      vencimento: data.toISOString().slice(0, 10), tipo_parcela: 'parcela', status: 'aberta' }
  })
  const limite = condicoes?.parcelas_acordo_sem_aprovacao_sindico ?? 0
  return { base: calculo.baseDespesa, despesas: calculo.despesa, total: calculo.total, percentual, parcelas,
    exige_aprovacao: quantidade > 1 && limite > 0 && quantidade > limite,
    itens: selecionadas.map((c, i) => ({ cobranca_id: c.id, valor_atualizado_no_acordo: Number(c.valor_atualizado),
      encargos_no_acordo: calculo.itens[i].despesa, valor_total_no_acordo: calculo.itens[i].total })) }
}

export function solicitarBoletosKeila(acordo: KeilaAcordo, condominio: string, nome: string, agenteId: AgenteVirtualId = 'keila') {
  const dinheiro = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const datas = acordo.parcelas.map(p => `${p.numero}ª parcela: ${dinheiro(p.valor)}, vencimento ${p.vencimento.split('-').reverse().join('/')}.`).join('\n')
  return formatarEmailAgente(agenteId, nome, `Após o aceite do responsável, copiado neste e-mail, solicitamos o cadastro do acordo ${acordo.id} na administradora e a emissão dos boletos.\n\nCondomínio: ${condominio}.\nUnidade: ${acordo.unidade}.\nDébitos: ${dinheiro(acordo.base)}.\nDespesas de cobrança (${acordo.percentual}%): ${dinheiro(acordo.despesas)}.\nTotal: ${dinheiro(acordo.total)}.\n\n${datas}\n\nO acordo inclui somente as cobranças vinculadas à proposta, incluindo cotas em status Regular quando selecionadas.\n\nPor gentileza, confirmem o cadastro e encaminhem os boletos em resposta a todos, mantendo o ID do acordo no assunto. Caso identifiquem divergência, informem antes da emissão para conferência.`)
}
