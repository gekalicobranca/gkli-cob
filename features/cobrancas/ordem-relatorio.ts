const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

export function compararHierarquiaCotas(a: any, b: any) {
  const comparar = (x: unknown, y: unknown) => collator.compare(String(x ?? ''), String(y ?? ''))
  return comparar(a.carteiras?.nome, b.carteiras?.nome)
    || comparar(a.carteira_id, b.carteira_id)
    || comparar(a.condominios?.nome, b.condominios?.nome)
    || comparar(a.condominio_id, b.condominio_id)
    || comparar(a.unidades?.bloco, b.unidades?.bloco)
    || comparar(a.unidades?.identificacao, b.unidades?.identificacao)
    || comparar(a.unidade_id, b.unidade_id)
}
