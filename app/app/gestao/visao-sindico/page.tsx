import { ExternalLink } from 'lucide-react'

import { AreaRecolhivel } from '@/components/sindico-v2/area-recolhivel'
import { CaptacaoArea } from '@/components/sindico-v2/captacao'
import { FiltrosSindico } from '@/components/sindico-v2/filtros'
import { ButtonLink } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { carregarVisaoSindicoV2Gestao } from '@/features/sindico-v2/captacao-queries'
import { formatarDataCiclo, resolverPeriodo, ultimaCompetenciaFechada } from '@/features/sindico-v2/periodos'
import { requireAdmin } from '@/utils/auth/require-admin'

const areas = [
  {
    titulo: 'Cobrança em andamento',
    descricao: 'A evolução das cobranças do condomínio.',
    indicadores: ['Saldo em cobrança', 'Unidades acompanhadas', 'Faixas de atraso'],
    detalhes: 'Cobranças por unidade, valores e andamento no encerramento do ciclo.',
  },
  {
    titulo: 'Acordos',
    descricao: 'Negociações, recebimentos e parcelas.',
    indicadores: ['Valor negociado', 'Recebimentos no período', 'Posição das parcelas'],
    detalhes: 'Acordos por unidade, condições negociadas e evolução dos pagamentos.',
  },
  {
    titulo: 'Pendências',
    descricao: 'O que precisa de atenção e o que depende do síndico.',
    indicadores: ['Aprovações', 'Procurações', 'Dependem do síndico'],
    detalhes: 'Itens em acompanhamento, responsável pela próxima ação e situação no fechamento.',
  },
]

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
  const periodo = resolverPeriodo(
    { modo: texto(params, 'modo'), competencia: texto(params, 'competencia'), ano: texto(params, 'ano') },
    agora,
  )
  const { acesso, captacao } = await carregarVisaoSindicoV2Gestao(texto(params, 'condominio'), periodo)

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Gestão"
        title="Visão do síndico"
        description="Nova leitura por ciclo completo, com captação histórica e áreas recolhíveis para cobrança, acordos e pendências."
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
        ultima={ultimaCompetenciaFechada(agora)}
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
            Esta versão usa ciclos completos de competência, sempre do dia 10 ao dia 10, e preserva a captação histórica do fechamento.
          </p>

          {captacao && <CaptacaoArea key={`${acesso.selecionado.id}-${periodo.modo}-${periodo.competencia}`} data={captacao} />}

          {areas.map((area, index) => (
            <AreaRecolhivel
              key={area.titulo}
              titulo={area.titulo}
              descricao={area.descricao}
              numero={String(index + 2).padStart(2, '0')}
              resumo="Em preparação"
              dashboard={
                <div className="grid gap-3 sm:grid-cols-3">
                  {area.indicadores.map((indicador) => (
                    <div key={indicador} className="rounded-xl border border-slate-200 bg-white p-4">
                      <p className="text-sm font-medium text-slate-600">{indicador}</p>
                      <p className="mt-3 text-sm text-slate-500">Disponível após validação do histórico</p>
                    </div>
                  ))}
                </div>
              }
            >
              <h3 className="font-semibold text-slate-800">Detalhamento</h3>
              <p className="mt-2 text-sm text-slate-500">{area.detalhes}</p>
              <p className="mt-4 border-l-2 border-slate-200 pl-3 text-sm text-slate-500">
                Dados deste período ainda não disponibilizados nesta versão.
              </p>
            </AreaRecolhivel>
          ))}
        </>
      )}
    </div>
  )
}
