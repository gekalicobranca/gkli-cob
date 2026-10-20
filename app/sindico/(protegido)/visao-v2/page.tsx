import Link from 'next/link'
import { OperacaoArea } from '@/components/sindico-v2/operacao'
import { FiltrosSindico } from '@/components/sindico-v2/filtros'
import { carregarVisaoSindicoV2 } from '@/features/sindico-v2/captacao-queries'
import { CaptacaoArea } from '@/components/sindico-v2/captacao'
import { formatarDataCiclo, resolverPeriodo } from '@/features/sindico-v2/periodos'

export default async function NovaVisaoSindico({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const texto = (key: string) => typeof params[key] === 'string' ? params[key] as string : undefined
  const agora = new Date()
  const periodoSolicitado = resolverPeriodo({ modo: texto('modo'), competencia: texto('competencia'), ano: texto('ano') }, agora)
  const { acesso, captacao, periodo, competenciasDisponiveis, operacao } = await carregarVisaoSindicoV2(texto('condominio'), periodoSolicitado)
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-slate-950 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-6 px-5 py-8 sm:px-8">
          <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Portal do síndico · Nova visão</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">{acesso.selecionado?.nome ?? 'Acompanhamento do condomínio'}</h1>
            <p className="mt-3 text-sm text-slate-300">Olá, {acesso.nome}. Acompanhe cada etapa em um só lugar.</p></div>
          <Link href="/sindico" className="rounded-lg border border-white/25 px-4 py-2 text-sm hover:bg-white/10">Visão atual</Link>
        </div>
      </header>
      <div className="mx-auto max-w-7xl space-y-5 px-5 py-6 sm:px-8">
        <FiltrosSindico key={`${acesso.selecionado?.id}-${periodo.modo}-${periodo.competencia}`} condominios={acesso.condominios} selecionado={acesso.selecionado?.id} periodo={periodo} competenciasDisponiveis={competenciasDisponiveis} />
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div><h2 className="text-lg font-semibold capitalize">{periodo.titulo}</h2>
            <p className="mt-1 text-sm text-slate-500">De {formatarDataCiclo(periodo.inicio)} até {formatarDataCiclo(periodo.fimExclusivo)} · O dia final inicia o próximo ciclo.</p></div>
          <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-900">{periodo.competencias.length} competência(s) encerrada(s)</span>
        </div>
        {!acesso.selecionado ? (
          <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
            {acesso.selecaoInvalida ? 'O condomínio solicitado não está disponível para este acesso. Selecione um dos condomínios autorizados.' : 'Nenhum condomínio está liberado para este acesso. Fale com a equipe GKLI para verificar a vinculação.'}
          </div>
        ) : (
          <>
            <p role="status" className="rounded-xl border border-cyan-100 bg-cyan-50 p-4 text-sm leading-6 text-cyan-950">A captação preserva o histórico; cobranças e pendências mostram a situação atual. Negociações e recebimentos seguem o período selecionado.</p>
            {captacao && <CaptacaoArea key={`${acesso.selecionado.id}-${periodo.modo}-${periodo.competencia}`} data={captacao} />}
            {operacao.map((area) => <OperacaoArea key={`${acesso.selecionado.id}-${periodo.modo}-${periodo.competencia}-${area.numero}`} area={area} />)}
          </>
        )}
      </div>
    </main>
  )
}
