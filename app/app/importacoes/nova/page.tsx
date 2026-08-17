import {
  AlertTriangle,
  CheckCircle2,
  Info,
  LockKeyhole,
  Table2,
  UploadCloud,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { createImportacaoPreview } from "@/features/importacoes/actions";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { getCondominioIntegral } from "@/features/condominios/queries";
import { GerarPreviewButton } from "./gerar-preview-button";

type NovaImportacaoPageProps = {
  searchParams?: Promise<{ tipo?: string; condominio_id?: string; erro?: string }>;
};

const importTypes = [
  {
    value: "cobrancas",
    label: "Cobranças",
    templateHref: "/templates/importacao-cobrancas.xlsx",
    header:
      "condominio_cnpj;unidade;bloco;responsavel_nome;responsavel_documento;telefone;email;competencia;vencimento;valor_original;valor_atualizado;observacoes",
    rule: "Para cobranças, o condomínio será localizado exclusivamente pelo CNPJ. Se o CNPJ não existir na base, a linha será bloqueada.",
  },
  {
    value: "condominios",
    label: "Condomínios",
    templateHref: "/templates/importacao-condominios.xlsx",
    header:
      "carteira;nome;cnpj;administradora;vencimento_cota_dia;valor_cota_condominial;inicio_cobranca_dias;dias_expiracao_regua_pre_juridico;observacoes",
    rule: "Condomínios entram como cadastro base sempre vinculados à carteira informada no XLSX. O CNPJ é obrigatório; duplicidade no arquivo mantém a primeira linha e bloqueia as demais.",
  },
  {
    value: "unidades",
    label: "Responsáveis",
    templateHref: "/templates/importacao-unidades.xlsx",
    header:
      "condominio_cnpj;identificacao;bloco;tipo;responsavel_nome;tipo_responsavel;responsavel_documento;telefone;email;observacoes",
    rule: "Responsáveis são vinculados ao condomínio pelo CNPJ e à combinação bloco/unidade. A importação atualiza a base de apoio de contatos e não cria unidade operacional.",
  },
  {
    value: "acordos_extra",
    label: "Legado · Acordos extra",
    templateHref: "/templates/importacao-acordos-extra.xlsx",
    header:
      "condominio_cnpj;unidade;bloco;responsavel_nome;data_acordo;valor_original;despesa_cobranca_percentual;entrada;quantidade_parcelas;primeiro_vencimento;status;documento_url;observacoes",
    rule: "Legados extrajudiciais exigem condomínio e unidade já cadastrados. A confirmação cria acordos e parcelas somente depois do preview.",
  },
  {
    value: "acordos_judiciais",
    label: "Legado · Acordos judiciais",
    templateHref: "/templates/importacao-acordos-judiciais.xlsx",
    header:
      "condominio_cnpj;unidade;bloco;numero_processo;responsavel_nome;data_acordo;valor_original;despesa_cobranca_percentual;entrada;quantidade_parcelas;primeiro_vencimento;status;documento_url;observacoes",
    rule: "Legados judiciais exigem número do processo, vínculo por CNPJ/unidade e só gravam acordos/parcelas após confirmação expressa.",
  },
];

const activeImportTypes = importTypes.filter(
  (item) => item.value !== "acordos_extra" && item.value !== "acordos_judiciais",
);

function getSelectedType(tipo?: string) {
  return activeImportTypes.find((item) => item.value === tipo) ?? activeImportTypes[0];
}

export default async function NovaImportacaoPage({
  searchParams,
}: NovaImportacaoPageProps) {
  const params = await searchParams;
  const scope = await getPermittedCarteiras();
  const selected = getSelectedType(params?.tipo);
  const condominioPadrao = params?.condominio_id
    ? await getCondominioIntegral(params.condominio_id, scope)
    : null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Importações"
        title={`Nova importação · ${selected.label}`}
        description="Upload controlado em etapas: arquivo, validação, preview, impacto e confirmação. O tipo já vem definido pelo card escolhido."
        actions={
          <ButtonLink href="/app/importacoes" variant="secondary">
            Voltar para central
          </ButtonLink>
        }
      />

      <section className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-[var(--gkli-primary)] px-3 py-1 !text-white">
                1. Upload
              </span>
              <span>2. Validação</span>
              <span>3. Preview</span>
              <span>4. Confirmação</span>
            </div>
          </div>

          <form action={createImportacaoPreview} className="space-y-5 p-5">
            <input type="hidden" name="tipo" value={selected.value} />
            {condominioPadrao ? (
              <input
                type="hidden"
                name="condominio_id_padrao"
                value={condominioPadrao.id}
              />
            ) : null}

            {params?.erro ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <p>{params.erro}</p>
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-[var(--gkli-primary)]/20 bg-[var(--gkli-primary-light)]/45 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-white p-2 text-[var(--gkli-primary)] shadow-sm">
                  <LockKeyhole size={16} />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--gkli-primary)]">
                    Tipo travado pelo card
                  </p>
                  <p className="mt-1 text-base font-medium text-slate-950">
                    {selected.label}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Para mudar o tipo, volte para a central e escolha outro
                    card. Isso reduz erro operacional e evita upload no fluxo
                    errado.
                  </p>
                </div>
              </div>
            </div>

            <FormField
              label="Arquivo XLSX"
              hint="Use o template oficial. Apenas .xlsx. O sistema lê a aba DADOS do template oficial."
            >
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-5 py-6 text-center">
                <UploadCloud
                  size={28}
                  className="mx-auto text-[var(--gkli-primary)]"
                />
                <p className="mt-3 text-sm font-medium text-slate-950">
                  Selecionar arquivo XLSX
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Nada será gravado agora. Esta etapa gera apenas o preview.
                </p>
                <input
                  name="arquivo"
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  required
                  className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:text-slate-700 focus:border-[var(--gkli-primary)] focus:ring-2 focus:ring-[var(--gkli-primary)]/20"
                />
              </div>
            </FormField>

            {selected.value === "cobrancas" ? (
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                <input
                  name="recorte_regua"
                  type="checkbox"
                  value="mais_recentes"
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-[var(--gkli-primary)] focus:ring-[var(--gkli-primary)]"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-950">
                    Importar somente cobranças mais recentes que o início da régua
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    Considera o vencimento e o D+ configurado em cada condomínio. Cobranças que já alcançaram a régua permanecem apenas no histórico desta importação.
                  </span>
                </span>
              </label>
            ) : null}

            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <p>
                  Confira o template e revise o preview antes de confirmar.
                  Importação errada pode contaminar cobrança, acordo e régua.
                </p>
              </div>
            </div>

            <div className="flex flex-col justify-end gap-2 sm:flex-row">
              <ButtonLink href="/app/importacoes" variant="secondary">
                Cancelar
              </ButtonLink>
              <GerarPreviewButton />
            </div>
          </form>
        </Card>

        <div className="space-y-4">
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
                {condominioPadrao ? (
                  <p className="mt-3 rounded-xl bg-white px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
                    Condomínio padrão desta importação:{" "}
                    <span className="text-slate-950">
                      {condominioPadrao.nome}
                    </span>
                  </p>
                ) : null}
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                  Template oficial
                </p>
                <h2 className="mt-1 text-base font-medium text-slate-950">
                  Cabeçalho esperado
                </h2>
              </div>
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
            <pre className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-950 p-4 text-xs leading-6 text-slate-100">
              {selected.header}
            </pre>
          </Card>

          <Card>
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-emerald-50 p-2 text-emerald-700">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <h2 className="text-base font-medium text-slate-950">
                  O que acontece agora
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  O sistema cria apenas o preview, separa linhas válidas,
                  alertas e bloqueios. A gravação definitiva fica para a tela
                  seguinte.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
