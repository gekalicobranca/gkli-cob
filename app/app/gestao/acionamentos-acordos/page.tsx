import Link from "next/link";
import { ExternalLink, Mail, MessageCircle, Send, ShieldCheck } from "lucide-react";

import { EmptyState } from "@/components/data/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { registrarAcionamentoManualAcordo } from "@/features/acordos/actions";
import { listAgreementManualActivationInbox } from "@/features/acordos/queries";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatDateBR } from "@/utils/formatters/date";

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

function statusTone(row: { mensagemAcionadaManual: boolean; mensagemStatus: string | null }) {
  if (row.mensagemAcionadaManual) return "green";
  if (row.mensagemStatus === "enviada") return "blue";
  return "yellow";
}

function statusLabel(row: { mensagemAcionadaManual: boolean; mensagemStatus: string | null }) {
  if (row.mensagemAcionadaManual) return "Acionado manualmente";
  if (row.mensagemStatus === "enviada") return "Mensagem enviada";
  return "Aguardando acionamento";
}

export default async function AcionamentosAcordosPage() {
  const scope = await getPermittedCarteiras();
  const rows = await listAgreementManualActivationInbox(scope);
  const acionados = rows.filter((row) => row.mensagemAcionadaManual).length;
  const pendentes = rows.length - acionados;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Gestao"
        title="Acionamentos de acordos"
        description="Fila temporaria para acionar devedores manualmente durante a implantacao."
        actions={
          <>
            <ButtonLink href="/app/dashboard" variant="secondary">Voltar</ButtonLink>
            <ButtonLink href="/app/acordos/gestao" variant="secondary">Gestao de acordos</ButtonLink>
          </>
        }
      />

      <section className="grid gap-3 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Pendentes</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{pendentes}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Acionados</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{acionados}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Em aceite</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{rows.length}</p>
        </Card>
      </section>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-[var(--gkli-primary-light)] p-2 text-[var(--gkli-primary)]">
              <ShieldCheck size={18} />
            </div>
            <div>
              <h2 className="text-base font-medium text-slate-950">Aceites do devedor</h2>
              <p className="mt-1 text-sm text-slate-500">Acordos com termo gerado e aceite ainda pendente.</p>
            </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Sem acionamentos pendentes" description="Todos os termos de devedor foram aceitos ou ainda nao foram gerados." />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((row) => {
              const body = row.mensagemConteudo || [
                "Prezado(a),",
                "",
                "Segue o link para conferencia e aceite digital do acordo:",
                row.linkAceite,
                "",
                "Atenciosamente,",
                "GKLI Cobranca",
              ].join("\n");
              const whatsapp = whatsappHref(row.destinatarioTelefone, body);
              const mailto = mailtoHref(row.destinatarioEmail, row.mensagemAssunto ?? "Termo de acordo para aceite digital", body);

              return (
                <div key={row.termoId} className="grid gap-4 px-5 py-4 xl:grid-cols-[minmax(320px,1fr)_180px_320px] xl:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={statusTone(row)}>{statusLabel(row)}</Badge>
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
                    {row.mensagemAcionadaEm ? (
                      <p className="mt-2 text-xs text-emerald-700">Ultimo acionamento {formatDateBR(row.mensagemAcionadaEm)}</p>
                    ) : null}
                  </div>

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
                      <input type="hidden" name="canal" value={row.destinatarioTelefone ? "whatsapp/email" : "email"} />
                      <Button type="submit" size="sm">
                        <Send size={14} />
                        Marcar acionado
                      </Button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
