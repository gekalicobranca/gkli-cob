import styles from '@/components/easy/easy.module.css'
import { nomeCondominioEasy } from '@/features/easy-cob/nome-condominio'
import { dataCivilSaoPaulo } from '@/lib/core/data-civil'
import type { CondominioEspelhamento } from './types'

export function AcordosHomologados({ condominios }: { condominios: CondominioEspelhamento[] }) {
  const auditorias = condominios.flatMap(c => c.auditoria ? [{ condominio: c, ...c.auditoria }] : [])
  const excecoes = auditorias.flatMap(a => a.excecoes.map(acordo => ({ ...a, acordo })))
  const criticos = excecoes.filter(a => a.acordo.estado === 'critico')
  const inconclusivos = excecoes.filter(a => a.acordo.estado === 'inconclusivo')
  const historicos = excecoes.filter(a => a.acordo.estado === 'historico')
  const encontrados = auditorias.reduce((total, a) => total + a.encontrados, 0)
  const falhas = condominios.filter(c => c.execucao?.estado === 'falha')

  function listar(linhas: typeof excecoes) {
    return <ul className="mt-2 max-h-80 space-y-2 overflow-y-auto text-sm">
      {linhas.map(({ condominio, administradora, concluidaEm, acordo }) => (
        <li key={acordo.acordoId}>
          <a className="font-semibold underline" href={'/app/acordos/' + acordo.acordoId}>
            {nomeCondominioEasy(condominio.nome, condominio.nomeOperacional)}{acordo.unidade && ' · Unidade ' + acordo.unidade}{acordo.bloco && acordo.bloco !== '0' && ' / ' + acordo.bloco}
            {acordo.numero && ' · Acordo ' + acordo.numero}
          </a>
          <p>{acordo.motivo}</p>
          <p className="text-xs">{administradora && administradora + ' · '}{dataCivilSaoPaulo(new Date(concluidaEm)).split('-').reverse().join('/')}
            {' · '}{acordo.cotasProtegidas ? acordo.cotasProtegidas + ' cota(s) vinculada(s) fora da cobrança' : 'Sem cotas vinculadas no app'}</p>
        </li>
      ))}
    </ul>
  }

  return <section className={styles.panel} aria-labelledby="espelhar-acordos-homologados">
    <h2 id="espelhar-acordos-homologados" className="font-semibold">Acordos homologados vigentes</h2>
    {auditorias.length > 0
      ? <p className="mt-1 text-sm text-slate-600">{encontrados} encontrados · {auditorias.length} condomínios conferidos</p>
      : <p className="mt-1 text-sm text-slate-600">Use Só conferir para verificar os acordos na administradora.</p>}
    {criticos.length > 0 && <div className="mt-3 rounded-lg bg-rose-50 p-3 text-rose-900">
      <h3 className="font-semibold">Críticos · {criticos.length} ausentes após consultar o histórico</h3>
      {listar(criticos)}
    </div>}
    {falhas.length > 0 && <p className="mt-2 text-sm text-amber-900">
      Última consulta falhou em {falhas.length} condomínio(s). O painel mostra os resultados das conferências concluídas.
    </p>}
    {inconclusivos.length > 0 && <details className="mt-3 rounded-lg border border-amber-200 p-3 text-amber-900">
      <summary className="cursor-pointer font-semibold">Consulta inconclusiva · {inconclusivos.length}</summary>
      {listar(inconclusivos)}
    </details>}
    {historicos.length > 0 && <details className="mt-3 rounded-lg border border-slate-200 p-3 text-slate-700">
      <summary className="cursor-pointer font-semibold">Localizados no histórico · {historicos.length}</summary>
      {listar(historicos)}
    </details>}
  </section>
}
