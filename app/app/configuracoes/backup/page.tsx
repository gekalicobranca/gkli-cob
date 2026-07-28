import { DatabaseBackup, FileArchive, ShieldCheck } from 'lucide-react'
import { BackupSegurancaButton } from '@/components/configuracoes/backup-seguranca-button'
import { requireAdmin } from '@/utils/auth/require-admin'

export const dynamic = 'force-dynamic'

export default async function BackupSegurancaPage() {
  await requireAdmin()

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
            <DatabaseBackup size={23} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">
              Segurança administrativa
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Backup manual de emergência</h1>
          </div>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">
          Exporte uma cópia portátil dos dados e do esquema versionado para reconstrução
          independente do ambiente atual.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <FileArchive className="text-[#04799a]" size={22} />
          <h2 className="mt-4 text-base font-semibold text-slate-950">Conteúdo do pacote</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
            <li>Um CSV UTF-8 para cada tabela pública.</li>
            <li>Migrações SQL e configuração versionada do Supabase.</li>
            <li>Manifesto com quantidade de registros e estado de cada tabela.</li>
            <li>Instruções para reconstrução e validação.</li>
          </ul>
        </article>

        <article className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <ShieldCheck className="text-amber-700" size={22} />
          <h2 className="mt-4 text-base font-semibold text-slate-950">Arquivo confidencial</h2>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            O ZIP contém dados pessoais e financeiros. Depois do download, mova-o
            imediatamente para um cofre criptografado e restrito.
          </p>
          <div className="mt-5">
            <BackupSegurancaButton />
          </div>
        </article>
      </section>
    </div>
  )
}
