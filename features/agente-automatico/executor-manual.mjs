export const COLETORES_MANUAIS = {
  bbz_condopro_clock_vila_romana: 'worker.mjs',
  manager_atentum_cotas_pendentes: 'worker-manager.mjs',
  villagua_condopro_square_guarulhos: 'worker-square-guarulhos.mjs',
  verti_winker_inadimplencia: 'worker-verti.mjs',
  captacao_lello: 'worker-lello.mjs',
  captacao_atipass: 'worker-atipass.mjs',
  captacao_hflex: 'worker-hflex.mjs',
  captacao_graiche: 'worker-graiche.mjs',
  captacao_sell: 'worker-sell.mjs',
}

export function coletorManual(scriptKey) {
  if (!Object.hasOwn(COLETORES_MANUAIS, scriptKey)) throw new Error(`O coletor ${scriptKey || 'não informado'} ainda não está disponível. Nenhuma coleta foi iniciada.`)
  return COLETORES_MANUAIS[scriptKey]
}

export function urlExecutorMaestro(id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Execução inválida.')
  return `gkli-maestro://executar?id=${id}`
}

export function execucaoDaUrlMaestro(valor) {
  const url = new URL(valor)
  if (url.protocol !== 'gkli-maestro:' || url.hostname !== 'executar' || !['', '/'].includes(url.pathname) || url.username || url.password || url.port || url.hash || url.searchParams.getAll('id').length !== 1 || [...url.searchParams.keys()].some(k => k !== 'id')) throw new Error('Comando manual inválido.')
  const id = url.searchParams.get('id')
  urlExecutorMaestro(id)
  return id
}
