import { processarRelatoriosInadimplenciaPendentes } from '../../features/condominios/relatorio-inadimplencia/processar-pendentes'

processarRelatoriosInadimplenciaPendentes()
  .then(resultado => console.log(`Marcadores processados: ${resultado.processados}`))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
