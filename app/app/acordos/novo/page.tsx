import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import {
  getPendenciaAprovacaoSindicoAberta,
  getPendenciaPlanilhaDebitosAberta,
  getAgreementOperationalIntelligence,
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

  if (selectedIds.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Base Operacional"
          title="Novo acordo"
          description="A criação de acordo deve começar por uma cobrança, para manter a unidade e os débitos corretamente contextualizados."
          actions={<ButtonLink href="/app/cobrancas" variant="header">Abrir cobranças</ButtonLink>}
        />

        <Card>
          <h2 className="text-lg font-semibold text-slate-950">Selecione uma cobrança para iniciar</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Para evitar uma lista extensa de débitos e reduzir risco operacional, o acordo agora é criado a partir da cobrança de origem. Abra a cobrança desejada e use a ação de acordo.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <ButtonLink href="/app/cobrancas">Ir para cobranças</ButtonLink>
            <ButtonLink href="/app/acordos" variant="secondary">Voltar para acordos</ButtonLink>
          </div>
        </Card>
      </div>
    );
  }

  const cobrancas = await listCobrancasSelecionadasParaAcordo(scope, selectedIds);
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
        description="Simule o acordo com as cobranças previamente agrupadas para a unidade."
        actions={
          <ButtonLink
            href={`/app/acordos/selecionar?cobrancaId=${selectedIds[0]}`}
            variant="header"
          >
            Alterar seleção
          </ButtonLink>
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
