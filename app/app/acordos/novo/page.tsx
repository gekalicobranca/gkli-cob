import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import {
  listCobrancasElegiveisParaAcordo,
  listCobrancasSelecionadasParaAcordo,
} from "@/features/acordos/queries";
import { AcordoSimulatorForm } from "@/components/acordos/acordo-simulator-form";

type PageProps = {
  searchParams: Promise<{
    cobrancaId?: string;
    cobranca_id?: string;
    cobrancaIds?: string | string[];
  }>;
};

function normalizeIds(value?: string | string[] | null) {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return Array.from(
    new Set(
      values
        .flatMap((item) => String(item).split(","))
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export default async function NovoAcordoPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const legacyCobrancaId = query.cobrancaId ?? query.cobranca_id;
  const selectedIds = normalizeIds(query.cobrancaIds);
  const scope = await getPermittedCarteiras();

  if (legacyCobrancaId && selectedIds.length === 0) {
    redirect(`/app/acordos/selecionar?cobrancaId=${legacyCobrancaId}`);
  }

  const cobrancas =
    selectedIds.length > 0
      ? await listCobrancasSelecionadasParaAcordo(scope, selectedIds)
      : await listCobrancasElegiveisParaAcordo(scope);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Base Operacional"
        title="Novo acordo"
        description={
          selectedIds.length > 0
            ? "Simule o acordo com as cobranças previamente agrupadas para a unidade."
            : "Crie um acordo a partir de uma cobrança elegível, simule parcelas e grave o plano financeiro."
        }
        actions={
          selectedIds.length > 0 ? (
            <ButtonLink
              href={`/app/acordos/selecionar?cobrancaId=${selectedIds[0]}`}
              variant="header"
            >
              Alterar seleção
            </ButtonLink>
          ) : undefined
        }
      />

      <AcordoSimulatorForm
        cobrancas={cobrancas as any}
        initialCobrancaId={legacyCobrancaId ?? selectedIds[0]}
        selectedCobrancaIds={selectedIds}
      />
    </div>
  );
}
