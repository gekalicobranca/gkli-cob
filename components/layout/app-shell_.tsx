'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { LogoutButton } from '@/components/auth/logout-button'

type SidebarItem = {
  label: string
  href: string
  icon?: string
  description?: string
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

const SIDEBAR_STORAGE_KEY = 'gkli:cobranca:sidebar:v12'
const GROUPS_STORAGE_KEY = 'gkli:cobranca:sidebar-groups:v1'

const cockpitItem: SidebarItem = {
  label: 'Cockpit operacional',
  href: '/app/cockpit',
  icon: 'chart',
  description: 'Prioridades e ações do dia',
}

const sections: SidebarSection[] = [
  {
    id: 'operacional',
    title: 'Base Operacional',
    items: [
      { label: 'Acordos', href: '/app/acordos', icon: 'handshake' },
      { label: 'Cobranças', href: '/app/cobrancas', icon: 'money' },
    ],
  },
  {
    id: 'mensageria',
    title: 'Mensageria e Régua',
    items: [
      { label: 'Mensageria', href: '/app/mensageria', icon: 'message' },
      { label: 'Templates', href: '/app/mensageria/templates', icon: 'document' },
      { label: 'Régua cobrança', href: '/app/regua-cobranca', icon: 'nodes' },
      { label: 'Régua acordo', href: '/app/regua-acordo', icon: 'repeat' },
      { label: 'Lotes', href: '/app/lotes', icon: 'layers' },
      { label: 'Logs', href: '/app/mensageria/log', icon: 'log' },
      { label: 'Saneamento', href: '/app/mensageria/saneamento', icon: 'shield' },
      { label: 'Inteligência da mensageria', href: '/app/mensageria/inteligencia', icon: 'spark' },
    ],
  },
{
  id: 'administradoras',
  title: 'Administradoras',
  items: [
    {
      label: 'Cadastro de administradoras',
      href: '/app/administradoras',
      icon: 'building',
    },
    {
      label: 'Solicitações ADM',
      href: '/app/administradoras/solicitacoes',
      icon: 'clipboard',
    },
    {
      label: 'Mensageria ADM',
      href: '/app/administradoras/mensageria',
      icon: 'message',
    },
    {
      label: 'Templates ADM',
      href: '/app/administradoras/templates',
      icon: 'document',
    },
    {
      label: 'Logs ADM',
      href: '/app/administradoras/logs',
      icon: 'log',
    },
    {
      label: 'Pendências externas',
      href: '/app/administradoras/pendencias',
      icon: 'alert',
    },
    {
      label: 'Timeline operacional',
      href: '/app/administradoras/timeline',
      icon: 'timeline',
    },
    {
      label: 'Inteligência operacional',
      href: '/app/administradoras/inteligencia',
      icon: 'spark',
    },
  ],
},{
  id: 'administradoras',
  title: 'Administradoras',
  items: [
    {
      label: 'Cadastro de administradoras',
      href: '/app/administradoras',
      icon: 'building',
    },
    {
      label: 'Solicitações ADM',
      href: '/app/administradoras/solicitacoes',
      icon: 'clipboard',
    },
    {
      label: 'Mensageria ADM',
      href: '/app/administradoras/mensageria',
      icon: 'message',
    },
    {
      label: 'Templates ADM',
      href: '/app/administradoras/templates',
      icon: 'document',
    },
    {
      label: 'Logs ADM',
      href: '/app/administradoras/logs',
      icon: 'log',
    },
    {
      label: 'Pendências externas',
      href: '/app/administradoras/pendencias',
      icon: 'alert',
    },
    {
      label: 'Timeline operacional',
      href: '/app/administradoras/timeline',
      icon: 'timeline',
    },
    {
      label: 'Inteligência operacional',
      href: '/app/administradoras/inteligencia',
      icon: 'spark',
    },
  ],
},
  {
    id: 'cadastro',
    title: 'Base Cadastral',
    items: [
      { label: 'Condomínios', href: '/app/condominios', icon: 'building' },
      { label: 'Unidades', href: '/app/unidades', icon: 'unit' },
      { label: 'Importações', href: '/app/importacoes', icon: 'upload' },
    ],
  },
  {
    id: 'gestao',
    title: 'Gestão',
    items: [
      { label: 'Dashboard', href: '/app/dashboard', icon: 'dashboard' },
      { label: 'Carteiras x Usuários', href: '/app/carteiras-usuarios', icon: 'users' },
    ],
  },
  {
    id: 'inteligencia',
    title: 'Inteligência',
    items: [
      { label: 'Assistente IA', href: '/app/ia', icon: 'bot' },
      { label: 'Inteligência operacional', href: '/app/inteligencia', icon: 'spark' },
      { label: 'Automações', href: '/app/automacoes', icon: 'gear' },
      { label: 'Agente automático', href: '/app/agente-automatico', icon: 'robot' },
      { label: 'Funil operacional', href: '/app/dashboard/funil', icon: 'funnel' },
      { label: 'Central analítica', href: '/app/analitica', icon: 'chart' },
      { label: 'Conversão de relatório', href: '/app/conversao-relatorio', icon: 'document' },
  
    ],
  },
]

function getIcon(icon?: string) {
  switch (icon) {
    case 'chart': return '◢'
    case 'money': return '$'
    case 'handshake': return '↔'
    case 'document': return '◫'
    case 'nodes': return '◎'
    case 'layers': return '▦'
    case 'message': return '▱'
    case 'building': return '▣'
    case 'unit': return '□'
    case 'home': return '⌂'
    case 'upload': return '↑'
    case 'bot': return '◉'
    case 'spark': return '✦'
    case 'gear': return '⚙'
    case 'robot': return '⬢'
    case 'dashboard': return '◫'
    case 'users': return '◌'
    case 'repeat': return '↻'
    case 'log': return '☰'
    case 'shield': return '◇'
    case 'funnel': return '▽'
    default: return '•'
  }
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

function isItemActive(pathname: string, href: string) {
  if (href === '/app') return pathname === '/app'
  return pathname === href || pathname.startsWith(`${href}/`)
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
      section.items.some((item) => isItemActive(pathname, item.href)),
    )

    if (!activeGroup) return

    setCollapsedGroups((current) =>
      current.filter((groupId) => groupId !== activeGroup.id),
    )
  }, [pathname])

  function toggleGroup(sectionId: string) {
    setCollapsedGroups((current) => {
      if (current.includes(sectionId)) {
        return current.filter((groupId) => groupId !== sectionId)
      }
      return [...current, sectionId]
    })
  }

  function renderItem(item: SidebarItem, options?: { featured?: boolean }) {
    const active = isItemActive(pathname, item.href)

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
          'group relative flex items-center rounded-2xl py-2.5 text-sm font-medium transition duration-150',
          collapsed ? 'justify-center px-0' : 'gap-3 px-3',
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

        {!collapsed && <span className="min-w-0 truncate">{item.label}</span>}
      </Link>
    )
  }

  return (
    <div className="flex min-h-screen bg-[var(--gkli-background)]">
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
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#04799a] to-[#005f7c] text-xs font-semibold text-white shadow-[0_10px_24px_rgba(0,105,136,0.24)]">
                GK
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
                ‹
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
                ›
              </button>
            </div>
          )}

          <nav className="gkli-scrollbar flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
            <div className="space-y-5">
              {renderItem(cockpitItem, { featured: true })}

              {sections.map((section) => {
                const groupCollapsed = collapsedGroups.includes(section.id)
                const groupActive = section.items.some((item) =>
                  isItemActive(pathname, item.href),
                )

                return (
                  <section key={section.id} className="space-y-2">
                    {!collapsed && (
                      <button
                        type="button"
                        onClick={() => toggleGroup(section.id)}
                        className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left transition hover:bg-white/70"
                      >
                        <span
                          className={[
                            'truncate text-[11px] font-semibold uppercase tracking-[0.28em]',
                            groupActive ? 'text-[#04799a]' : 'text-slate-400',
                          ].join(' ')}
                        >
                          {section.title}
                        </span>

                        <span
                          className={[
                            'text-xs text-slate-400 transition-transform',
                            groupCollapsed ? '-rotate-90' : 'rotate-0',
                          ].join(' ')}
                        >
                          ⌄
                        </span>
                      </button>
                    )}

                    {(!groupCollapsed || collapsed) && (
                      <div className="space-y-1">
                        {section.items.map((item) => renderItem(item))}
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

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1480px] p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
