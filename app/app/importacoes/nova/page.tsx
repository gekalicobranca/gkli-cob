import { FileSpreadsheet, Info } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { Button, ButtonLink } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { FormField } from '@/components/ui/form-field'
import { createImportacaoPreview } from '@/features/importacoes/actions'

export default async function NovaImportacaoPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Importações"
        title="Nova importação"
        description="Envie um CSV para gerar preview inteligente, validar CNPJs, bloquear erros críticos e estimar impacto operacional."
      />

      <section className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <Card>
          <form action={createImportacaoPreview} className="space-y-5">
            <FormField label="Tipo de importação">
              <Select name="tipo" required defaultValue="cobrancas">
                <option value="cobrancas">Cobranças</option>
                <option value="condominios">Condomínios</option>
                <option value="unidades">Unidades</option>
              </Select>
            </FormField>

            <FormField
              label="Arquivo CSV"
              hint="Use preferencialmente separador ponto e vírgula (;)."
            >
              <input
                name="arquivo"
                type="file"
                accept=".csv,text/csv"
                required
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-[var(--gkli-primary)] focus:ring-2 focus:ring-[var(--gkli-primary)]/20"
              />
            </FormField>

            <div className="flex justify-end gap-2">
              <ButtonLink href="/app/importacoes" variant="secondary">
                Cancelar
              </ButtonLink>
              <Button type="submit">
                <FileSpreadsheet size={16} />
                Gerar preview
              </Button>
            </div>
          </form>
        </Card>

        <Card className="border-[var(--gkli-primary)]/20 bg-[var(--gkli-primary-light)]/50">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-white p-2 text-[var(--gkli-primary)]">
              <Info size={18} />
            </div>
            <div>
              <h2 className="text-base font-medium text-slate-950">
                Regra principal
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Para cobranças, o condomínio será localizado exclusivamente pelo CNPJ. Se o CNPJ não existir na base, a linha será bloqueada e não será importada.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
              Cabeçalho recomendado para cobranças
            </p>
            <pre className="mt-3 overflow-x-auto text-xs leading-6 text-slate-600">
{`condominio_cnpj;unidade;bloco;responsavel_nome;responsavel_documento;telefone;email;competencia;vencimento;valor_original;valor_atualizado;observacoes`}
            </pre>
          </div>
        </Card>
      </section>
    </div>
  )
}
