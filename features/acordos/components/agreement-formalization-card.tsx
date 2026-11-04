import { CheckCircle2, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { atualizarStatusBoletosAcordo } from "@/features/acordos/actions";
import { formalizacaoState } from "@/features/acordos/formalizacao-state";
import { AgreementHomologationForm } from "./agreement-homologation-form";

function formatDateTime(value?: string | null) {
  if (!value) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function AgreementFormalizationCard({ acordo, hideTitle = false }: { acordo: any; hideTitle?: boolean }) {
  const state = formalizacaoState(acordo);
  const homologacoes = [...(acordo.homologacoes_adm ?? [])].sort((a, b) =>
    b.criado_em.localeCompare(a.criado_em) || b.id.localeCompare(a.id),
  );
  const homologacao = acordo.acordo_homologado ? "Homologado"
    : homologacoes[0]?.conferido === false ? "Divergência pendente"
    : homologacoes[0]?.conferido ? "Cadastro alterado · conferir novamente"
    : state.recebido ? "Aguardando homologação" : "Aguardando boletos";
  const termos: any[] = acordo.termos ?? [];
  const pagamento = ["parcial", "quitado"].includes(acordo.status_financeiro) || acordo.status === "quitado";
  const etapas = [
    ["Documento", state.documento],
    ["Comunicação ao devedor", state.comunicacao],
    ["Solicitação à administradora", state.solicitacao],
    ["Boletos", state.boletos],
    ...(acordo.tipo === "extrajudicial" ? [["Homologação da ADM", homologacao]] : []),
    ["Primeiro pagamento", pagamento ? "Pagamento registrado" : "Aguardando pagamento"],
  ];
  const acoes = [
    { status: "boletos_solicitados", titulo: "Confirmar solicitação enviada por outro canal", permitido: state.podeConfirmarSolicitacao, ajuda: "Informe o protocolo ou a referência da solicitação efetivamente enviada à administradora." },
    { status: "boletos_recebidos", titulo: "Confirmar recebimento dos boletos", permitido: state.podeConfirmarRecebimento, ajuda: "Informe o documento, arquivo ou protocolo que comprova o recebimento." },
    { status: "boletos_enviados", titulo: "Confirmar envio dos boletos ao devedor", permitido: state.podeConfirmarEnvio, ajuda: "Informe a referência do e-mail, mensagem ou protocolo de envio ao devedor." },
  ];
  return <Card id="formalizacao"><CardContent className="space-y-4 p-4">
    {!hideTitle && <h2 className="flex items-center gap-2 text-base font-semibold"><FileText className="h-4 w-4" />Formalização e boletos</h2>}
    <dl className="divide-y divide-slate-100">
      {etapas.map(([titulo, descricao]) => <div key={titulo} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
        <dt className="text-slate-500">{titulo}</dt><dd className="font-medium text-slate-950">{descricao}</dd>
      </div>)}
    </dl>
    {acordo.tipo === "extrajudicial" && <details open={state.recebido && !acordo.acordo_homologado} className="rounded-lg border border-slate-200 p-3">
      <summary className="cursor-pointer text-sm font-semibold">Homologação da administradora</summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm text-slate-700">Baixe o registro da administradora junto com os boletos. Compare o PDF com as cotas vinculadas, os valores e a tabela de parcelas deste acordo.</p>
        {!["cancelado", "quebrado", "rompido", "renegociado"].includes(acordo.status)
            && !(acordo.exige_aprovacao_sindico && !acordo.sindico_aprovado_em)
            && <AgreementHomologationForm id={acordo.id} revisao={acordo.acordo_revisao_adm} />}
        {homologacoes.length > 0 && <ul className="divide-y divide-slate-100 text-sm">
          {homologacoes.map(h => <li key={h.id} className="py-2">
            <p>{h.conferido ? "Homologado na data" : "Divergência registrada"} · {formatDateTime(h.criado_em)} · {h.referencia}</p>
            {h.operador_nome && <p className="text-slate-600">{h.operador_nome}</p>}
            {h.divergencia && <p>{h.divergencia}</p>}
            <a className="text-cyan-800 underline" href={`/api/acordos/homologacoes/${h.id}`}>Baixar {h.nome_pdf}</a>
          </li>)}
        </ul>}
      </div>
    </details>}
    {state.legadoSemEvidencia && <p role="status" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Existe um status histórico de boletos sem evidência nesta trilha. Confira o histórico e registre a confirmação com o protocolo correspondente; esse status não comprova envio ou recebimento.</p>}
    <p className="text-xs text-slate-500">Gerar o termo ou preparar um e-mail não confirma envio, entrega ou aceite. O envio automático é registrado após confirmação do transporte.</p>
    <details className="rounded-lg border border-slate-200 p-3">
      <summary className="cursor-pointer text-sm font-semibold">Termos e mensagens preparadas</summary>
      <div className="mt-3 space-y-3 text-sm">
        {termos.length ? termos.map(t => <div key={t.id} className="border-b border-slate-100 pb-2">
          <p className="font-medium">{t.tipo_aceite === "sindico" ? "Termo do síndico" : "Termo do devedor"}</p>
          <p className="text-xs text-slate-500">{t.aceito_em && t.status === "aceito" ? `Aceite registrado: ${formatDateTime(t.aceito_em)}` : t.visualizado_em ? `Visualizado: ${formatDateTime(t.visualizado_em)}` : `Gerado: ${formatDateTime(t.created_at)}`}</p>
        </div>) : <p className="text-slate-500">Nenhum termo gerado.</p>}
        {(acordo.mensagens_formalizacao ?? []).filter((m: any) => m.origem_evento === "acordo_boletos_administradora").map((m: any) => <div key={m.id}>
          <p className="mb-1 text-xs font-medium">Solicitação preparada · {m.email_assunto ?? "Emissão de boletos"}</p>
          <textarea aria-label="Texto da solicitação preparada" readOnly rows={5} className="w-full rounded-lg border border-slate-200 p-2 text-xs" value={m.conteudo_renderizado ?? m.conteudo ?? "Conteúdo não informado"} />
        </div>)}
        <a href="/app/mensageria" className="inline-block font-medium text-cyan-800 underline">Consultar mensagens e aprovação de envio</a>
      </div>
    </details>
    <details className="rounded-lg border border-slate-200 p-3">
      <summary className="cursor-pointer text-sm font-semibold">Confirmações manuais com evidência</summary>
      <p className="mt-2 text-xs text-slate-500">Use para eventos realizados fora do envio automático do app. As etapas são liberadas na ordem e ficam registradas com data e operadora.</p>
      <div className="mt-3 space-y-3">
        {acoes.map(acao => <form key={acao.status} action={atualizarStatusBoletosAcordo} className="space-y-2 rounded-lg bg-slate-50 p-3">
          <input type="hidden" name="acordo_id" value={acordo.id} />
          <input type="hidden" name="status_boletos" value={acao.status} />
          <label htmlFor={`evidencia-${acao.status}`} className="block text-sm font-medium">{acao.titulo}</label>
          <p id={`ajuda-${acao.status}`} className="text-xs text-slate-500">{acao.ajuda}</p>
          <textarea id={`evidencia-${acao.status}`} name="evidencia" required minLength={10} maxLength={2000} disabled={!acao.permitido} aria-describedby={`ajuda-${acao.status}`} rows={2} className="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm disabled:opacity-50" />
          <PendingSubmitButton size="sm" disabled={!acao.permitido} pendingLabel="Confirmando..." icon={<CheckCircle2 className="h-4 w-4" />}>Registrar confirmação</PendingSubmitButton>
          {!acao.permitido && <p className="text-xs text-slate-500">Etapa já concluída, anterior pendente ou acordo bloqueado/encerrado.</p>}
        </form>)}
      </div>
    </details>
    <details className="rounded-lg border border-slate-200 p-3">
      <summary className="cursor-pointer text-sm font-semibold">Histórico de evidências ({state.eventos.length})</summary>
      <ul className="mt-3 divide-y divide-slate-100">
        {state.eventos.map(e => <li key={e.id} className="space-y-1 py-2 text-xs">
          <p className="font-semibold">{e.evento.replaceAll("_", " ")} · {formatDateTime(e.ocorrido_em)}</p>
          <p>{e.evidencia}</p>
          <p className="text-slate-500">{e.profiles?.nome ?? (e.usuario_id ? `Operador ${e.usuario_id}` : "Integração automática")} · {e.origem.replaceAll("_", " ")}</p>
        </li>)}
        {!state.eventos.length && <li className="text-xs text-slate-500">Nenhum evento registrado nesta trilha. O histórico anterior foi preservado.</li>}
      </ul>
    </details>
  </CardContent></Card>;
}
