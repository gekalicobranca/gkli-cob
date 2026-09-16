/** Nome compartilhado entre a exportação local e o download pelo aplicativo. */
export function nomeArquivoRelatorio(cnpj: string | null | undefined, nome: string, agora = new Date()) {
  const documento = String(cnpj ?? '').replace(/\D/g, '') || 'SEM_CNPJ'
  const condominio = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 140) || 'CONDOMINIO'
  const data = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora)
  return `${documento}_${condominio}_${data}.pdf`
}
