import Link from 'next/link'
import { MessageSquarePlus } from 'lucide-react'

import { PageHeader } from '@/components/ui/page-header'
import { ButtonLink } from '@/components/ui/button'
import { EmptyState } from '@/components/data/empty-state'
import { StatusBadge } from '@/components/data/status-badge'
import { countReguaEtapasPorTemplate, listTemplatesMensageria } from '@/features/mensageria/queries'

function formatCanal(canal: string) {
  switch (canal) {
    case 'email':
      return 'E-mail'
    case 'sms':
      return 'SMS'
    case 'whatsapp':
    default:
      return 'WhatsApp'
  }
}

export default async function TemplatesMensageriaPage() {
  const templates = await listTemplatesMensageria()
  const usageByTemplateId = await countReguaEtapasPorTemplate(
    templates.map((template) => template.id)
  )

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mensageria"
        title="Templates"
        description="Gerencie os templates utilizados nas réguas de cobrança e acordos."
        actions={
          <ButtonLink href="/app/mensageria/templates/novo" variant="header">
            <MessageSquarePlus className="h-4 w-4" />
            Novo template
          </ButtonLink>
        }
      />

      {templates.length === 0 ? (
        <EmptyState
          title="Nenhum template cadastrado"
          description="Crie templates para utilizar nas réguas de mensageria."
          action={{
            href: '/app/mensageria/templates/novo',
            label: 'Criar template',
          }}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="hidden grid-cols-12 gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500 xl:grid">
            <div className="col-span-4">Template</div>
            <div className="col-span-2">Canal</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Uso em réguas</div>
            <div className="col-span-2 text-right">Ações</div>
          </div>

          <div className="divide-y divide-slate-100">
            {templates.map((template: any) => (
              <div
                key={template.id}
                className="grid grid-cols-1 gap-4 px-6 py-5 xl:grid-cols-12 xl:items-center"
              >
                <div className="xl:col-span-4">
                  <div className="font-medium text-slate-900">
                    {template.nome}
                  </div>

                  {template.assunto ? (
                    <div className="mt-1 text-sm text-slate-500">
                      {template.assunto}
                    </div>
                  ) : null}
                </div>

                <div className="text-sm text-slate-600 xl:col-span-2">
                  {formatCanal(template.canal ?? 'whatsapp')}
                </div>

                <div className="xl:col-span-2">
                  <StatusBadge
                    label={template.ativo ? 'ativo' : 'inativo'}
                    tone={template.ativo ? 'green' : 'slate'}
                  />
                </div>

                <div className="text-sm text-slate-500 xl:col-span-2">
                  {usageByTemplateId.get(template.id) ?? 0} etapa(s)
                </div>

                <div className="flex items-center gap-2 xl:col-span-2 xl:justify-end">
                  <Link
                    href={`/app/mensageria/templates/${template.id}`}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Editar
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
