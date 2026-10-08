import path from 'node:path'

export function verificarConfiguracao(config, condo, job) {
  if (!config?.habilitado || !condo || condo.status !== 'ativo' ||
    !['Lello', 'BBZ', 'ATIPASS', 'HFlex'].includes(config.administradora) ||
    String(condo.administradora).toLowerCase() !== config.administradora.toLowerCase() ||
    condo.carteira_id !== config.carteira_id || config.carteira_id !== job.carteira_id ||
    config.codigo_cliente !== job.codigo_cliente || config.administradora !== job.administradora ||
    !Array.isArray(config.alvos_portal) || !config.alvos_portal.length) throw new Error('Configuração não está habilitada para este resgate de PDFs.')
  for (const alvo of config.alvos_portal) {
    if ((config.administradora === 'ATIPASS' && (alvo.codigo !== config.condominio_id || config.codigo_cliente !== config.condominio_id)) || !(config.administradora === 'ATIPASS' ? /^[\da-f-]{36}$/i.test(alvo.codigo || '') : /^\d+$/.test(alvo.codigo || '')) || typeof alvo.nome !== 'string' || !alvo.nome.trim() ||
      (alvo.credencial && !['SAFIRA', 'TOPAZIO', 'CONEXT', 'LAVANCE'].includes(alvo.credencial))) throw new Error('Alvo de portal inválido.')
  }
}
export function argumentosColetor(raiz, portal, alvo, saida) {
  if (!['lello', 'bbz', 'atipass', 'hflex'].includes(portal)) throw new Error('Portal inválido.')
  return [path.join(raiz, 'scripts/acordos-portais/worker.mjs'), '--portal', portal, '--codigo', alvo.codigo, '--condominio', alvo.nome, '--saida', saida,
    ...(alvo.credencial ? ['--credencial', alvo.credencial] : [])]
}
