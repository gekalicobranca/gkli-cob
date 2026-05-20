import Link from 'next/link'
import {
  ArrowRight,
  BellRing,
  Bot,
  Database,
  FileSpreadsheet,
  KeyRound,
  MessageSquareText,
  Plug,
  ShieldCheck,
  SlidersHorizontal,
  UsersRound,
  WalletCards,
} from 'lucide-react'

type ConfigCard = {
  title: string
  description: string
  href: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  tag: string
}

const groups: Array<{
  title: string
  description: string
  cards: ConfigCard[]
}> = [
  {
    title: 'Automação',
    description: 'Réguas, lotes, gatilhos e rotinas automáticas ficam fora da operação diária.',
    cards: [
      {
        title: 'Automações de cobrança',
        description: 'Central para réguas, etapas e regras automáticas.',
        href: '/app/reguas',
        icon: Bot,
        tag: 'Motor',
      },
      {
        title: 'Execuções e lotes',
        description: 'Acompanhe processamentos, falhas e reprocessamentos.',
        href: '/app/lotes',
        icon: SlidersHorizontal,
        tag: 'Avançado',
      },
    ],
  },
  {
    title: 'Mensagens',
    description: 'Modelos e canais de comunicação parametrizados sem poluir a rotina do operador.',
    cards: [
      {
        title: 'Templates',
        description: 'Configure mensagens de WhatsApp, e-mail e SMS.',
        href: '/app/mensageria/templates',
        icon: MessageSquareText,
        tag: 'Conteúdo',
      },
      {
        title: 'Disparos e logs',
        description: 'Consulte envios, retornos e falhas de comunicação.',
        href: '/app/mensageria',
        icon: BellRing,
        tag: 'Logs',
      },
    ],
  },
  {
    title: 'Dados cadastrais',
    description: 'Cadastros estruturais necessários para a operação.',
    cards: [
      {
        title: 'Importações',
        description: 'Carregue condomínios, unidades e cobranças.',
        href: '/app/importacoes',
        icon: FileSpreadsheet,
        tag: 'Dados',
      },
      {
        title: 'Carteiras',
        description: 'Organize escopos operacionais e vínculos.',
        href: '/app/carteiras',
        icon: WalletCards,
        tag: 'Escopo',
      },
      {
        title: 'Administradoras',
        description: 'Mantenha cadastros institucionais vinculados aos condomínios.',
        href: '/app/administradoras',
        icon: Database,
        tag: 'Cadastro',
      },
    ],
  },
  {
    title: 'Segurança e acesso',
    description: 'Usuários, permissões e controle administrativo.',
    cards: [
      {
        title: 'Usuários x Carteiras',
        description: 'Controle acesso operacional por carteira.',
        href: '/app/administrativo',
        icon: UsersRound,
        tag: 'Admin',
      },
      {
        title: 'Permissões',
        description: 'Perfis, permissões e escopos de segurança.',
        href: '/app/administrativo/permissoes',
        icon: ShieldCheck,
        tag: 'Segurança',
      },
      {
        title: 'Chaves e ambiente',
        description: 'Área reservada para integrações e parâmetros técnicos.',
        href: '/app/configuracoes/ambiente',
        icon: KeyRound,
        tag: 'Técnico',
      },
    ],
  },
  {
    title: 'Integrações',
    description: 'Conexões externas e canais operacionais.',
    cards: [
      {
        title: 'Canais externos',
        description: 'WhatsApp, SMTP, provedores e APIs.',
        href: '/app/configuracoes/integracoes',
        icon: Plug,
        tag: 'Integrações',
      },
    ],
  },
]

function ConfigCard({ card }: { card: ConfigCard }) {
  const Icon = card.icon

  return (
    <Link
      href={card.href}
      className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#04799a]/40 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#edf8fb] text-[#04799a]">
          <Icon size={21} />
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {card.tag}
        </span>
      </div>

      <h3 className="mt-5 text-base font-semibold text-slate-950">{card.title}</h3>
      <p className="mt-2 min-h-[44px] text-sm leading-6 text-slate-500">{card.description}</p>

      <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#04799a]">
        Abrir
        <ArrowRight size={16} className="transition group-hover:translate-x-1" />
      </div>
    </Link>
  )
}

export function ConfiguracoesHub() {
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
        <div className="pointer-events-none absolute right-8 top-0 h-48 w-48 rounded-full bg-[#04799a]/40 blur-3xl" />
        <div className="relative max-w-4xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#d7eef5]">
            Configurações avançadas
          </span>

          <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-4xl">
            A potência do sistema fica aqui. A operação fica limpa.
          </h1>

          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">
            Esta central concentra parametrizações, automações, integrações e acessos administrativos.
            A navegação principal permanece focada no trabalho diário do operador.
          </p>
        </div>
      </section>

      {groups.map((group) => (
        <section key={group.title} className="space-y-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-950">{group.title}</h2>
              <p className="text-sm leading-6 text-slate-500">{group.description}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {group.cards.map((card) => (
              <ConfigCard key={card.href} card={card} />
            ))}
          </div>
        </section>
      ))}

      <section className="rounded-[2rem] border border-[#d7eef5] bg-[#f5fbfd] p-5">
        <h2 className="text-base font-semibold text-slate-950">Regra de produto</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
          Tudo que for parametrização, integração, template, regra, lote, régua ou permissão deve ficar nesta área.
          A operação diária deve manter somente aquilo que gera ação imediata.
        </p>
      </section>
    </div>
  )
}
