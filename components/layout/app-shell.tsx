"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

type ShellUser = {
  id?: string
  email?: string
  nome?: string
  perfil?: string
} | null

type AppShellProps = {
  children: React.ReactNode
  user?: ShellUser
}

const ACCENT = "#075F77"
const PRODUCT = "Cobrança"
const STORAGE_KEY = "gkli:cobranca:sidebar:v8"

const sections = [
  {
    title: "Cockpit",
    items: [{ label: "Cockpit", href: "/app/cockpit", icon: "chart" }],
  },
  {
    title: "Base Operacional",
    items: [
      { label: "Acordos", href: "/app/acordos", icon: "handshake" },
      { label: "Cobranças", href: "/app/cobrancas", icon: "money" },
      { label: "Régua de Cobrança", href: "/app/regua-cobranca", icon: "nodes" },
      { label: "Lotes", href: "/app/lotes", icon: "layers" },
      { label: "Mensageria", href: "/app/mensageria", icon: "message" },
    ],
  },
  {
    title: "Base Cadastral",
    items: [
      { label: "Unidades", href: "/app/unidades", icon: "home" },
      { label: "Condomínios", href: "/app/condominios", icon: "building" },
      { label: "Importações", href: "/app/importacoes", icon: "upload" },
      { label: "Conversão de Relatório", href: "/app/conversao-relatorio", icon: "document" },
    ],
  },
  {
    title: "Gestão",
    items: [
      { label: "Dashboard", href: "/app/dashboard", icon: "dashboard" },
      { label: "Carteiras x Usuários", href: "/app/carteiras-usuarios", icon: "users" },
    ],
  },
]

const iconPaths: Record<string, React.ReactNode> = {
  chart: <path d="M5 19V5M5 19H19M9 15V11M13 15V8M17 15V13" />,
  handshake: <path d="M7 12L10 15C11.1 16.1 12.9 16.1 14 15L17 12M8 10L10.5 7.5C11.3 6.7 12.7 6.7 13.5 7.5L16 10M4 12L7 9L10 12M20 12L17 9L14 12" />,
  money: <path d="M12 7V17M9 10C9 8.9 10.3 8 12 8C13.7 8 15 8.9 15 10C15 11.1 13.7 12 12 12C10.3 12 9 12.9 9 14C9 15.1 10.3 16 12 16C13.7 16 15 15.1 15 14M4 12A8 8 0 1 0 20 12A8 8 0 1 0 4 12" />,
  nodes: <path d="M6 8A2 2 0 1 0 6 4A2 2 0 0 0 6 8ZM18 20A2 2 0 1 0 18 16A2 2 0 0 0 18 20ZM6 20A2 2 0 1 0 6 16A2 2 0 0 0 6 20ZM8 6H12C14 6 15 7 15 9V15M8 18H16" />,
  layers: <path d="M12 4L4 8L12 12L20 8L12 4ZM4 12L12 16L20 12M4 16L12 20L20 16" />,
  message: <path d="M5 6H19V16H8L5 19V6Z" />,
  home: <path d="M4 11L12 4L20 11M6 10V20H18V10M10 20V14H14V20" />,
  building: <path d="M6 20V4H18V20M4 20H20M9 8H10M14 8H15M9 12H10M14 12H15M9 16H10M14 16H15" />,
  upload: <path d="M12 16V5M8 9L12 5L16 9M5 19H19" />,
  dashboard: <path d="M4 13H10V20H4V13ZM14 4H20V20H14V4ZM4 4H10V9H4V4Z" />,
  users: <path d="M9 11A3 3 0 1 0 9 5A3 3 0 0 0 9 11ZM3 20C3.7 16.7 5.8 15 9 15C12.2 15 14.3 16.7 15 20M16 11A2.5 2.5 0 1 0 16 6M18 20C17.8 18.4 17.2 17.2 16.2 16.3" />,
  document: <path d="M7 4H14L18 8V20H7V4ZM14 4V8H18M10 12H15M10 16H15" />,
}

const styles = {
  shell: {
    minHeight: "100vh",
    background: "#f8fafc",
    color: "#0f172a",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  sidebar: {
    position: "fixed" as const,
    inset: "0 auto 0 0",
    zIndex: 50,
    width: 256,
    borderRight: "1px solid #e2e8f0",
    background: "#fff",
    display: "flex",
    flexDirection: "column" as const,
  },
  brand: {
    height: 88,
    padding: "0 20px",
    borderBottom: "1px solid #eef2f7",
    display: "flex",
    alignItems: "center",
    gap: 12,
    textDecoration: "none",
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 16,
    background: ACCENT,
    color: "#fff",
    display: "grid",
    placeItems: "center",
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: "-0.03em",
    boxShadow: "0 10px 22px rgba(15, 23, 42, 0.10)",
  },
  brandKicker: {
    color: "#94a3b8",
    fontSize: 10,
    letterSpacing: "0.34em",
    textTransform: "uppercase" as const,
    fontWeight: 700,
    lineHeight: 1.2,
  },
  brandName: {
    color: "#020617",
    fontSize: 15,
    fontWeight: 700,
    lineHeight: 1.15,
    marginTop: 4,
    letterSpacing: "-0.02em",
  },
  nav: {
    flex: 1,
    minHeight: 0,
    padding: "14px 12px 8px",
    overflow: "hidden",
  },
  section: {
    marginBottom: 7,
  },
  sectionButton: {
    width: "100%",
    border: 0,
    background: "transparent",
    cursor: "pointer",
    padding: "7px 8px",
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    color: "#8da0bd",
    fontSize: 10,
    letterSpacing: "0.24em",
    textTransform: "uppercase" as const,
    fontWeight: 700,
    lineHeight: 1,
    textAlign: "left" as const,
    fontFamily: "inherit",
  },
  items: {
    paddingTop: 3,
    paddingBottom: 4,
    display: "grid",
    gap: 3,
  },
  item: {
    display: "flex",
    alignItems: "center",
    gap: 11,
    minHeight: 40,
    padding: "6px 10px",
    borderRadius: 16,
    color: "#334155",
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1,
    textDecoration: "none",
    transition: "background 160ms ease, box-shadow 160ms ease, color 160ms ease",
  },
  itemActive: {
    background: "#f1f5f9",
    color: "#020617",
    boxShadow: "0 8px 18px rgba(15, 23, 42, 0.06)",
  },
  iconBox: {
    width: 30,
    height: 30,
    flex: "0 0 30px",
    borderRadius: 12,
    border: "1px solid #dbe5f0",
    background: "#fff",
    color: ACCENT,
    display: "grid",
    placeItems: "center",
  },
  userBox: {
    margin: 12,
    borderRadius: 16,
    background: "#f1f5f9",
    padding: "12px 14px",
  },
  userEmail: {
    color: "#020617",
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  userRole: {
    marginTop: 4,
    color: "#64748b",
    fontSize: 11,
    lineHeight: 1.2,
  },
  main: {
    minHeight: "100vh",
    paddingLeft: 256,
  },
  content: {
    width: "100%",
    maxWidth: 1480,
    margin: "0 auto",
    padding: "24px 32px",
  },
}

function Icon({ name }: { name: string }) {
  return (
    <span style={styles.iconBox}>
      <svg
        viewBox="0 0 24 24"
        style={{ width: 15, height: 15, display: "block" }}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {iconPaths[name] || iconPaths.chart}
      </svg>
    </span>
  )
}

function isActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app"
  return pathname === href || pathname.startsWith(href + "/")
}

export function AppShell({ children, user }: AppShellProps) {
  const pathname = usePathname()

  const defaults = useMemo(() => {
    const state: Record<string, boolean> = {}
    sections.forEach((section) => {
      state[section.title] =
        section.title === "Cockpit" ||
        section.items.some((item) => isActive(pathname, item.href))
    })
    return state
  }, [pathname])

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(defaults)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      setOpenSections(saved ? { ...defaults, ...JSON.parse(saved) } : defaults)
    } catch {
      setOpenSections(defaults)
    }
  }, [defaults])

  function toggleSection(title: string) {
    setOpenSections((current) => {
      const next = { ...current, [title]: !current[title] }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  const displayName = user?.email || user?.nome || "Usuário GKLI"

  return (
    <div style={styles.shell}>
      <aside style={styles.sidebar}>
        <Link href="/app" style={styles.brand} title="Voltar para a página inicial de cards">
          <div style={styles.logo}>GK</div>
          <div style={{ minWidth: 0 }}>
            <div style={styles.brandKicker}>GKLI</div>
            <div style={styles.brandName}>{PRODUCT}</div>
          </div>
        </Link>

        <nav style={styles.nav}>
          {sections.map((section) => {
            const opened = !!openSections[section.title]

            return (
              <div key={section.title} style={styles.section}>
                <button
                  type="button"
                  onClick={() => toggleSection(section.title)}
                  style={styles.sectionButton}
                >
                  <span>{section.title}</span>
                  <span
                    style={{
                      color: "#94a3b8",
                      fontSize: 13,
                      transform: opened ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 160ms ease",
                    }}
                  >
                    ⌃
                  </span>
                </button>

                {opened ? (
                  <div style={styles.items}>
                    {section.items.map((item) => {
                      const active = isActive(pathname, item.href)

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          style={{
                            ...styles.item,
                            ...(active ? styles.itemActive : {}),
                          }}
                        >
                          <Icon name={item.icon} />
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {item.label}
                          </span>
                        </Link>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}
        </nav>

        <div style={styles.userBox}>
          <div style={styles.userEmail}>{displayName}</div>
          <div style={styles.userRole}>{user?.perfil || "Operação"}</div>
        </div>
      </aside>

      <main style={styles.main}>
        <div style={styles.content}>{children}</div>
      </main>
    </div>
  )
}

export default AppShell
