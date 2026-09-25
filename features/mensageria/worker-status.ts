export type WorkerStatus = { cor: 'verde' | 'amarelo' | 'vermelho'; texto: string; detalhe?: string; proximoPasso?: string; sinalEm?: string | null }

export function workerStatus(sinal: string | null | undefined, estado: string | undefined, now = Date.now(), maxAge = 180_000): WorkerStatus {
  if (!sinal) return { cor: 'vermelho', texto: 'Worker sem sinal' }
  const idade = now - Date.parse(sinal)
  if (!Number.isFinite(idade) || idade < -30_000 || idade >= maxAge) return { cor: 'vermelho', texto: 'Worker sem sinal recente' }
  if (estado === 'operando') return { cor: 'verde', texto: 'Worker funcionando' }
  if (estado === 'conexao') return { cor: 'amarelo', texto: 'Conectado · envios desabilitados' }
  if (estado === 'erro') return { cor: 'vermelho', texto: 'Worker com falha' }
  return { cor: 'amarelo', texto: 'Worker aguardando conexão ou confirmação' }
}
