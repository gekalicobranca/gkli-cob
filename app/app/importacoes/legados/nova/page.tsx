import { FileSpreadsheet, Info, Table2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { createImportacaoLegadoPreview } from "@/features/importacoes/actions";

type NovaImportacaoLegadoPageProps = {
  searchParams?: Promise<{ tipo?: string }>;
};

const importTypes = [
  {
    value: "acordos_extra",
    label: "Acordos extrajudiciais legados",
    templateHref: "/templates/importacao-acordos-extra.xlsx",
    header:
      "condominio_cnpj;unidade;bloco;responsavel_nome;data_acordo;valor_original;despesa_cobranca_percentual;entrada;quantidade_parcelas;primeiro_vencimento;status;documento_url;observacoes",
    rule: "O fluxo legado exige condomínio e unidade já cadastrados. A confirmação cria acordos extrajudiciais e parcelas sem misturar com a importação operacional.",
  },
  {
    value: "acordos_judiciais",
    label: "Acordos judiciais legados",
    templateHref: "/templates/importacao-acordos-judiciais.xlsx",
    header:
      "condominio_cnpj;unidade;bloco;numero_processo;responsavel_nome;data_acordo;valor_original;despesa_cobranca_percentual;entrada;quantidade_parcelas;primeiro_vencimento;status;documento_url;observacoes",
    rule: "Acordos judiciais legados exigem número do processo e vínculo com unidade existente para preservar a separação judicial/extrajudicial.",
  },
];

function getSelectedType(tipo?: string) {
  return importTypes.find((item) => item.value === tipo) ?? importTypes[0];
}

export default async function NovaImportacaoLegadoPage({
  searchParams,
}: NovaImportacaoLegadoPageProps) {
  const params = await searchParams;
  const selected = getSelectedType(params?.tipo);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Importações legadas"
        title={`Nova importação legada · ${selected.label}`}
        description="Fluxo isolado para acordos históricos. Ele valida vínculos, valores e parcelas sem encostar nas regras de condomínios, unidades e cobranças."
      />

      <section className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <Card>
          <form action={createImportacaoLegadoPreview} className="space-y-5">
            <FormField label="Tipo de legado">
              <Select name="tipo" required defaultValue={selected.value}>
                {importTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField
              label="Arquivo XLSX"
              hint="Use o template oficial em XLSX. O sistema lê a aba DADOS e preserva datas, valores e zeros à esquerda."
            >
              <input
                name="arquivo"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                required
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-[var(--gkli-primary)] focus:ring-2 focus:ring-[var(--gkli-primary)]/20"
              />
            </FormField>

            <div className="flex flex-col justify-end gap-2 sm:flex-row">
              <ButtonLink href="/app/importacoes/legados" variant="secondary">
                Cancelar
              </ButtonLink>
              <Button type="submit">
                <FileSpreadsheet size={16} />
                Gerar preview legado
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
                {selected.rule}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                Cabeçalho recomendado
              </p>
              <ButtonLink
                href={selected.templateHref}
                variant="secondary"
                size="sm"
                download
              >
                <Table2 size={14} />
                Template
              </ButtonLink>
            </div>
            <pre className="mt-3 overflow-x-auto text-xs leading-6 text-slate-600">
              {selected.header}
            </pre>
          </div>
        </Card>
      </section>
    </div>
  );
}
