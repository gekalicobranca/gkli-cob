import {
  listAgenteAdministradoras,
  listAgenteExecucoes,
  listAgenteReceitas,
  listCarteirasParaAgente,
  getAgenteWorkerStatuses,
} from '@/features/agente-automatico/queries'
import { AGENTE_WORKERS } from '@/features/agente-automatico/workers'
import {
  criarAgenteAdministradora,
  criarAgenteReceita,
  executarAgenteReceita,
  limparAgenteExecucoes,
  marcarExecucaoComoSucessoManual,
  validarArquivoAgente,
} from '@/features/agente-automatico/actions'
import { LimparExecucoesButton } from './limpar-execucoes-button'
import { PageHeader } from '@/components/ui/page-header'
import { KpiCard } from '@/components/ui/kpi-card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/ui/status-badge'
import { getPermittedCarteiras } from '@/utils/auth/get-permitted-carteiras'
import {
  Activity,
  Bot,
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  FileDown,
  FileText,
  KeyRound,
  Play,
  Search,
  Settings2,
  TriangleAlert,
} from 'lucide-react'

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> }

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0]?.trim() ?? '' : value?.trim() ?? ''
}

function normalizar(value: string | null | undefined) {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
}

function contem(value: string | null | undefined, busca: string) {
  return normalizar(value).includes(normalizar(busca))
}

function formatarData(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value))
}

function formatarDataOpcional(value: string | null | undefined) {
  return value ? formatarData(value) : '—'
}

function resumirErro(value: string | null | undefined) {
  if (!value) return ''
  return value.split('\n')[0]?.trim() || value.trim()
}

function extrairCodigo(config: Record<string, any> | null | undefined) {
  const codigo = config?.codigo_portal || config?.codigo_cliente || config?.codigo_condominio || config?.codigo_credor
  return codigo ? String(codigo).trim() : ''
}

function credencialLabel(config: Record<string, any> | null | undefined) {
  const especial = String(config?.credencial_especial || config?.portal_segmento || config?.condominio || config?.condominio_portal || '')
  if (/safira/i.test(especial)) return 'Lello · Safira'
  if (/topazio/i.test(especial)) return 'Lello · Topazio'
  if (config?.login_env) return String(config.login_env)
  if (config?.acesso_portal || config?.perfil_acesso) return String(config.acesso_portal || config.perfil_acesso)
  return 'Padrão'
}

function scriptLabel(scriptKey: string | null | undefined) {
  const labels: Record<string, string> = {
    bbz_condopro_clock_vila_romana: 'BBZ / CondoPro',
    manager_atentum_cotas_pendentes: 'Manager / Atentum',
    villagua_condopro_square_guarulhos: 'Square Guarulhos',
    verti_winker_inadimplencia: 'Verti / Winker',
    captacao_atipass: 'Atipass',
    captacao_lello: 'Lello / COJUR',
  }
  return scriptKey ? labels[scriptKey] ?? scriptKey : 'Roteiro não informado'
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    sucesso: 'Sucesso',
    falha: 'Falha',
    em_execucao: 'Em execução',
    precisa_intervencao: 'Requer atenção',
    pendente: 'Pendente',
  }
  return labels[status] ?? status.replaceAll('_', ' ')
}

function statusTone(status: string): 'green' | 'red' | 'blue' | 'amber' | 'slate' {
  if (status === 'sucesso') return 'green'
  if (status === 'falha') return 'red'
  if (status === 'em_execucao') return 'blue'
  if (status === 'precisa_intervencao') return 'amber'
  return 'slate'
}

function Kpi({ icon, label, value, helper }: { icon: React.ReactNode; label: string; value: number; helper: string }) {
  return (
    <KpiCard
      label={label}
      value={value}
      hint={helper}
      icon={icon}
      className="rounded-2xl p-5"
    />
  )
}

function SectionSummary({ title, description, count }: { title: string; description: string; count?: number }) {
  return (
    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          {typeof count === 'number' ? (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{count}</span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <ChevronDown size={20} className="shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
    </summary>
  )
}

export default async function AgenteAutomaticoPage({ searchParams }: Props) {
  const params = await searchParams
  const scope = await getPermittedCarteiras()
  const carteiraIds = scope.carteiraIds
  const [carteiras, administradoras, receitas, execucoes, workerStatuses] = await Promise.all([
    listCarteirasParaAgente(carteiraIds),
    listAgenteAdministradoras(carteiraIds),
    listAgenteReceitas(carteiraIds),
    listAgenteExecucoes(carteiraIds),
    getAgenteWorkerStatuses(AGENTE_WORKERS.map((worker) => worker.scriptKey)),
  ])
  const workers = AGENTE_WORKERS.map((worker) => {
    const status = workerStatuses.find((item) => item.script_key === worker.scriptKey)
    return {
      ...worker,
      ultimoSinalEm: status?.ultimo_sinal_em ?? null,
      online: Boolean(status?.ultimo_sinal_em && Date.now() - new Date(status.ultimo_sinal_em).getTime() < 45_000),
    }
  })
  const workersOnline = workers.filter((worker) => worker.online).length
  const workerTone = workersOnline === workers.length ? 'green' : workersOnline > 0 ? 'amber' : 'red'
  const workerLabel = workersOnline === workers.length
    ? 'Agentes online'
    : workersOnline > 0
      ? `Agentes parcialmente online (${workersOnline}/${workers.length})`
      : 'Agentes offline'

  const totalSucesso = execucoes.filter((item) => item.status === 'sucesso').length
  const totalAtencao = execucoes.filter((item) => ['falha', 'precisa_intervencao'].includes(item.status)).length
  const totalEmAndamento = execucoes.filter((item) => ['pendente', 'em_execucao'].includes(item.status)).length

  const portalBusca = getParam(params?.portal_q)
  const portalOrdem = getParam(params?.portal_ordem) || 'nome_asc'
  const portaisFiltrados = administradoras
    .filter((item) => contem(`${item.nome} ${item.url_portal}`, portalBusca))
    .sort((a, b) => {
      const result = a.nome.localeCompare(b.nome, 'pt-BR')
      return portalOrdem === 'nome_desc' ? -result : result
    })

  const receitaBusca = getParam(params?.receita_q)
  const receitaOrdem = getParam(params?.receita_ordem) || 'nome_asc'
  const receitasFiltradas = receitas
    .filter((item) => contem(`${item.nome} ${item.administradora?.nome ?? ''} ${item.descricao ?? ''}`, receitaBusca))
    .sort((a, b) => {
      if (receitaOrdem === 'administradora') {
        return (a.administradora?.nome ?? '').localeCompare(b.administradora?.nome ?? '', 'pt-BR')
      }
      const result = a.nome.localeCompare(b.nome, 'pt-BR')
      return receitaOrdem === 'nome_desc' ? -result : result
    })
  const carteirasPorId = new Map(carteiras.map((carteira) => [carteira.id, carteira.nome]))
  const receitasPorCarteira = Array.from(
    receitasFiltradas.reduce((grupos, receita) => {
      const nome = carteirasPorId.get(receita.carteira_id) ?? 'Carteira não informada'
      const grupo = grupos.get(nome) ?? []
      grupo.push(receita)
      grupos.set(nome, grupo)
      return grupos
    }, new Map<string, typeof receitasFiltradas>()),
  ).sort(([nomeA], [nomeB]) => nomeA.localeCompare(nomeB, 'pt-BR'))
  const receitasPorCarteiraComAcao = receitasPorCarteira.map(([carteiraNome, receitasDoGrupo]) => ({
    carteiraNome,
    receitasDoGrupo,
  }))

  const execucaoBusca = getParam(params?.execucao_q)
  const execucaoStatus = getParam(params?.execucao_status)
  const execucaoOrdem = getParam(params?.execucao_ordem) || 'recentes'
  const execucoesFiltradas = execucoes
    .filter((item) => !execucaoStatus || item.status === execucaoStatus)
    .filter((item) => {
      const config = item.receita?.config_json
      return contem([
        item.receita?.nome ?? '',
        item.administradora?.nome ?? '',
        item.condominio?.nome ?? '',
        item.condominio?.nome_operacional ?? '',
        item.receita?.script_key ?? '',
        extrairCodigo(config),
        config?.condominio_portal ?? '',
        config?.codigo_portal_nome ?? '',
      ].join(' '), execucaoBusca)
    })
    .sort((a, b) => {
      if (execucaoOrdem === 'receita') return (a.receita?.nome ?? '').localeCompare(b.receita?.nome ?? '', 'pt-BR')
      const result = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      return execucaoOrdem === 'antigas' ? result : -result
    })

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="Inteligência · Automação"
        title="Agentes de coleta"
        description="Configure os acessos e roteiros usados para buscar relatórios nos portais das administradoras."
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <details className="group relative">
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden"><StatusBadge tone={workerTone} label={workerLabel} /></summary>
              <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Estado dos agentes</p>
                <div className="space-y-2">
                  {workers.map((worker) => (
                    <div key={worker.scriptKey} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-700">{worker.nome}</span>
                      <StatusBadge tone={worker.online ? 'green' : 'red'} label={worker.online ? 'Online' : 'Offline'} />
                    </div>
                  ))}
                </div>
              </div>
            </details>
            <ButtonLink href="/app/configuracoes/lab/captacao-automatizada" variant="secondary">
              <Settings2 size={16} /> Agenda de captação
            </ButtonLink>
          </div>
        )}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={<Bot size={18} />} label="Receitas ativas" value={receitas.length} helper={`${administradoras.length} administradora(s)`} />
        <Kpi icon={<Activity size={18} />} label="Em andamento" value={totalEmAndamento} helper="Pendentes ou executando" />
        <Kpi icon={<CheckCircle2 size={18} />} label="Concluídas" value={totalSucesso} helper="Nas últimas 50 execuções" />
        <Kpi icon={<TriangleAlert size={18} />} label="Requer atenção" value={totalAtencao} helper="Falhas ou intervenção" />
      </section>

      <section className="space-y-3">
        <div className="px-1">
          <h2 className="text-lg font-semibold text-slate-950">Cadastros de acesso</h2>
          <p className="mt-1 text-sm text-slate-500">Portais e receitas usados pelos agentes de coleta.</p>
        </div>

        <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <SectionSummary title="Portais de administradoras" description="Acessos disponíveis para os agentes de coleta." count={administradoras.length} />
          <div className="border-t border-slate-100 p-6">
            <form method="get" className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px_auto]">
              <label className="relative"><span className="sr-only">Buscar portal</span><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><Input name="portal_q" defaultValue={portalBusca} placeholder="Buscar administradora ou portal" className="pl-9" /></label>
              <Select name="portal_ordem" defaultValue={portalOrdem} aria-label="Ordenar portais"><option value="nome_asc">Nome: A–Z</option><option value="nome_desc">Nome: Z–A</option></Select>
              <div className="flex gap-2"><Button type="submit" variant="secondary">Filtrar</Button>{portalBusca || portalOrdem !== 'nome_asc' ? <ButtonLink href="/app/agente-automatico" variant="ghost">Limpar</ButtonLink> : null}</div>
            </form>
            {portaisFiltrados.length ? (
              <div className="mb-6 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                {portaisFiltrados.map((adm) => (
                  <div key={adm.id} className="flex flex-col justify-between gap-2 px-4 py-3 sm:flex-row sm:items-center">
                    <div>
                      <p className="font-medium text-slate-900">{adm.nome}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{adm.url_portal}</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      {adm.exige_captcha ? <span>Captcha</span> : null}
                      {adm.exige_2fa ? <span>2FA</span> : null}
                      <a href={adm.url_portal} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-sky-700 hover:text-sky-900">
                        Abrir portal <ExternalLink size={13} />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="mb-6 rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Nenhum portal encontrado.</div>}

            <div className="mb-4">
              <h3 className="text-base font-semibold text-slate-950">Cadastrar administradora</h3>
              <p className="mt-1 text-sm text-slate-500">Informe os dados básicos do portal. Usuário e senha permanecem no ambiente seguro.</p>
            </div>
            <form action={criarAgenteAdministradora} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block"><span className="text-sm text-slate-600">Carteira</span><Select name="carteira_id" required className="mt-1"><option value="">Selecione</option>{carteiras.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</Select></label>
                <label className="block"><span className="text-sm text-slate-600">Administradora</span><Input name="nome" required placeholder="Ex.: Administradora Modelo" className="mt-1" /></label>
                <label className="block md:col-span-2"><span className="text-sm text-slate-600">URL do portal</span><Input name="url_portal" required placeholder="https://portal..." className="mt-1" /></label>
                <label className="block"><span className="text-sm text-slate-600">Tipo de portal</span><Input name="tipo_portal" defaultValue="portal_web" className="mt-1" /></label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-600"><input name="exige_captcha" type="checkbox" /> Exige captcha</label>
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-600"><input name="exige_2fa" type="checkbox" /> Exige 2FA</label>
                </div>
                <label className="block md:col-span-2"><span className="text-sm text-slate-600">Observações</span><Textarea name="observacoes" rows={3} className="mt-1" /></label>
              </div>
              <div className="flex justify-end"><Button type="submit">Salvar administradora</Button></div>
            </form>
          </div>
        </details>

        <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <SectionSummary title="Receitas de coleta" description="Roteiros operacionais executados pelos agentes." count={receitas.length} />
          <div className="border-t border-slate-100 p-6">
            <div className="mb-4">
              <h3 className="text-base font-semibold text-slate-950">Cadastrar receita</h3>
              <p className="mt-1 text-sm text-slate-500">Vincule o roteiro a uma administradora e ao tipo de arquivo esperado.</p>
            </div>
            <form action={criarAgenteReceita} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block"><span className="text-sm text-slate-600">Carteira</span><Select name="carteira_id" required className="mt-1"><option value="">Selecione</option>{carteiras.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</Select></label>
                <label className="block"><span className="text-sm text-slate-600">Administradora</span><Select name="administradora_id" required className="mt-1"><option value="">Selecione</option>{administradoras.map((adm) => <option key={adm.id} value={adm.id}>{adm.nome}</option>)}</Select></label>
                <label className="block"><span className="text-sm text-slate-600">Nome da receita</span><Input name="nome" required placeholder="Ex.: Baixar inadimplência mensal" className="mt-1" /></label>
                <label className="block"><span className="text-sm text-slate-600">Arquivo esperado</span><Select name="tipo_arquivo_esperado" defaultValue="xlsx" className="mt-1"><option value="xlsx">XLSX</option><option value="xls">XLS</option><option value="csv">CSV</option><option value="pdf">PDF</option><option value="zip">ZIP</option></Select></label>
                <label className="block md:col-span-2"><span className="text-sm text-slate-600">Identificador do roteiro</span><Input name="script_key" placeholder="Ex.: adm_modelo_inadimplencia" className="mt-1" /></label>
                <label className="block md:col-span-2"><span className="text-sm text-slate-600">Descrição operacional</span><Textarea name="descricao" rows={4} placeholder="Ex.: Entrar no portal, acessar financeiro e exportar inadimplência..." className="mt-1" /></label>
              </div>
              <div className="flex justify-end"><Button type="submit">Salvar receita</Button></div>
            </form>
          </div>
        </details>
      </section>

      <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <SectionSummary title="Receitas disponíveis" description="Roteiros agrupados por carteira para iniciar uma coleta manual." count={receitas.length} />
        <form method="get" className="grid gap-3 border-t border-b border-slate-100 px-6 py-4 sm:grid-cols-[minmax(0,1fr)_220px_auto]">
          <label className="relative"><span className="sr-only">Buscar receita</span><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><Input name="receita_q" defaultValue={receitaBusca} placeholder="Buscar receita ou administradora" className="pl-9" /></label>
          <Select name="receita_ordem" defaultValue={receitaOrdem} aria-label="Ordenar receitas"><option value="nome_asc">Nome: A–Z</option><option value="nome_desc">Nome: Z–A</option><option value="administradora">Administradora</option></Select>
          <div className="flex gap-2"><Button type="submit" variant="secondary">Filtrar</Button>{receitaBusca || receitaOrdem !== 'nome_asc' ? <ButtonLink href="/app/agente-automatico" variant="ghost">Limpar</ButtonLink> : null}</div>
        </form>
        {receitasFiltradas.length ? (
          <div className="space-y-3 bg-slate-50/60 p-4 sm:p-6">
            {receitasPorCarteiraComAcao.map(({ carteiraNome, receitasDoGrupo }) => (
              <details key={carteiraNome} className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                  <div className="flex min-w-0 items-center gap-3">
                    <h3 className="truncate text-sm font-semibold text-slate-950">{carteiraNome}</h3>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{receitasDoGrupo.length}</span>
                  </div>
                  <ChevronDown size={18} className="shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
                </summary>
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  {receitasDoGrupo.map((receita) => (
                    <article key={receita.id} className="flex flex-col justify-between gap-4 px-5 py-4 lg:flex-row lg:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-medium text-slate-950">{receita.nome}</h4>
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{receita.tipo_arquivo_esperado.toUpperCase()}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{receita.administradora?.nome ?? 'Administradora não informada'}</p>
                        {receita.descricao ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{receita.descricao}</p> : null}
                      </div>
                      <form action={executarAgenteReceita} className="shrink-0">
                        <input type="hidden" name="receita_id" value={receita.id} />
                        <Button type="submit"><Play size={15} /> Executar coleta</Button>
                      </form>
                    </article>
                  ))}
                </div>
              </details>
            ))}
          </div>
        ) : <div className="border-t border-slate-100 p-8 text-center text-sm text-slate-500">Nenhuma receita encontrada.</div>}
      </details>

      <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <SectionSummary title="Execuções recentes" description="Últimas coletas, arquivos gerados e validações." count={execucoes.length} />
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <ButtonLink href="/app/configuracoes/lab/captacao-automatizada/historico" variant="secondary">Ver histórico completo</ButtonLink>
          <form action={limparAgenteExecucoes}><LimparExecucoesButton total={execucoes.length} /></form>
        </div>
        <form method="get" className="grid gap-3 border-t border-b border-slate-100 px-6 py-4 md:grid-cols-[minmax(0,1fr)_180px_190px_auto]">
          <label className="relative"><span className="sr-only">Buscar execução</span><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><Input name="execucao_q" defaultValue={execucaoBusca} placeholder="Buscar receita ou administradora" className="pl-9" /></label>
          <Select name="execucao_status" defaultValue={execucaoStatus} aria-label="Filtrar por status"><option value="">Todos os status</option><option value="pendente">Pendente</option><option value="em_execucao">Em execução</option><option value="sucesso">Sucesso</option><option value="falha">Falha</option><option value="precisa_intervencao">Requer atenção</option></Select>
          <Select name="execucao_ordem" defaultValue={execucaoOrdem} aria-label="Ordenar execuções"><option value="recentes">Mais recentes</option><option value="antigas">Mais antigas</option><option value="receita">Nome da receita</option></Select>
          <div className="flex gap-2"><Button type="submit" variant="secondary">Filtrar</Button>{execucaoBusca || execucaoStatus || execucaoOrdem !== 'recentes' ? <ButtonLink href="/app/agente-automatico" variant="ghost">Limpar</ButtonLink> : null}</div>
        </form>
        <div className="divide-y divide-slate-100">
          {execucoesFiltradas.slice(0, 15).map((execucao) => {
            const config = execucao.receita?.config_json
            const codigo = extrairCodigo(config)
            const erro = resumirErro(execucao.erro_mensagem)
            const condominioNome = execucao.condominio?.nome_operacional || execucao.condominio?.nome || config?.condominio || config?.condominio_portal || 'Condomínio não informado'

            return (
              <article key={execucao.id} className="px-6 py-5 transition hover:bg-slate-50/50">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={statusTone(execucao.status)} label={statusLabel(execucao.status)} />
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{scriptLabel(execucao.receita?.script_key)}</span>
                      {execucao.competencia ? <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{execucao.competencia}</span> : null}
                      {execucao.origem ? <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{execucao.origem}</span> : null}
                    </div>

                    <div>
                      <h3 className="text-sm font-semibold text-slate-950">{condominioNome}</h3>
                      <p className="mt-1 text-sm text-slate-600">{execucao.receita?.nome ?? 'Receita não informada'}</p>
                      <p className="mt-1 text-xs text-slate-500">{execucao.administradora?.nome ?? 'Administradora não informada'}</p>
                    </div>

                    <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Código usado</p>
                        <p className="mt-1 font-medium text-slate-900">{codigo || '—'}</p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Credencial</p>
                        <p className="mt-1 inline-flex items-center gap-1.5 font-medium text-slate-900"><KeyRound size={14} />{credencialLabel(config)}</p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Início</p>
                        <p className="mt-1 font-medium text-slate-900">{formatarDataOpcional(execucao.iniciado_em)}</p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Fim</p>
                        <p className="mt-1 font-medium text-slate-900">{formatarDataOpcional(execucao.finalizado_em)}</p>
                      </div>
                    </div>

                    {erro ? (
                      <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <p className="font-medium">Último erro</p>
                        <p className="mt-1 leading-6">{erro}</p>
                      </div>
                    ) : null}

                    {(execucao.arquivos ?? []).length ? (
                      <div className="flex flex-wrap gap-2">
                        {(execucao.arquivos ?? []).map((arquivo) => (
                          <a key={arquivo.id} href={`/api/agente-automatico/arquivos/${arquivo.id}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                            <FileText size={14} />
                            <span className="max-w-[260px] truncate">{arquivo.nome_arquivo}</span>
                            <StatusBadge status={arquivo.status_validacao} />
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2 xl:justify-end">
                    {(execucao.arquivos ?? []).map((arquivo) => (
                      <a key={arquivo.id} href={`/api/agente-automatico/arquivos/${arquivo.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50"><Download size={14} /> Baixar</a>
                    ))}
                    {execucao.status !== 'sucesso' ? (
                      <form action={marcarExecucaoComoSucessoManual}><input type="hidden" name="execucao_id" value={execucao.id} /><Button type="submit" variant="secondary" size="sm">Marcar sucesso</Button></form>
                    ) : null}
                    {(execucao.arquivos ?? []).length ? (
                      <>
                        <form action={validarArquivoAgente}><input type="hidden" name="execucao_id" value={execucao.id} /><input type="hidden" name="status" value="validado" /><Button type="submit" variant="secondary" size="sm">Validar</Button></form>
                        <form action={validarArquivoAgente}><input type="hidden" name="execucao_id" value={execucao.id} /><input type="hidden" name="status" value="rejeitado" /><Button type="submit" variant="danger" size="sm">Rejeitar</Button></form>
                      </>
                    ) : null}
                  </div>
                </div>
              </article>
            )
          })}
          {!execucoesFiltradas.length ? <div className="px-6 py-10 text-center text-sm text-slate-500"><FileDown size={22} className="mx-auto mb-2 text-slate-400" />Nenhuma execução encontrada.</div> : null}
        </div>
      </details>
    </main>
  )
}
