export const QUEBRA_EXIGE_CONFIRMACAO = 'A quebra exige confirmação da administradora e conciliação dos pagamentos, saldo residual e cotas.'

export function lerConfirmacaoQuebra(formData: FormData, userId: string) {
  const referencia = String(formData.get('quebra_referencia') ?? '').trim()
  const ajuste = String(formData.get('quebra_ajuste_referencia') ?? '').trim()
  if (referencia.length < 10 || ajuste.length < 10
    || formData.get('quebra_conciliada') !== 'on') throw new Error(QUEBRA_EXIGE_CONFIRMACAO)
  return { referencia, ajuste_financeiro_referencia: ajuste, pagamentos_conferidos: true,
    cotas_reconciliadas: true, confirmado_por: userId, confirmado_em: new Date().toISOString() }
}
