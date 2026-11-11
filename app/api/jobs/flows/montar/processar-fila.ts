import { flowBudgetRemaining } from '@/lib/jobs/flow-execution'

const MAX_PARTES_POR_ACIONAMENTO = 4
const MIN_TEMPO_PARA_PROXIMA_PARTE_MS = 30_000
const MIN_CONSULTAS_PARA_PROXIMA_PARTE = 200

type ResultadoParte = {
  processadas: number
  jobId?: string
  flowId?: string | null
  status?: string
  erro?: string
  pausada?: boolean
}

export async function processarFilaMaestro(processarParte: () => Promise<ResultadoParte>) {
  const resultados: ResultadoParte[] = []
  let processadas = 0
  let maiorDuracaoMs = 0
  let maiorCustoConsultas = 0
  let parada = 'limite_de_partes'

  for (let i = 0; i < MAX_PARTES_POR_ACIONAMENTO; i++) {
    const antes = flowBudgetRemaining()
    // Cada parte é reservada e finalizada pelo banco. Só reivindique outra
    // se ainda houver margem para processá-la no orçamento deste acionamento.
    if (i > 0 && (
      !antes ||
      antes.ms < Math.max(MIN_TEMPO_PARA_PROXIMA_PARTE_MS, maiorDuracaoMs + 10_000) ||
      antes.queries < Math.max(MIN_CONSULTAS_PARA_PROXIMA_PARTE, maiorCustoConsultas + 25)
    )) {
      parada = 'orcamento'
      break
    }

    const inicio = Date.now()
    const resultado = await processarParte()
    resultados.push(resultado)
    processadas += resultado.processadas
    if (!resultado.processadas || resultado.status === 'atencao' || resultado.erro) {
      parada = resultado.erro || resultado.status === 'atencao' ? 'atencao' : resultado.pausada ? 'pausada' : 'sem_parte_disponivel'
      break
    }

    const depois = flowBudgetRemaining()
    maiorDuracaoMs = Math.max(maiorDuracaoMs, Date.now() - inicio)
    if (antes && depois) maiorCustoConsultas = Math.max(maiorCustoConsultas, antes.queries - depois.queries)
  }

  return { processadas, resultados, parada, maiorDuracaoMs, maiorCustoConsultas, restante: flowBudgetRemaining() }
}
