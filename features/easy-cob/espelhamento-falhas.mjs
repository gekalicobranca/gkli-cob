export const falhaColetaGenerica = 'O espelhamento foi interrompido na coleta da inadimplência.'

const mensagens = {
  conexao: 'O coletor não conseguiu se conectar ao portal da administradora. Confira o acesso ao portal e tente Só conferir novamente.',
  carregamento: 'O portal da administradora não terminou de carregar no tempo limite. Tente Só conferir novamente quando o portal responder.',
  relatorio: 'O relatório recebido não passou na validação de formato ou conteúdo. Confira o arquivo da administradora antes de repetir a consulta.',
}

export function mensagemDaNavegacao(detalhe) {
  const primeiraLinha = String(detalhe ?? '').split(/\r?\n/, 1)[0]
  if (/^page\.goto: net::ERR_(CONNECTION_TIMED_OUT|CONNECTION_REFUSED|CONNECTION_RESET|NAME_NOT_RESOLVED)\b/.test(primeiraLinha)) return mensagens.conexao
  if (/^page\.goto: Timeout \d+ms exceeded\./.test(primeiraLinha)) return mensagens.carregamento
  return null
}

export function mensagemPublicaDaColeta(detalhe) {
  if (detalhe === 'O arquivo não pôde ser validado integralmente pelo conversor do app.') return mensagens.relatorio
  return Object.values(mensagens).includes(detalhe) ? detalhe : falhaColetaGenerica
}
