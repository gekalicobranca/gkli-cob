import { createClient } from "@/utils/supabase/server";
import { requireUser } from "@/utils/auth/require-user";
import { AprovacaoForaReguaCard } from "@/components/acordos/aprovacao-fora-regua-card";
import { avaliarReguaImportacao } from "@/features/importacoes/regua-importacao";
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
    cotasSemDespesas?: string | string[];
    unidade_id?: string;
    sindico?: string;
    aprovacao_fora_regua?: string;
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
  const supabase = await createClient();
  const user = await requireUser();
  let aprovacao: any = null;
  if (query.aprovacao_fora_regua) {
    const { data, error } = await supabase.from("acordos_aprovacoes_fora_regua")
      .select("id,status,proposta,formulario,recibos_fora_regua,justificativa,acordo_id")
      .eq("id", query.aprovacao_fora_regua).maybeSingle();
    if (error || !data) throw new Error("Proposta de aprovação indisponível para este usuário.");
    aprovacao = data;
  }
  const selectedIds = aprovacao
    ? aprovacao.proposta.itens.map((item: any) => String(item.cobranca_id))
    : normalizeIds(query.cobrancaIds);
  const cotasSemDespesas = normalizeIds(aprovacao?.formulario?.cotas_sem_despesas ?? query.cotasSemDespesas)
    .filter((id) => selectedIds.includes(id));
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
  const returnParams = new URLSearchParams();
  if (selectedIds.length > 0) returnParams.set("cobrancaIds", selectedIds.join(","));
  if (cotasSemDespesas.length) returnParams.set("cotasSemDespesas", cotasSemDespesas.join(","));
  if (query.sindico) returnParams.set("sindico", query.sindico);
  if (aprovacao) returnParams.set("aprovacao_fora_regua", aprovacao.id);
  const currentPath = `/app/acordos/novo${returnParams.size > 0 ? `?${returnParams.toString()}` : ""}`;

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

      {aprovacao && <AprovacaoForaReguaCard aprovacao={aprovacao} podeDecidir={["admin", "gestor"].includes(user.perfil)} />}
      <AcordoSimulatorForm
        key={aprovacao ? `${aprovacao.id}:${aprovacao.status}` : selectedIds.join(",")}
        formularioInicial={aprovacao?.formulario}
        aprovacaoForaReguaStatus={aprovacao?.status}
        acordoJaCriado={Boolean(aprovacao?.acordo_id)}
        contemCobrancasForaRegua={(cobrancas as any[]).some((cobranca) => avaliarReguaImportacao({
          vencimento: cobranca.vencimento,
          inicioCobrancaDias: cobranca.condominios?.inicio_cobranca_dias,
        }).foraRegua)}
        cobrancas={cobrancas as any}
        initialCobrancaId={legacyCobrancaId ?? selectedIds[0]}
        selectedCobrancaIds={selectedIds}
        cotasSemDespesas={cotasSemDespesas}
        bloqueadoPorPendenciaPlanilha={Boolean(pendenciaPlanilha)}
        bloqueadoPorPendenciaAprovacaoSindico={Boolean(pendenciaAprovacaoSindico)}
        aprovacaoSindicoSolicitada={query.sindico === "solicitada"}
        returnTo={currentPath}
        inteligenciaOperacional={inteligenciaOperacional}
      />
    </div>
  );
}
