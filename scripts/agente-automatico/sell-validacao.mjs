export function validarIdentidadeSell(titulo, esperado) {
  if (!esperado || titulo.trim() !== esperado.trim()) throw new Error('Condomínio SELL não corresponde ao cadastro validado.')
}

export function retornoSemInadimplenciaSell(url, titulo, esperado, menuCotasVisivel) {
  validarIdentidadeSell(titulo, esperado)
  const atual = new URL(url)
  // Regra operacional confirmada pelo usuário para este portal: relatório sem
  // inadimplência retorna ao início após a consulta autenticada de Cotas Pendentes.
  return atual.origin === 'https://servc9.webware.com.br' && atual.pathname === '/bin/skin/aInicioSkin.asp' && menuCotasVisivel === true
}
