'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Bot,
  Building2,
  CalendarDays,
  ChartNoAxesColumn,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  ClipboardList,
  DollarSign,
  FileText,
  FlaskConical,
  Gauge,
  Handshake,
  Home,
  Inbox,
  Layers,
  MessageSquare,
  Network,
  PanelTop,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  Upload,
  Users,
} from 'lucide-react'
import { LogoutButton } from '@/components/auth/logout-button'
import { GlobalOperationalSearch } from '@/components/search/global-operational-search'

type SidebarItem = {
  label: string
  href: string
  icon?: string
  description?: string
  gestorOnly?: boolean
  exact?: boolean
}

type SidebarSection = {
  id: string
  title: string
  items: SidebarItem[]
}

type AppShellUser = {
  id: string
  email?: string | null
  nome?: string | null
  perfil?: string | null
}

const SIDEBAR_STORAGE_KEY = 'gkli:cobranca:sidebar:v14-lite'
const GROUPS_STORAGE_KEY = 'gkli:cobranca:sidebar-groups:v3-lite'

const featuredItem: SidebarItem = {
  label: 'Inbox operacional',
  href: '/app/inbox',
  icon: 'inbox',
  description: 'Fila única do dia',
}

const sections: SidebarSection[] = [
  {
    id: 'operacao',
    title: 'Operação',
    items: [
      { label: 'Cobranças', href: '/app/cobrancas', icon: 'money' },
      { label: 'Acordos', href: '/app/acordos', icon: 'handshake' },
      { label: 'Controle de parcelas', href: '/app/acordos/fila', icon: 'clipboard' },
      { label: 'Pendências', href: '/app/pendencias', icon: 'alert' },
    ],
  },
  {
    id: 'cadastros',
    title: 'Cadastros',
    items: [
      { label: 'Condomínios', href: '/app/condominios', icon: 'building' },
      { label: 'Unidades', href: '/app/unidades', icon: 'unit' },
      { label: 'Responsáveis', href: '/app/responsaveis', icon: 'users' },
      { label: 'Administradoras', href: '/app/administradoras', icon: 'building' },
      { label: 'Importações', href: '/app/importacoes', icon: 'upload' },
    ],
  },
  {
    id: 'flows',
    title: 'Flows',
    items: [
      { label: 'Flow cobrança', href: '/app/flows/cobranca', icon: 'money' },
      { label: 'Flow acordos', href: '/app/flows/acordos', icon: 'handshake' },
    ],
  },
  {
    id: 'pre-juridico',
    title: 'Pré-Jurídico',
    items: [
      { label: 'Painel Pré', href: '/app/pre-juridico', icon: 'shield', exact: true },
      { label: 'Processamento', href: '/app/pre-juridico/processamento', icon: 'layers' },
      { label: 'Flow', href: '/app/pre-juridico/flow', icon: 'nodes' },
    ],
  },
  {
    id: 'automacao',
    title: 'Automação',
    items: [
      { label: 'Maestro', href: '/app/agente-automatico/maestro', icon: 'nodes' },
      { label: 'Agentes remotos', href: '/app/agente-automatico', icon: 'robot', exact: true },
      { label: 'Motor de conversão', href: '/app/conversao-relatorio', icon: 'document' },
      { label: 'Importação', href: '/app/importacoes', icon: 'upload' },
      { label: 'Validação', href: '/app/configuracoes/lab/captacao-automatizada', icon: 'shield' },
      { label: 'Keila', href: '/app/gestao/keila', icon: 'bot' },
    ],
  },
  {
    id: 'gestao',
    title: 'Gestão',
    items: [
      { label: 'Visão do síndico', href: '/app/gestao/visao-sindico', icon: 'home' },
      { label: 'Acionamentos acordos', href: '/app/gestao/acionamentos-acordos', icon: 'message' },
      { label: 'Fechamento mensal', href: '/app/gestao/fechamento', icon: 'calendar', gestorOnly: true },
    ],
  },
]

const settingsGroups: SidebarSection[] = [
  {
    id: 'comunicacao',
    title: 'Comunicação',
    items: [
      { label: 'Simulador', href: '/app/mensageria/simulador', icon: 'message' },
      { label: 'Templates', href: '/app/mensageria/templates', icon: 'document' },
      { label: 'Réguas', href: '/app/mensageria/reguas', icon: 'nodes' },
      { label: 'Lotes', href: '/app/lotes', icon: 'layers' },
      { label: 'Logs', href: '/app/mensageria/log', icon: 'log' },
      { label: 'Saneamento', href: '/app/mensageria/saneamento', icon: 'shield' },
    ],
  },
  {
    id: 'administracao',
    title: 'Administração',
    items: [
      { label: 'Central de configurações', href: '/app/configuracoes', icon: 'gear' },
      { label: 'Carteiras x Usuários', href: '/app/carteiras-usuarios', icon: 'users' },
      { label: 'Acessos síndicos', href: '/app/configuracoes/acessos-sindicos', icon: 'home' },
      { label: 'Solicitações ADM', href: '/app/administradoras/solicitacoes', icon: 'clipboard' },
      { label: 'Mensageria ADM', href: '/app/administradoras/mensageria', icon: 'message' },
    ],
  },
  {
    id: 'automacao',
    title: 'Automação e IA',
    items: [
      { label: 'Mensageria', href: '/app/mensageria', icon: 'message' },
      { label: 'Automações', href: '/app/automacoes', icon: 'gear' },
      { label: 'Assistente IA', href: '/app/ia', icon: 'bot' },
      { label: 'Inteligência operacional', href: '/app/inteligencia', icon: 'spark' },
      { label: 'Timeline operacional', href: '/app/timeline', icon: 'timeline' },
    ],
  },
  {
    id: 'gestao-avancada',
    title: 'Gestão avançada',
    items: [
      { label: 'Saúde sistema', href: '/app/gestao/saude-sistema', icon: 'alert' },
      { label: 'Saneamento cobranças', href: '/app/gestao/saneamento-cobrancas', icon: 'shield' },
    ],
  },
  {
    id: 'lab',
    title: 'Lab',
    items: [
      { label: 'Dashboard', href: '/app/dashboard', icon: 'dashboard' },
      { label: 'Lab experimental', href: '/app/configuracoes/lab', icon: 'beaker' },
      { label: 'Captação automatizada', href: '/app/configuracoes/lab/captacao-automatizada', icon: 'bot' },
      { label: 'Lite legado', href: '/app/configuracoes/lab/lite', icon: 'spark' },
      { label: 'Mobile', href: '/app/configuracoes/lab/mobile', icon: 'mobile' },
      { label: 'Workspace Focus', href: '/app/configuracoes/lab/workspace/demo/focus', icon: 'target' },
      { label: 'Workspace Smart', href: '/app/configuracoes/lab/workspace/demo/smart', icon: 'spark' },
      { label: 'Workspace Mobile', href: '/app/configuracoes/lab/workspace/demo/mobile', icon: 'mobile' },
    ],
  },
]

function getIcon(icon?: string) {
  const icons = {
    alert: AlertTriangle,
    beaker: FlaskConical,
    bot: Bot,
    building: Building2,
    calendar: CalendarDays,
    chart: ChartNoAxesColumn,
    clipboard: ClipboardList,
    dashboard: Gauge,
    document: FileText,
    gear: Settings,
    handshake: Handshake,
    home: Home,
    inbox: Inbox,
    layers: Layers,
    log: PanelTop,
    message: MessageSquare,
    mobile: Smartphone,
    money: DollarSign,
    nodes: Network,
    robot: Bot,
    shield: ShieldCheck,
    spark: Sparkles,
    target: Target,
    timeline: CircleDot,
    unit: Home,
    upload: Upload,
    users: Users,
  } as const
  const Icon = icons[icon as keyof typeof icons] ?? CircleDot
  return <Icon size={16} strokeWidth={2} aria-hidden="true" />
}

function safeParseGroups(value: string | null) {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

function isItemActive(pathname: string, href: string, exact = false) {
  const hrefPath = href.split('?')[0]
  if (hrefPath === '/app' || exact) return pathname === hrefPath
  return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`)
}

function isGestorUser(user?: AppShellUser) {
  const perfil = String(user?.perfil ?? '').toLowerCase()
  return ['admin', 'gestor', 'manager', 'owner'].includes(perfil)
}

function filterItemsForUser(items: SidebarItem[], user?: AppShellUser) {
  if (isGestorUser(user)) return items
  return items.filter((item) => !item.gestorOnly)
}

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode
  user?: AppShellUser
}) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const savedSidebar = window.localStorage.getItem(SIDEBAR_STORAGE_KEY)
    const savedGroups = window.localStorage.getItem(GROUPS_STORAGE_KEY)

    setCollapsed(savedSidebar === 'collapsed')
    setCollapsedGroups(safeParseGroups(savedGroups))
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? 'collapsed' : 'expanded')
  }, [collapsed, mounted])

  useEffect(() => {
    if (!mounted) return
    window.localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(collapsedGroups))
  }, [collapsedGroups, mounted])

  useEffect(() => {
    const activeGroup = sections.find((section) =>
      section.items.some((item) => isItemActive(pathname, item.href, item.exact)),
    )

    if (!activeGroup) return

    setCollapsedGroups((current) =>
      current.filter((groupId) => groupId !== activeGroup.id),
    )
  }, [pathname])

  useEffect(() => {
    setSettingsOpen(false)
  }, [pathname])

  function toggleGroup(sectionId: string) {
    setCollapsedGroups((current) => {
      if (current.includes(sectionId)) {
        return current.filter((groupId) => groupId !== sectionId)
      }
      return [...current, sectionId]
    })
  }

  function renderItem(item: SidebarItem, options?: { featured?: boolean; compact?: boolean }) {
    const active = isItemActive(pathname, item.href, item.exact)

    if (options?.featured) {
      return (
        <Link
          key={item.href}
          href={item.href}
          title={collapsed ? item.label : undefined}
          className={[
            'group flex items-center rounded-[22px] bg-gradient-to-br from-[#04799a] via-[#03658C] to-[#024F6F] text-white shadow-[0_18px_42px_rgba(3,101,140,0.28)] ring-1 ring-white/10 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_48px_rgba(3,101,140,0.34)]',
            collapsed ? 'mx-auto h-12 w-12 justify-center' : 'gap-3 px-4 py-3.5',
          ].join(' ')}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/16 text-[13px] font-semibold text-white ring-1 ring-white/15">
            {getIcon(item.icon)}
          </span>

          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold leading-5 text-white">
                {item.label}
              </span>
              {item.description ? (
                <span className="block truncate text-[11px] font-medium text-white/78">
                  {item.description}
                </span>
              ) : null}
            </span>
          )}
        </Link>
      )
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={[
          'group relative flex items-center rounded-2xl text-sm font-medium transition duration-150',
          options?.compact ? 'gap-3 px-3 py-2' : collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
          active
            ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-200/80 before:absolute before:left-0 before:top-1/2 before:h-7 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-[#04799a]'
            : 'text-slate-600 hover:bg-white/80 hover:text-slate-950 hover:shadow-sm hover:ring-1 hover:ring-slate-200/70',
        ].join(' ')}
      >
        <span
          className={[
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[13px] transition',
            active
              ? 'bg-[#e8f6fb] text-[#04799a]'
              : 'bg-slate-100 text-slate-500 group-hover:bg-[#edf8fb] group-hover:text-[#04799a]',
          ].join(' ')}
        >
          {getIcon(item.icon)}
        </span>

        {(!collapsed || options?.compact) && <span className="min-w-0 truncate">{item.label}</span>}
      </Link>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--gkli-background)]">
      <aside
        className={[
          'sticky top-0 h-screen shrink-0 overflow-hidden border-r border-slate-200/75 bg-[#f8fafc] transition-[width] duration-200 ease-in-out',
          collapsed ? 'w-[84px]' : 'w-[282px]',
        ].join(' ')}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-[76px] items-center justify-between gap-3 border-b border-slate-200/75 px-4">
            <Link
              href="/app"
              className={[
                'flex min-w-0 items-center gap-3 rounded-2xl transition hover:opacity-90',
                collapsed ? 'mx-auto' : '',
              ].join(' ')}
              title="GKLI Cobrança"
            >
              <span className="relative flex h-11 w-11 shrink-0 overflow-hidden rounded-2xl bg-[#004b63] shadow-[0_10px_24px_rgba(0,75,99,0.24)] ring-1 ring-white/70">
                <Image
                  src="/logo-gkli-menu-icon.png"
                  alt="GKLI"
                  fill
                  priority
                  className="object-cover"
                  sizes="44px"
                />
              </span>

              {!collapsed && (
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                    GKLI
                  </span>
                  <span className="block truncate text-lg font-semibold tracking-tight text-slate-950">
                    Cobrança
                  </span>
                </span>
              )}
            </Link>

            {!collapsed && (
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-sm text-slate-400 transition hover:bg-white hover:text-[#04799a] hover:shadow-sm hover:ring-1 hover:ring-slate-200"
                aria-label="Recolher menu"
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
            )}
          </div>

          {collapsed && (
            <div className="border-b border-slate-200/75 px-3 py-3">
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-sm text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:text-[#04799a]"
                aria-label="Expandir menu"
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          )}

          <nav className="gkli-scrollbar flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
            <div className="space-y-5">
              {renderItem(featuredItem, { featured: true })}

              {sections.map((section) => {
                const visibleItems = filterItemsForUser(section.items, user)
                if (visibleItems.length === 0) return null
                const groupCollapsed = collapsedGroups.includes(section.id)

                return (
                  <section key={section.id} className="space-y-2">
                    {!collapsed && (
                      <button
                        type="button"
                        onClick={() => toggleGroup(section.id)}
                        className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left transition hover:bg-white/70"
                      >
                        <span
                          className="truncate text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400"
                        >
                          {section.title}
                        </span>

                        <span
                          className={[
                            'text-xs text-slate-400 transition-transform',
                            groupCollapsed ? '-rotate-90' : 'rotate-0',
                          ].join(' ')}
                        >
                          <ChevronDown size={14} aria-hidden="true" />
                        </span>
                      </button>
                    )}

                    {(!groupCollapsed || collapsed) && (
                      <div className="space-y-1">
                        {visibleItems.map((item) => renderItem(item))}
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          </nav>

          <div className="border-t border-slate-200/75 p-3">
            {!collapsed ? (
              <div className="rounded-2xl bg-white px-3 py-3 shadow-sm ring-1 ring-slate-200/75">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[12px] font-semibold text-white">
                    {(user?.nome || user?.email || 'GK').slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-slate-800">
                      {user?.nome || 'Usuário'}
                    </div>
                    <div className="truncate text-[11px] text-slate-500">
                      {user?.email || 'Autenticado'}
                    </div>
                  </div>
                  <LogoutButton />
                </div>
              </div>
            ) : (
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                {(user?.nome || user?.email || 'GK').slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="gkli-app-main min-w-0 flex-1">
        <div className="gkli-app-frame mx-auto max-w-[1480px] p-3 xl:p-4">
          <header className="gkli-app-header z-30 mb-3 rounded-[1rem] border border-slate-200/75 bg-white/88 px-3 py-2.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/72">
            <div className="grid items-center gap-3 lg:grid-cols-[minmax(110px,150px)_minmax(320px,1fr)_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-[#d7eef5] bg-[#edf8fb] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#04799a]">
                    GKLI Cob
                  </span>
                </div>
              </div>

              <GlobalOperationalSearch />

              <div className="relative flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSettingsOpen((value) => !value)}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-950 px-3 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800"
                  aria-expanded={settingsOpen}
                  aria-label="Abrir configurações"
                >
                  <Settings size={16} aria-hidden="true" />
                  <span className="hidden sm:inline">Configurações</span>
                </button>

                {settingsOpen && (
                  <div className="absolute right-0 top-12 z-50 w-[min(92vw,760px)] rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-900/12">
                    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">Configurações e recursos avançados</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          Parametrizações, automações, administração e Lab ficam fora do fluxo diário para manter a operação limpa.
                        </p>
                      </div>
                      <Link
                        href="/app/configuracoes"
                        className="shrink-0 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 transition hover:text-[#04799a]"
                      >
                        Ver central
                      </Link>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-4">
                      {settingsGroups.map((group) => (
                        <section key={group.id}>
                          <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                            {group.title}
                          </h2>
                          <div className="space-y-1">
                            {group.items.map((item) => renderItem(item, { compact: true }))}
                          </div>
                        </section>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          <div className="gkli-app-content">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}
