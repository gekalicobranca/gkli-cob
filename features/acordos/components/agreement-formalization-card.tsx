import { CheckCircle2, ClipboardList, FileText, MailCheck, Send } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { atualizarStatusBoletosAcordo } from "@/features/acordos/actions";

function formatDateTime(value?: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function labelFluxo(value?: string | null) {
  const labels: Record<string, string> = {
    aguardando_aprovacao_sindico: "Formalização pendente",
    aprovado_sindico_aguardando_aceite_devedor: "Formalização pendente",
    aguardando_aceite_devedor: "Formalização pendente",
    aceito_aguardando_boletos: "Boletos pendentes",
    boletos_solicitados: "Boletos solicitados",
    boletos_recebidos: "Boletos recebidos",
    boletos_enviados: "Boletos enviados",
    reprovado_sindico: "Reprovado pelo síndico",
  };

  const key = String(value || "");
  return labels[key] ?? (key ? key.replaceAll("_", " ") : "Rascunho");
}

function stepTone(done: boolean, blocked = false) {
  if (blocked) return "border-rose-200 bg-rose-50 text-rose-800";
  if (done) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function Step({
  title,
  description,
  done,
  blocked,
}: {
  title: string;
  description: string;
  done: boolean;
  blocked?: boolean;
}) {
  return (
    <div className={["rounded-2xl border p-4", stepTone(done, blocked)].join(" ")}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/70">
          <CheckCircle2 className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-xs leading-5 opacity-80">{description}</p>
        </div>
      </div>
    </div>
  );
}

function firstTerm(terms: any[], type: "devedor" | "sindico") {
  return terms.find((term) => String(term.tipo_aceite) === type) ?? null;
}

export function AgreementFormalizationCard({ acordo }: { acordo: any }) {
  const terms = Array.isArray(acordo?.termos) ? acordo.termos : [];
  const termoDevedor = firstTerm(terms, "devedor");
  const termoPrincipal = termoDevedor ?? terms[0] ?? null;
  const formalizacaoDevedor = Boolean(termoDevedor);
  const boletosSolicitados = Boolean(acordo?.boletos_solicitados_em) || ["boletos_solicitados", "boletos_recebidos", "boletos_enviados"].includes(String(acordo?.fluxo_status));
  const boletosRecebidos = String(acordo?.fluxo_status) === "boletos_recebidos" || String(acordo?.fluxo_status) === "boletos_enviados";
  const boletosEnviados = String(acordo?.fluxo_status) === "boletos_enviados";
  const pagamentoInicial = ["parcial", "quitado"].includes(String(acordo?.status_financeiro ?? "")) || String(acordo?.status) === "quitado";

  const carteiraNome = acordo?.carteiras?.nome ?? "GKLI Cobrança";
  const contatoResponsavel = [
    acordo?.unidades?.email ? `E-mail do responsável: ${acordo.unidades.email}` : null,
    acordo?.unidades?.telefone ? `Celular do responsável: ${acordo.unidades.telefone}` : null,
  ].filter(Boolean).join("\n");
  const resumoSolicitacao = (() => {
    const resumo = termoPrincipal?.corpo ?? "Resumo do acordo indisponível na base local.";
    if (!contatoResponsavel) return resumo;
    if (resumo.includes("E-mail do responsável") || resumo.includes("Celular do responsável")) return resumo;
    return [resumo, "", "Contato do responsável:", contatoResponsavel].join("\n");
  })();
  const textoSolicitacao = [
    "Prezados,",
    "",
    "Solicitamos a emissão dos boletos do acordo abaixo, conforme plano formalizado pela operação:",
    "",
    resumoSolicitacao,
    "",
    "Marco operacional:",
    "O acordo será considerado firmado após a identificação do pagamento da entrada ou da primeira parcela.",
    "",
    "Atenciosamente,",
    carteiraNome,
  ].join("\n");

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              <ClipboardList className="h-4 w-4" />
              Formalização
            </div>
            <h2 className="mt-2 text-lg font-semibold text-slate-950">Checklist do acordo</h2>
            <p className="mt-1 text-sm text-slate-500">Controle enxuto de formalização, boletos e primeiro pagamento.</p>
          </div>
          <span className="inline-flex w-fit rounded-full bg-[#351b40]/5 px-3 py-1 text-xs font-semibold text-[#351b40] ring-1 ring-[#351b40]/10">
            {labelFluxo(acordo?.fluxo_status)}
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Step
            title="Devedor"
            description={formalizacaoDevedor ? "Formalização enviada" : "Pendente"}
            done={formalizacaoDevedor}
          />
          <Step
            title="Administradora"
            description={boletosSolicitados ? `Solicitado ${formatDateTime(acordo?.boletos_solicitados_em) ?? ""}` : "Pendente"}
            done={boletosSolicitados}
          />
          <Step
            title="Primeiro pagamento"
            description={pagamentoInicial ? "Acordo firmado" : "Aguardando entrada ou parcela"}
            done={pagamentoInicial}
          />
          <Step
            title="Boletos"
            description={boletosEnviados ? "Enviados ao devedor" : boletosRecebidos ? "Recebidos" : "Pendente"}
            done={boletosEnviados || boletosRecebidos}
            blocked={!boletosSolicitados}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <FileText className="h-4 w-4" />
              Formalizações vinculadas
            </div>
            {terms.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Nenhuma formalização gerada para este acordo.</p>
            ) : (
              <div className="mt-3 divide-y divide-slate-200 rounded-xl bg-white">
                {terms.map((term: any) => (
                  <div key={term.id} className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">
                          {term.tipo_aceite === "sindico" ? "Formalização ao síndico" : "Formalização ao devedor"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {term.visualizado_em ? `Acionada ${formatDateTime(term.visualizado_em) ?? ""}` : "Gerada"}
                        </p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {String(term.status || "pendente")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <MailCheck className="h-4 w-4" />
              Administração
            </div>
            <p className="text-xs leading-5 text-slate-500">Mensagem pronta para acompanhar a emissão dos boletos, sem adicionar link público.</p>
            <textarea
              readOnly
              className="min-h-[170px] w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600 outline-none"
              value={textoSolicitacao}
            />
            <div className="grid gap-2">
              <form action={atualizarStatusBoletosAcordo}>
                <input type="hidden" name="acordo_id" value={acordo.id} />
                <input type="hidden" name="status_boletos" value="boletos_recebidos" />
                <PendingSubmitButton
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  disabled={!boletosSolicitados || boletosRecebidos}
                  icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                  pendingLabel="Confirmando..."
                >
                  {boletosRecebidos ? "Recebimento confirmado" : "Confirmar recebimento"}
                </PendingSubmitButton>
              </form>
              <form action={atualizarStatusBoletosAcordo}>
                <input type="hidden" name="acordo_id" value={acordo.id} />
                <input type="hidden" name="status_boletos" value="boletos_enviados" />
                <PendingSubmitButton
                  size="sm"
                  className="w-full"
                  disabled={!boletosRecebidos || boletosEnviados}
                  icon={<Send className="h-3.5 w-3.5" />}
                  pendingLabel="Confirmando..."
                >
                  {boletosEnviados ? "Envio confirmado" : "Confirmar envio"}
                </PendingSubmitButton>
              </form>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
