import { diaBrasilia } from '../agentes-virtuais/validade-proposta'

export const ORIGEM_WORK_KEILA = 'work_github'
export const STATUS_WORK_KEILA = 'aguardando_work'
const TITULO_PILOTO = '[KEILA-WORK-PILOTO-20261123]'
const MARCADOR_PILOTO = '60667623e08315adc1c3680e547119a8c8e9f151'
const REPO = 'gekalicobranca/gkli-cob'

export function usarWorkKeila(condominioId: string) {
  return process.env.KEILA_WORK_CONDOMINIO_ID === condominioId
}

export function periodoWorkKeila(criadoEm: string) {
  const [ano, mes, dia] = diaBrasilia(new Date(criadoEm)).split('-').map(Number)
  const limite = new Date(Date.UTC(ano - 5, mes, 0)).getUTCDate()
  const formatar = (a: number, d: number) => [d, mes, a].map(v => String(v).padStart(2, '0')).join('/')
  return { de: formatar(ano - 5, Math.min(dia, limite)), ate: formatar(ano, dia) }
}

export async function dispararWorkKeila(execucaoId: string, fetcher = fetch) {
  const token = process.env.KEILA_WORK_GITHUB_TOKEN
  if (!token) throw new Error('Credencial do GitHub para a coleta pelo Work não configurada.')
  const branch = `codex/keila-work/${execucaoId}`
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  const github = (caminho: string, dados?: object) => fetcher(`https://api.github.com/repos/${REPO}/${caminho}`, {
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
    ...(dados ? { method: 'POST', body: JSON.stringify(dados) } : {}),
  })
  const prExistente = async () => {
    const query = new URLSearchParams({ head: `gekalicobranca:${branch}`, base: 'main', state: 'all' })
    const resposta = await github(`pulls?${query}`)
    if (!resposta.ok) throw new Error(`Não foi possível conferir o pedido no GitHub (HTTP ${resposta.status}).`)
    const prs: { number: number; state: string }[] = await resposta.json()
    const pr = prs[0]
    if (pr?.state === 'closed') throw new Error('O evento deste pedido foi encerrado no GitHub.')
    return pr?.number
  }

  const existente = await prExistente()
  if (existente) return existente
  const ref = await github('git/refs', { ref: `refs/heads/${branch}`, sha: MARCADOR_PILOTO })
  if (!ref.ok) {
    // Outro pedido concorrente pode já ter criado esta mesma referência.
    const atual = await github(`git/ref/heads/${branch}`)
    if (!atual.ok || (await atual.json()).object?.sha !== MARCADOR_PILOTO) {
      throw new Error(`Não foi possível criar a referência do pedido no GitHub (HTTP ${ref.status}).`)
    }
  }

  const resposta = await github('pulls', {
    title: `${TITULO_PILOTO} Coleta ${execucaoId}`,
    head: branch,
    base: 'main',
    draft: true,
    body: 'Evento do piloto GKLI Work. Sem alterações de código. Não mesclar.',
  })
  if (resposta.ok) return (await resposta.json()).number as number
  const concorrente = await prExistente()
  if (concorrente) return concorrente
  throw new Error(`Não foi possível disparar o evento no GitHub (HTTP ${resposta.status}).`)
}
