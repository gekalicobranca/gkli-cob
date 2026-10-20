import { ExternalLink } from 'lucide-react'

import { OperacaoArea } from '@/components/sindico-v2/operacao'
import { CaptacaoArea } from '@/components/sindico-v2/captacao'
import { FiltrosSindico } from '@/components/sindico-v2/filtros'
import { ButtonLink } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { carregarVisaoSindicoV2Gestao } from '@/features/sindico-v2/captacao-queries'
import { formatarDataCiclo, resolverPeriodo } from '@/features/sindico-v2/periodos'
import { requireAdmin } from '@/utils/auth/require-admin'

type SearchParams = Record<string, string | string[] | undefined>

function texto(params: SearchParams, key: string) {
  return typeof params[key] === 'string' ? params[key] as string : undefined
}

export default async function VisaoSindicoGestaoPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  await requireAdmin()

  const params = searchParams ? await searchParams : {}
  const agora = new Date()
  const periodoSolicitado = resolverPeriodo(
    { modo: texto(params, 'modo'), competencia: texto(params, 'competencia'), ano: texto(params, 'ano') },
    agora,
  )
  const { acesso, captacao, periodo, competenciasDisponiveis, operacao } = await carregarVisaoSindicoV2Gestao(texto(params, 'condominio'), periodoSolicitado)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Gestão"
        title="Visão do síndico"
        description="Captação histórica, cobranças em acompanhamento, acordos e pendências do condomínio."
        actions={
          <ButtonLink href="/sindico/visao-v2" target="_blank" variant="secondary">
            <ExternalLink className="h-4 w-4" />
            Abrir portal
          </ButtonLink>
        }
      />

      <FiltrosSindico
        key={`${acesso.selecionado?.id}-${periodo.modo}-${periodo.competencia}`}
        action="/app/gestao/visao-sindico"
        condominios={acesso.condominios}
        selecionado={acesso.selecionado?.id}
        periodo={periodo}
        competenciasDisponiveis={competenciasDisponiveis}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div>
          <h2 className="text-lg font-semibold capitalize text-slate-950">{periodo.titulo}</h2>
          <p className="mt-1 text-sm text-slate-500">
            De {formatarDataCiclo(periodo.inicio)} até {formatarDataCiclo(periodo.fimExclusivo)} · O dia final inicia o próximo ciclo.
          </p>
        </div>
        <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-900">
          {periodo.competencias.length} competência(s) encerrada(s)
        </span>
      </div>

      {!acesso.selecionado ? (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
          {acesso.selecaoInvalida
            ? 'O condomínio solicitado não está disponível neste acesso de gestão. Selecione um condomínio ativo da lista.'
            : 'Nenhum condomínio ativo está disponível para esta visão.'}
        </div>
      ) : (
        <>
          <p role="status" className="rounded-xl border border-cyan-100 bg-cyan-50 p-4 text-sm leading-6 text-cyan-950">
            O período vai do dia 10 ao dia 10. A captação preserva o histórico; cobranças e pendências mostram a situação atual. Negociações e recebimentos seguem o período selecionado.
          </p>

          {captacao && <CaptacaoArea key={`${acesso.selecionado.id}-${periodo.modo}-${periodo.competencia}`} data={captacao} />}

          {operacao.map((area) => <OperacaoArea key={`${acesso.selecionado.id}-${periodo.modo}-${periodo.competencia}-${area.numero}`} area={area} />)}
        </>
      )}
    </div>
  )
}
