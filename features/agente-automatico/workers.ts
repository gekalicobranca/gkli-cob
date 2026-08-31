export type AgenteWorkerConfig = {
  scriptKey: string
  nome: string
  npmScript: string
  logName: string
  workerFile: string
}

export const AGENTE_WORKERS: AgenteWorkerConfig[] = [
  {
    scriptKey: 'bbz_condopro_clock_vila_romana',
    nome: 'BBZ / CondoPro',
    npmScript: 'agente:worker',
    logName: 'bbz-worker',
    workerFile: 'worker.mjs',
  },
  {
    scriptKey: 'manager_atentum_cotas_pendentes',
    nome: 'Manager / Atentum',
    npmScript: 'agente:worker:manager',
    logName: 'manager-worker',
    workerFile: 'worker-manager.mjs',
  },
  {
    scriptKey: 'villagua_condopro_square_guarulhos',
    nome: 'Square Guarulhos',
    npmScript: 'agente:worker:square-guarulhos',
    logName: 'square-guarulhos-worker',
    workerFile: 'worker-square-guarulhos.mjs',
  },
  {
    scriptKey: 'verti_winker_inadimplencia',
    nome: 'Verti / Winker',
    npmScript: 'agente:worker:verti',
    logName: 'verti-worker',
    workerFile: 'worker-verti.mjs',
  },
  {
    scriptKey: 'captacao_atipass',
    nome: 'Atipass',
    npmScript: 'agente:worker:atipass',
    logName: 'atipass-worker',
    workerFile: 'worker-atipass.mjs',
  },
  {
    scriptKey: 'captacao_lello',
    nome: 'Lello / COJUR',
    npmScript: 'agente:worker:lello',
    logName: 'lello-worker',
    workerFile: 'worker-lello.mjs',
  },
  {
    scriptKey: 'captacao_hflex',
    nome: 'HFlex / LiveFacilities',
    npmScript: 'agente:worker:hflex',
    logName: 'hflex-worker',
    workerFile: 'worker-hflex.mjs',
  },
]

export function getAgenteWorkerByScriptKey(scriptKey: string) {
  return AGENTE_WORKERS.find((worker) => worker.scriptKey === scriptKey) ?? null
}
