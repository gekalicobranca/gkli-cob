import Link from "next/link";
import {
  CheckCircle2,
  ExternalLink,
  Mail,
  MessageCircle,
  PlayCircle,
  ReceiptText,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { EmptyState } from "@/components/data/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  atualizarStatusBoletosAcordo,
  cancelarFormalizacaoAcordo,
  decidirAprovacaoSindicoAcordo,
  registrarAcionamentoManualAcordo,
} from "@/features/acordos/actions";
import {
  listAgreementApprovalInbox,
  listAgreementBoletoInbox,
  listAgreementManualActivationInbox,
  type AgreementManualActivationRow,
} from "@/features/acordos/queries";
import { iniciarTratamentoPendencia, resolverPendencia } from "@/features/pendencias/actions";
import { listPendenciasOperacionais } from "@/features/pendencias/queries";
import type { PendenciaOperacional } from "@/features/pendencias/types";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";

type SearchParams = Promise<{ tipo?: string }>;

const activationFilters = [
  { key: "todos", label: "Todos" },
  { key: "sindico", label: "Sindico" },
  { key: "devedor", label: "Devedor" },
  { key: "boletos", label: "Boletos" },
  { key: "pendencias", label: "Pendencias" },
] as const;

function normalizeTipoFiltro(value?: string | null) {
  const tipo = String(value ?? "todos").toLowerCase();
  return activationFilters.some((filter) => filter.key === tipo) ? tipo : "todos";
}

function shouldShowSection(active: string, section: string) {
  return active === "todos" || active === section;
}

function onlyDigits(value?: string | null) {
  return String(value ?? "").replace(/\D/g, "");
}

function whatsappHref(phone: string | null, text: string) {
  const digits = onlyDigits(phone);
  if (!digits) return null;
  const normalized = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
}

function mailtoHref(email: string | null, subject: string, body: string) {
  if (!email) return null;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function activationBody(row: AgreementManualActivationRow) {
  return row.mensagemConteudo || [
    "Prezado(a),",
    "",
    "Segue o link para conferencia e aceite digital:",
    row.linkAceite,
    "",
    "Atenciosamente,",
    "GKLI Cobranca",
  ].join("\n");
}

function ActivationButtons({ row, canal, returnTo }: { row: AgreementManualActivationRow; canal: string; returnTo: string }) {
  const body = activationBody(row);
  const whatsapp = whatsappHref(row.destinatarioTelefone, body);
  const mailto = mailtoHref(row.destinatarioEmail, row.mensagemAssunto ?? "Termo de acordo para aceite digital", body);

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <ButtonLink href={row.linkAceite} target="_blank" rel="noreferrer" variant="secondary" size="sm">
        <ExternalLink size={14} />
        Termo
      </ButtonLink>
      {mailto ? (
        <ButtonLink href={mailto} variant="secondary" size="sm">
          <Mail size={14} />
          E-mail
        </ButtonLink>
      ) : null}
      {whatsapp ? (
        <ButtonLink href={whatsapp} target="_blank" rel="noreferrer" variant="secondary" size="sm">
          <MessageCircle size={14} />
          WhatsApp
        </ButtonLink>
      ) : null}
      <form action={registrarAcionamentoManualAcordo}>
        <input type="hidden" name="termo_id" value={row.termoId} />
        <input type="hidden" name="acordo_id" value={row.acordoId} />
        <input type="hidden" name="mensagem_id" value={row.mensagemId ?? ""} />
        <input type="hidden" name="canal" value={canal} />
        <input type="hidden" name="return_to" value={returnTo} />
        <PendingSubmitButton size="sm" icon={<Send size={14} />} pendingLabel="Marcando...">
          Marcar acionado
        </PendingSubmitButton>
      </form>
      {canal === "devedor" ? (
        <form action={cancelarFormalizacaoAcordo}>
          <input type="hidden" name="acordo_id" value={row.acordoId} />
          <input type="hidden" name="motivo" value="Devedor nao confirmou o aceite" />
          <input type="hidden" name="observacao" value="Cancelado pela central de acionamentos durante a implantacao." />
          <PendingSubmitButton
            size="sm"
            variant="secondary"
            className="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
            icon={<XCircle size={14} />}
            pendingLabel="Cancelando..."
          >
            Cancelar formalizacao
          </PendingSubmitButton>
        </form>
      ) : null}
    </div>
  );
}

function isManuallyTriggered(row: AgreementManualActivationRow) {
  return row.mensagemAcionadaManual || row.mensagemStatus === "enviada";
}

function ActivationRow({ row, canal, returnTo }: { row: AgreementManualActivationRow; canal: string; returnTo: string }) {
  const acionado = isManuallyTriggered(row);
  return (
    <div className="grid gap-4 px-5 py-4 xl:grid-cols-[minmax(300px,1fr)_170px_420px] xl:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={acionado ? "green" : "yellow"}>
            {acionado ? "Acionado manualmente" : "Aguardando acionamento"}
          </Badge>
          <Badge tone="slate">{row.termoStatus ?? "pendente"}</Badge>
        </div>
        <Link href={`/app/acordos/${row.acordoId}`} className="mt-2 block truncate text-sm font-semibold text-slate-950 hover:text-[var(--gkli-primary)]">
          {row.condominioNome ?? "Condominio nao informado"} - {row.unidadeLabel}
        </Link>
        <p className="mt-1 truncate text-xs text-slate-500">
          {row.destinatarioNome ?? "Responsavel nao informado"} - termo criado em {formatDateBR(row.termoCriadoEm)}
        </p>
        <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
          <span className="truncate">E-mail: {row.destinatarioEmail ?? "-"}</span>
          <span className="truncate">Telefone: {row.destinatarioTelefone ?? "-"}</span>
        </div>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Acordo</p>
        <p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(row.valorAcordado)}</p>
        <p className="mt-1 text-xs text-slate-500">{formatDateBR(row.dataAcordo)}</p>
      </div>
      <ActivationButtons row={row} canal={canal} returnTo={returnTo} />
    </div>
  );
}

function SectionShell({
  title,
  description,
  icon: Icon,
  emptyTitle,
  emptyDescription,
  children,
  hasRows,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  emptyTitle: string;
  emptyDescription: string;
  children: React.ReactNode;
  hasRows: boolean;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">
            <Icon size={18} />
          </div>
          <div>
            <h2 className="text-base font-medium text-slate-950">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </div>
        </div>
      </div>
      {hasRows ? <div className="divide-y divide-slate-100">{children}</div> : (
        <div className="p-5">
          <EmptyState title={emptyTitle} description={emptyDescription} />
        </div>
      )}
    </Card>
  );
}

function SindicoDecisionRow({ row, term, returnTo }: { row: any; term?: AgreementManualActivationRow; returnTo: string }) {
  return (
    <div className="grid gap-4 px-5 py-4 xl:grid-cols-[minmax(300px,1fr)_150px_300px] xl:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="yellow">{row.etapa_aprovacao}</Badge>
          {term?.mensagemAcionadaManual ? <Badge tone="green">Sindico acionado</Badge> : null}
        </div>
        <Link href={`/app/acordos/${row.id}`} className="mt-2 block truncate text-sm font-semibold text-slate-950 hover:text-[var(--gkli-primary)]">
          {row.condominios?.nome ?? "Condominio nao informado"} - Unidade {row.unidades?.identificacao ?? "-"}
        </Link>
        <p className="mt-1 truncate text-xs text-slate-500">
          {row.unidades?.responsavel_nome ?? "Responsavel nao informado"} - {formatDateBR(row.data_acordo)}
        </p>
        {term ? <div className="mt-3"><ActivationButtons row={term} canal="sindico" returnTo={returnTo} /></div> : null}
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Acordo</p>
        <p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(Number(row.valor_acordado ?? 0))}</p>
        <p className="mt-1 text-xs text-slate-500">{row.quantidade_parcelas ?? "-"} parcelas</p>
      </div>
      <form action={decidirAprovacaoSindicoAcordo} className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <input type="hidden" name="acordo_id" value={row.id} />
        <Select name="motivo" defaultValue="">
          <option value="">Motivo, se rejeitar</option>
          <option value="Quantidade de parcelas">Quantidade de parcelas</option>
          <option value="Entrada insuficiente">Entrada insuficiente</option>
          <option value="Pendencia documental">Pendencia documental</option>
          <option value="Unidade judicializada">Unidade judicializada</option>
          <option value="Outro">Outro</option>
        </Select>
        <Textarea name="observacao" placeholder="Observacao opcional" className="min-h-[72px]" />
        <div className="grid gap-2 sm:grid-cols-2">
          <Button name="decisao" value="aprovar" size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700">
            <CheckCircle2 size={14} />
            Aprovar
          </Button>
          <Button name="decisao" value="rejeitar" variant="secondary" size="sm" className="w-full border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100">
            <XCircle size={14} />
            Rejeitar
          </Button>
        </div>
      </form>
    </div>
  );
}

function BoletoRow({ row }: { row: any }) {
  return (
    <div className="grid gap-4 px-5 py-4 xl:grid-cols-[minmax(300px,1fr)_150px_240px] xl:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={row.etapa_boleto === "Boletos enviados" ? "green" : "blue"}>{row.etapa_boleto}</Badge>
        </div>
        <Link href={`/app/acordos/${row.id}`} className="mt-2 block truncate text-sm font-semibold text-slate-950 hover:text-[var(--gkli-primary)]">
          {row.condominios?.nome ?? "Condominio nao informado"} - Unidade {row.unidades?.identificacao ?? "-"}
        </Link>
        <p className="mt-1 truncate text-xs text-slate-500">
          {row.unidades?.responsavel_nome ?? "Responsavel nao informado"} - solicitado em {formatDateBR(row.boletos_solicitados_em)}
        </p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Acordo</p>
        <p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(Number(row.valor_acordado ?? 0))}</p>
      </div>
      <form action={atualizarStatusBoletosAcordo} className="flex flex-wrap justify-end gap-2">
        <input type="hidden" name="acordo_id" value={row.id} />
        <Button name="status_boletos" value="boletos_recebidos" variant="secondary" size="sm" className="border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100">
          <CheckCircle2 size={14} />
          Recebidos
        </Button>
        <Button name="status_boletos" value="boletos_enviados" size="sm" className="bg-emerald-600 hover:bg-emerald-700">
          <Mail size={14} />
          Enviados
        </Button>
      </form>
    </div>
  );
}

function PendenciaRow({ pendencia }: { pendencia: PendenciaOperacional }) {
  return (
    <div className="grid gap-4 px-5 py-4 xl:grid-cols-[minmax(300px,1fr)_170px_220px] xl:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={pendencia.prioridade === "critica" ? "red" : pendencia.prioridade === "alta" ? "yellow" : "slate"}>{pendencia.prioridade}</Badge>
          <Badge tone="slate">{pendencia.status}</Badge>
          <Badge tone="blue">{pendencia.origem}</Badge>
        </div>
        <Link href={pendencia.acordo_id ? `/app/acordos/${pendencia.acordo_id}` : "/app/pendencias"} className="mt-2 block truncate text-sm font-semibold text-slate-950 hover:text-[var(--gkli-primary)]">
          {pendencia.titulo}
        </Link>
        <p className="mt-1 line-clamp-2 text-xs text-slate-500">{pendencia.descricao ?? "Sem descricao."}</p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Prazo</p>
        <p className="mt-1 text-sm font-semibold text-slate-950">{formatDateBR(pendencia.prazo_limite)}</p>
        <p className="mt-1 text-xs text-slate-500">{pendencia.tipo}</p>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {pendencia.status === "aberta" ? (
          <form action={async (formData) => {
            "use server";
            await iniciarTratamentoPendencia(null, formData);
          }}>
            <input type="hidden" name="id" value={pendencia.id} />
            <Button type="submit" variant="secondary" size="sm">
              <PlayCircle size={14} />
              Tratar
            </Button>
          </form>
        ) : null}
        <form action={async (formData) => {
          "use server";
          await resolverPendencia(null, formData);
        }}>
          <input type="hidden" name="id" value={pendencia.id} />
          <Button type="submit" size="sm">
            <CheckCircle2 size={14} />
            Resolver
          </Button>
        </form>
      </div>
    </div>
  );
}

export default async function AcionamentosAcordosPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const tipoFiltro = normalizeTipoFiltro(params.tipo);
  const currentPath = tipoFiltro === "todos"
    ? "/app/gestao/acionamentos-acordos"
    : `/app/gestao/acionamentos-acordos?tipo=${tipoFiltro}`;
  const scope = await getPermittedCarteiras();
  const [sindicoTerms, devedorTerms, aprovacoes, boletos, pendencias] = await Promise.all([
    listAgreementManualActivationInbox(scope, "sindico"),
    listAgreementManualActivationInbox(scope, "devedor"),
    listAgreementApprovalInbox(scope),
    listAgreementBoletoInbox(scope),
    listPendenciasOperacionais(scope, { status: "aberta" }),
  ]);

  const sindicoTermByAcordo = new Map(sindicoTerms.map((term) => [term.acordoId, term]));
  const pendenciasImplantacao = pendencias
    .filter((pendencia) => ["acordo", "administradora"].includes(pendencia.origem))
    .filter((pendencia) => [
      "planilha_debitos_administradora",
      "aprovacao_acordo_sindico",
      "emissao_boletos_acordo",
    ].includes(pendencia.tipo))
    .slice(0, 20);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Gestao"
        title="Acionamentos de implantacao"
        description="Central temporaria para aprovacoes, aceites, boletos e pendencias enquanto a automacao esta sendo implantada."
        actions={
          <>
            <ButtonLink href="/app/dashboard" variant="secondary">Voltar</ButtonLink>
            <ButtonLink href="/app/acordos/gestao" variant="secondary">Gestao de acordos</ButtonLink>
            <ButtonLink href="/app/pendencias" variant="secondary">Pendencias</ButtonLink>
          </>
        }
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Card className="p-4"><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Sindico</p><p className="mt-2 text-3xl font-semibold text-slate-950">{aprovacoes.length}</p></Card>
        <Card className="p-4"><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Devedor</p><p className="mt-2 text-3xl font-semibold text-slate-950">{devedorTerms.length}</p></Card>
        <Card className="p-4"><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Boletos</p><p className="mt-2 text-3xl font-semibold text-slate-950">{boletos.length}</p></Card>
        <Card className="p-4"><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Pendencias</p><p className="mt-2 text-3xl font-semibold text-slate-950">{pendenciasImplantacao.length}</p></Card>
        <Card className="p-4"><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Acionados</p><p className="mt-2 text-3xl font-semibold text-slate-950">{sindicoTerms.filter((row) => row.mensagemAcionadaManual).length + devedorTerms.filter((row) => row.mensagemAcionadaManual).length}</p></Card>
      </section>

      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          {activationFilters.map((filter) => (
            <ButtonLink
              key={filter.key}
              href={filter.key === "todos" ? "/app/gestao/acionamentos-acordos" : `/app/gestao/acionamentos-acordos?tipo=${filter.key}`}
              variant={tipoFiltro === filter.key ? "primary" : "secondary"}
              size="sm"
            >
              {filter.label}
            </ButtonLink>
          ))}
        </div>
      </Card>

      {shouldShowSection(tipoFiltro, "sindico") ? (
        <SectionShell
          title="Aprovacao do sindico"
          description="Acordos que dependem de decisao do sindico e, quando houver termo, permitem acionamento manual."
          icon={ShieldCheck}
          emptyTitle="Sem aprovacao de sindico pendente"
          emptyDescription="Nenhum acordo depende desta etapa agora."
          hasRows={aprovacoes.length > 0}
        >
          {aprovacoes.map((row: any) => (
            <SindicoDecisionRow key={row.id} row={row} term={sindicoTermByAcordo.get(row.id)} returnTo={currentPath} />
          ))}
        </SectionShell>
      ) : null}

      {shouldShowSection(tipoFiltro, "devedor") ? (
        <SectionShell
          title="Aceite do devedor"
          description="Termos de devedor pendentes, com link publico, e-mail, WhatsApp e registro manual de contato."
          icon={Send}
          emptyTitle="Sem aceite de devedor pendente"
          emptyDescription="Todos os termos de devedor foram aceitos ou ainda nao foram gerados."
          hasRows={devedorTerms.length > 0}
        >
          {devedorTerms.map((row) => <ActivationRow key={row.termoId} row={row} canal="devedor" returnTo={currentPath} />)}
        </SectionShell>
      ) : null}

      {shouldShowSection(tipoFiltro, "boletos") ? (
        <SectionShell
          title="Administradora e boletos"
          description="Acordos aceitos que estao aguardando emissao, recebimento ou envio dos boletos."
          icon={ReceiptText}
          emptyTitle="Sem boletos em acompanhamento"
          emptyDescription="Nenhum acordo esta parado nesta etapa agora."
          hasRows={boletos.length > 0}
        >
          {boletos.map((row: any) => <BoletoRow key={row.id} row={row} />)}
        </SectionShell>
      ) : null}

      {shouldShowSection(tipoFiltro, "pendencias") ? (
        <SectionShell
          title="Pendencias bloqueantes"
          description="Travas administrativas e financeiras que podem impedir a continuidade do acordo."
          icon={PlayCircle}
          emptyTitle="Sem pendencias bloqueantes"
          emptyDescription="Nenhuma pendencia de implantacao aberta para acordos ou administradoras."
          hasRows={pendenciasImplantacao.length > 0}
        >
          {pendenciasImplantacao.map((pendencia) => <PendenciaRow key={pendencia.id} pendencia={pendencia} />)}
        </SectionShell>
      ) : null}
    </div>
  );
}
