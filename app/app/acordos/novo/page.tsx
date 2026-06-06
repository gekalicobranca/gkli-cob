import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import {
  getPendenciaAprovacaoSindicoAberta,
  getPendenciaPlanilhaDebitosAberta,
  getAgreementOperationalIntelligence,
  listCobrancasElegiveisParaAcordo,
  listCobrancasSelecionadasParaAcordo,
} from "@/features/acordos/queries";
import { AcordoSimulatorForm } from "@/components/acordos/acordo-simulator-form";

type PageProps = {
  searchParams: Promise<{
    cobrancaId?: string;
    cobranca_id?: string;
    cobranca_id_origem?: string;
    cobrancaIds?: string | string[];
    unidade_id?: string;
    sindico?: string;
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
  const legacyCobrancaId = query.cobrancaId ?? query.cobranca_id ?? query.cobranca_id_origem;
  const selectedIds = normalizeIds(query.cobrancaIds);
  const scope = await getPermittedCarteiras();

  if (legacyCobrancaId && selectedIds.length === 0) {
    redirect(`/app/acordos/selecionar?cobrancaId=${legacyCobrancaId}`);
  }

  const cobrancas =
    selectedIds.length > 0
      ? await listCobrancasSelecionadasParaAcordo(scope, selectedIds)
      : await listCobrancasElegiveisParaAcordo(scope);
  const cobrancaReferencia = (cobrancas as any[])[0];
  const pendenciaPlanilha = cobrancaReferencia
    ? await getPendenciaPlanilhaDebitosAberta({
        scope,
        carteiraId: cobrancaReferencia.carteira_id,
        condominioId: cobrancaReferencia.condominio_id,
        unidadeId: cobrancaReferencia.unidade_id,
      })
    : null;
  const pendenciaAprovacaoSindico = cobrancaReferencia
    ? await getPendenciaAprovacaoSindicoAberta({
        scope,
        carteiraId: cobrancaReferencia.carteira_id,
        condominioId: cobrancaReferencia.condominio_id,
        unidadeId: cobrancaReferencia.unidade_id,
      })
    : null;
  const inteligenciaOperacional = cobrancaReferencia
    ? await getAgreementOperationalIntelligence({
        scope,
        unidadeId: cobrancaReferencia.unidade_id,
      })
    : { reincidencia: 0, rompimentos: 0 };

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
        bloqueadoPorPendenciaPlanilha={Boolean(pendenciaPlanilha)}
        bloqueadoPorPendenciaAprovacaoSindico={Boolean(pendenciaAprovacaoSindico)}
        aprovacaoSindicoSolicitada={query.sindico === "solicitada"}
        inteligenciaOperacional={inteligenciaOperacional}
      />
    </div>
  );
}
