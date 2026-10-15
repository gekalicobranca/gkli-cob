// Uma consulta posterior não prova que este processo ganhou a atualização.
export function execucaoReivindicada(claim, execucao, enviar = process.connected ? process.send.bind(process) : null) {
  if (!claim) return null
  enviar?.({ type: 'maestro:claimed', id: execucao.id }, () => {})
  return execucao
}
