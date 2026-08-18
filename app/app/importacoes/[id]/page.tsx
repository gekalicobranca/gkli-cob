import { notFound } from 'next/navigation'
import { AlertTriangle, CheckCircle2, FileCheck2, ShieldX, WalletCards } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/data/status-badge'
import { formatCurrency } from '@/utils/formatters/currency'
import { formatDateBR } from '@/utils/formatters/date'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import { getImportacaoDetalhe, listImportacaoItens } from '@/features/importacoes/queries'
import { confirmarImportacao } from '@/features/importacoes/actions'
import { priorityTone } from '@/features/importacoes/preview-rules'
import { ConfirmarImportacaoButton } from './confirmar-importacao-button'

type PageProps = {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ resultado?: string; tipo?: string }>
}

function getAlertas(erros: string[] = []) {
  return erros.filter((erro) => erro.startsWith('ALERTA:')).map((erro) => erro.replace('ALERTA:', '').trim())
}

function getErrosBloqueantes(erros: string[] = []) {
  return erros.filter((erro) => !erro.startsWith('ALERTA:'))
}

function normalizeText(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function isContatoEncontrado(alerta: string) {
  const normalizado = normalizeText(alerta)
  return normalizado.includes('contato encontrado') && normalizado.includes('cadastro de apoio')
}

function isLegacy(tipo: string) {
  return tipo === 'acordos_extra' || tipo === 'acordos_judiciais'
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item ?? '').trim()).filter(Boolean)
}

function safeStatus(value: unknown, fallback = 'sem_status') {
  return String(value ?? fallback).trim() || fallback
}

function labelTipo(tipo: string) {
  if (tipo === 'unidades') return 'Responsáveis'
  if (tipo === 'cobrancas') return 'Cobranças'
  if (tipo === 'condominios') return 'Condomínios'
  if (tipo === 'acordos_extra') return 'Legado · Acordos extra'
  if (tipo === 'acordos_judiciais') return 'Legado · Acordos judiciais'
  return tipo
}

function valorPreview(payload: Record<string, any>) {
  return Number(payload.valor_atualizado ?? payload.valor_acordado ?? payload.valor_original ?? payload.valor_cota_condominial ?? 0)
}

function dataPreview(payload: Record<string, any>, tipo: string) {
  if (tipo === 'condominios') {
    const dia = payload.vencimento_cota_dia ?? payload.dia_vencimento_cota ?? payload.dia_de_vencimento_da_cota
    return dia ? `Dia ${dia}` : ''
  }

  return payload.vencimento ?? payload.primeiro_vencimento ?? payload.data_acordo ?? ''
}

function previewMetaPrimaria(payload: Record<string, any>, tipo: string) {
  if (tipo === 'unidades') return payload.bloco ? `Bloco ${payload.bloco}` : '-'
  return formatCurrency(valorPreview(payload))
}

function previewMetaSecundaria(payload: Record<string, any>, tipo: string) {
  if (tipo === 'unidades') return payload.telefone || payload.email || '-'
  if (tipo === 'condominios') return dataPreview(payload, tipo) || '-'
  return formatDateBR(dataPreview(payload, tipo))
}

function descricaoLinha(payload: Record<string, any>, tipo: string) {
  if (isLegacy(tipo)) {
    return `${payload.responsavel_nome || 'Responsável não informado'} · acordo ${payload.numero_processo ? `proc. ${payload.numero_processo}` : 'extrajudicial'}`
  }

  if (tipo === 'condominios') return payload.nome || 'Condomínio sem nome'
  if (tipo === 'unidades') return `${payload.identificacao || payload.unidade || '-'} · ${payload.responsavel_nome || 'Responsável não informado'}`
  return `${payload.responsavel_nome || 'Responsável não informado'} · Unidade ${payload.unidade || '-'}`
}

function isDivergenciaConciliacao(mensagem: string) {
  return mensagem.toLowerCase().includes('diverg')
}

function isJaExistenteConciliacao(mensagem: string) {
  const normalizada = mensagem.toLowerCase()
  return normalizada.includes('ja existia') || normalizada.includes('já existia')
}

function isAusenteRelatorio(mensagem: string) {
  const normalizada = mensagem.toLowerCase()
  return normalizada.includes('ausente no relatório') || normalizada.includes('ausente no relatorio')
}

function MessageSummary({
  title,
  messages,
  tone = 'neutral',
  limit = 8,
}: {
  title: string
  messages: string[]
  tone?: 'neutral' | 'warning' | 'danger'
  limit?: number
}) {
  if (messages.length === 0) return null

  const toneClass = {
    neutral: 'bg-white/80 text-slate-700',
    warning: 'bg-amber-50 text-amber-800',
    danger: 'bg-rose-50 text-rose-700',
  }[tone]
  const titleClass = {
    neutral: 'text-slate-950',
    warning: 'text-amber-950',
    danger: 'text-rose-950',
  }[tone]
  const visible = messages.slice(0, limit)
  const remaining = Math.max(0, messages.length - visible.length)

  return (
    <div className={`rounded-2xl px-4 py-3 text-sm shadow-sm ${toneClass}`}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className={`font-medium ${titleClass}`}>{title}</p>
        <span className="text-xs font-medium opacity-70">{messages.length} ocorrência{messages.length === 1 ? '' : 's'}</span>
      </div>
      <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs leading-5">
        {visible.map((mensagem, index) => (
          <li key={`${title}-${index}`} className="break-words">
            {mensagem}
          </li>
        ))}
        {remaining > 0 ? (
          <li className="font-medium">+{remaining} ocorrência{remaining === 1 ? '' : 's'} omitida{remaining === 1 ? '' : 's'} nesta visualização.</li>
        ) : null}
      </ul>
    </div>
  )
}

export default async function ImportacaoDetalhePage({ params, searchParams }: PageProps) {
  const { id } = await params
  const query = searchParams ? await searchParams : {}
  const scope = await getPermittedCarteiras()

  const [importacao, itens] = await Promise.all([getImportacaoDetalhe(id, scope), listImportacaoItens(id)])

  if (!importacao) notFound()

  const resumo = asRecord(importacao.resumo)
  const importacaoStatus = safeStatus(importacao.status)
  const importacaoTipo = safeStatus(importacao.tipo, 'cobrancas')
  const resultadoFinal = resumo.resultado ? asRecord(resumo.resultado) : null
  const resultadoMensagens = asStringArray(resultadoFinal?.erros)
  const mensagensDivergentes = resultadoMensagens.filter(isDivergenciaConciliacao)
  const mensagensJaExistentes = resultadoMensagens.filter(isJaExistenteConciliacao)
  const mensagensAusentes = resultadoMensagens.filter(isAusenteRelatorio)
  const mensagensOutras = resultadoMensagens.filter((mensagem) => !isDivergenciaConciliacao(mensagem) && !isJaExistenteConciliacao(mensagem) && !isAusenteRelatorio(mensagem))
  const linhasComAlerta = itens.filter((item: any) =>
    getAlertas(asStringArray(item.erros)).some((alerta) => !isContatoEncontrado(alerta)),
  ).length
  const bloqueadas = itens.filter((item: any) => !item.valido).length
  const selecionadasCarregadas = itens.filter((item: any) => {
    const payload = asRecord(item.payload)
    return item.valido && (importacaoTipo !== 'cobrancas' || payload.importar_cobranca !== false)
  })
  const somenteHistoricoCarregadas = itens.filter((item: any) =>
    item.valido && importacaoTipo === 'cobrancas' && asRecord(item.payload).importar_cobranca === false,
  ).length
  const linhasSelecionadas = Number(resumo.linhas_selecionadas ?? selecionadasCarregadas.length)
  const linhasSomenteHistorico = Number(resumo.linhas_somente_historico ?? somenteHistoricoCarregadas)
  const valorSelecionado = Number(
    resumo.valor_total_selecionado
      ?? selecionadasCarregadas.reduce((total: number, item: any) => total + valorPreview(asRecord(item.payload)), 0),
  )
  const totalLinhas = Number(importacao.total_linhas ?? itens.length)
  const previewLimitado = totalLinhas > itens.length
  const canConfirm = ['preview', 'erro'].includes(importacaoStatus) && linhasSelecionadas > 0
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Preview de importação"
        title={importacao.arquivo_nome ?? 'Arquivo sem nome'}
        description={`${labelTipo(importacaoTipo)} - criada em ${formatDateBR(importacao.created_at)} - preview antes de gravar dados definitivos.`}
        actions={
          <>
            <ButtonLink href="/app/importacoes" variant="secondary">Voltar</ButtonLink>
            {canConfirm ? (
              <form id="confirmar-importacao-form" action={confirmarImportacao}>
                <input type="hidden" name="importacao_id" value={importacao.id} />
                <ConfirmarImportacaoButton />
              </form>
            ) : null}
          </>
        }
      />


      {resultadoFinal ? (
        <Card className="border-emerald-200 bg-emerald-50/80 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex gap-3">
              <div className="mt-0.5 rounded-2xl bg-white p-2 text-emerald-700 shadow-sm">
                <FileCheck2 size={20} />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-700">Importação efetivada</p>
                <h2 className="mt-2 text-lg font-medium text-slate-950">{resultadoFinal.mensagem ?? 'Importação concluída com sucesso.'}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Resultado gravado em {formatDateBR(resumo.finalizada_em)}. O arquivo saiu do modo preview e os dados válidos já foram aplicados na base.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {resultadoFinal.destino ? <ButtonLink href={resultadoFinal.destino} variant="secondary">Ver registros</ButtonLink> : null}
              <ButtonLink href="/app/importacoes/nova" variant="secondary">Nova importação</ButtonLink>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Importados</p>
              <p className="mt-2 text-2xl font-medium text-slate-950">{resultadoFinal.importados ?? 0}</p>
            </div>
            <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Criados vinculados</p>
              <p className="mt-2 text-2xl font-medium text-slate-950">{resultadoFinal.criados ?? 0}</p>
            </div>
            <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Atualizados</p>
              <p className="mt-2 text-2xl font-medium text-slate-950">{resultadoFinal.atualizados ?? 0}</p>
            </div>
            <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Ignorados</p>
              <p className="mt-2 text-2xl font-medium text-slate-950">{resultadoFinal.ignorados ?? 0}</p>
            </div>
            <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Divergentes</p>
              <p className="mt-2 text-2xl font-medium text-slate-950">{resultadoFinal.divergentes ?? mensagensDivergentes.length}</p>
            </div>
            <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Ausentes</p>
              <p className="mt-2 text-2xl font-medium text-slate-950">{resultadoFinal.ausentes ?? mensagensAusentes.length}</p>
            </div>
            <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Mensagens</p>
              <p className="mt-2 text-2xl font-medium text-slate-950">{resultadoMensagens.length}</p>
            </div>
          </div>

          {resultadoMensagens.length > 0 ? (
            <div className="mt-4 space-y-3">
              <MessageSummary title="Já existiam na base" messages={mensagensJaExistentes} />
              <MessageSummary title="Divergências para revisar" messages={mensagensDivergentes} tone="warning" />
              <MessageSummary title="Abertas ausentes no relatório" messages={mensagensAusentes} tone="warning" />
              <MessageSummary title="Outras ocorrências" messages={mensagensOutras} tone="danger" />
            </div>
          ) : null}
        </Card>
      ) : query.resultado === 'sucesso' ? (
        <Card className="border-emerald-200 bg-emerald-50/80 p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-white p-2 text-emerald-700 shadow-sm"><FileCheck2 size={20} /></div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-700">Importação efetivada</p>
              <h2 className="mt-2 text-lg font-medium text-slate-950">Importação concluída.</h2>
              <p className="mt-1 text-sm text-slate-600">Os dados válidos foram gravados. Recarregue a página caso o resumo detalhado ainda não apareça.</p>
            </div>
          </div>
        </Card>
      ) : null}

      {canConfirm && importacaoTipo === 'cobrancas' ? (
        <Card className="border-amber-200 bg-amber-50/80 p-5">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name="limpar_cobrancas_anteriores"
              form="confirmar-importacao-form"
              defaultChecked
              className="mt-1 size-4 rounded border-amber-300 accent-amber-700"
            />
            <span className="flex-1">
              <span className="flex items-center gap-2 text-sm font-semibold text-amber-950">
                <AlertTriangle size={17} />
                Limpar cobranças anteriores
              </span>
              <span className="mt-1 block text-sm leading-6 text-amber-900/80">
                Remove apenas cobranças com status Novo destes condomínios antes da importação.
              </span>
            </span>
          </label>
        </Card>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Card className="relative overflow-hidden p-5">
          <div className="absolute right-4 top-4 rounded-2xl bg-emerald-50 p-2 text-emerald-700"><CheckCircle2 size={18} /></div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Selecionadas</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{linhasSelecionadas}</p>
          <p className="mt-1 text-sm text-slate-500">linhas prontas para importar</p>
        </Card>

        <Card className="relative overflow-hidden p-5">
          <div className="absolute right-4 top-4 rounded-2xl bg-slate-100 p-2 text-slate-600"><FileCheck2 size={18} /></div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Somente histórico</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{linhasSomenteHistorico}</p>
          <p className="mt-1 text-sm text-slate-500">fora do recorte escolhido</p>
        </Card>

        <Card className="relative overflow-hidden p-5">
          <div className="absolute right-4 top-4 rounded-2xl bg-red-50 p-2 text-red-700"><ShieldX size={18} /></div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Bloqueadas</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{bloqueadas}</p>
          <p className="mt-1 text-sm text-slate-500">não serão importadas</p>
        </Card>

        <Card className="relative overflow-hidden p-5">
          <div className="absolute right-4 top-4 rounded-2xl bg-amber-50 p-2 text-amber-700"><AlertTriangle size={18} /></div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Alertas</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{linhasComAlerta}</p>
          <p className="mt-1 text-sm text-slate-500">pedem atenção no preview</p>
        </Card>

        <Card className="relative overflow-hidden p-5">
          <div className="absolute right-4 top-4 rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]"><WalletCards size={18} /></div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Valor selecionado</p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{formatCurrency(valorSelecionado)}</p>
          <p className="mt-1 text-sm text-slate-500">impacto financeiro previsto</p>
        </Card>
      </section>

      <section>
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-medium text-slate-950">Preview inteligente</h2>
            <p className="mt-1 text-sm text-slate-500">Revise vínculos, erros bloqueantes, alertas e impacto antes de gravar.</p>
            {previewLimitado ? (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                Exibindo as primeiras {itens.length} linhas de {totalLinhas}. Os totais acima consideram a importação completa.
              </p>
            ) : null}
          </div>

          <div className="divide-y divide-slate-100">
            {itens.map((item: any) => {
              const alertas = getAlertas(asStringArray(item.erros))
              const alertasPositivos = alertas.filter(isContatoEncontrado)
              const alertasAtencao = alertas.filter((alerta) => !isContatoEncontrado(alerta))
              const erros = getErrosBloqueantes(asStringArray(item.erros))
              const payload = asRecord(item.payload)
              const prioridade = payload.prioridade_estimada ?? (item.valido ? 'baixa' : 'bloqueada')

              return (
                <div key={item.id} className="grid gap-4 px-5 py-4 xl:grid-cols-[70px_170px_minmax(320px,1fr)_140px_140px_190px]">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Linha</p>
                    <p className="mt-1 text-sm font-medium text-slate-950">{item.linha}</p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Status</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge status={item.valido ? 'válida' : 'bloqueada'} />
                      <Badge tone={priorityTone(prioridade) as any}>{prioridade}</Badge>
                      {payload.unidade_nova ? <Badge tone="yellow">unidade nova</Badge> : null}
                      {payload.fora_regua_cobranca ? <Badge tone="slate">fora da régua</Badge> : null}
                      {payload.importar_cobranca === false ? <Badge tone="slate">somente histórico</Badge> : null}
                    </div>
                    {erros.length > 0 ? <div className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-700">{erros.join(' · ')}</div> : null}
                    {alertasPositivos.length > 0 ? <div className="mt-3 rounded-2xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{alertasPositivos.join(' · ')}</div> : null}
                    {alertasAtencao.length > 0 ? <div className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-700">{alertasAtencao.join(' · ')}</div> : null}
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Descrição</p>
                    <p className="mt-2 truncate text-sm font-medium text-slate-950">{descricaoLinha(payload, importacaoTipo)}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{payload.condominio_nome || payload.nome || 'Condomínio não localizado'} · CNPJ {payload.condominio_cnpj || payload.cnpj || '-'}</p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                      {importacaoTipo === 'unidades' ? 'Bloco' : 'Valor'}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-950">
                      {previewMetaPrimaria(payload, importacaoTipo)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                      {importacaoTipo === 'unidades'
                        ? 'Contato'
                        : importacaoTipo === 'condominios'
                          ? 'Dia da cota'
                          : 'Data'}
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {previewMetaSecundaria(payload, importacaoTipo)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Ação sugerida</p>
                    <p className="mt-2 text-sm text-slate-700">
                      {payload.acao_sugerida ?? (item.valido ? 'Pronta para importar' : 'Corrigir antes de importar')}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">score {payload.score_estimado ?? 0}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </section>
    </div>
  )
}
