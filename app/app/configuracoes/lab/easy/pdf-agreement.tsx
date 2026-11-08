"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { formatCurrency } from "@/utils/formatters/currency";
import { formatarVencimentoAcordo } from "@/features/acordos/formatar-vencimento";
import { efetivarParcelasPdfAdm, lerParcelasPdfAdm, type PreviaParcelasAdm } from "@/features/acordos/pdf-parcelas-actions";

export function EasyPdfAgreement({ id }: { id: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const requestVersion = useRef(0);
  const [previa, setPrevia] = useState<PreviaParcelasAdm | null>(null);
  const [readError, setReadError] = useState("");
  const [referencia, setReferencia] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [showSaveError, setShowSaveError] = useState(false);
  const [reading, startReading] = useTransition();
  const [state, action, saving] = useActionState(efetivarParcelasPdfAdm, {});

  function readPdf(resetReference = false) {
    if (!formRef.current) return;
    const form = new FormData(formRef.current);
    if (resetReference) {
      form.set("referencia", "");
      setReferencia("");
    }
    const version = ++requestVersion.current;
    setPrevia(null);
    setReadError("");
    setShowSaveError(false);
    setConfirmed(false);
    startReading(async () => {
      try {
        const result = await lerParcelasPdfAdm(form);
        if (version !== requestVersion.current) return;
        setReadError(result.erro ?? "");
        if (result.previa) {
          setPrevia(result.previa);
          setReferencia(result.previa.referencia);
        }
      } catch {
        if (version === requestVersion.current) setReadError("A leitura foi interrompida. Tente novamente.");
      }
    });
  }

  if (state.mensagem) return <p role="status" className="rounded-lg bg-emerald-50 p-4 text-emerald-900">{state.mensagem}</p>;

  const changedTotal = previa && previa.totalCentavos !== previa.totalSimuladoCentavos;
  return <form ref={formRef} action={action} onSubmit={() => setShowSaveError(true)}
    onReset={event => event.preventDefault()} className="space-y-4">
    <input type="hidden" name="acordo_id" value={id} />
    <input type="hidden" name="hash_pdf" value={previa?.hash ?? ""} />
    <input type="hidden" name="revisao" value={previa?.revisao ?? ""} />
    <label className="block text-sm font-semibold">Acordo da administradora em PDF
      <input name="registro_adm" type="file" accept="application/pdf,.pdf" required disabled={saving}
        className="mt-2 block w-full min-w-0 font-normal" onChange={() => readPdf(true)} />
      <span className="mt-1 block font-normal text-slate-500">PDF pesquisável de até 3 MB. A leitura começa ao escolher o arquivo.</span>
    </label>
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm">Referência do acordo</summary>
      <label className="mt-2 block text-sm">Número ou protocolo, se necessário
        <input name="referencia" value={referencia} maxLength={150} disabled={saving}
          className="mt-1 w-full rounded-lg border p-2" onChange={event => {
            requestVersion.current++;
            setReferencia(event.target.value);
            setPrevia(null);
            setConfirmed(false);
          }} />
      </label>
      <button type="button" disabled={reading || saving} onClick={() => readPdf()} className="mt-2 rounded-lg border px-3 py-2 text-sm">
        Ler PDF
      </button>
    </details>
    {reading && <p role="status" className="text-sm text-slate-600">Lendo as parcelas do documento…</p>}
    {readError && <p role="alert" className="text-sm text-rose-700">{readError}</p>}
    {previa && <section className="space-y-3" aria-label="Parcelas extraídas do PDF">
      <h3 className="font-semibold">{previa.parcelas.length} parcela(s) · {formatCurrency(previa.totalCentavos / 100)}</h3>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Valores e vencimentos extraídos do documento da administradora.</caption>
          <thead className="bg-slate-50"><tr>
            <th scope="col" className="p-3">Parcela</th><th scope="col" className="p-3">Vencimento</th><th scope="col" className="p-3 text-right">Valor</th>
          </tr></thead>
          <tbody className="divide-y">{previa.parcelas.map(parcela => <tr key={parcela.numero}>
            <td className="p-3">{parcela.numero === 0 ? "Entrada" : parcela.numero}</td>
            <td className="whitespace-nowrap p-3">{formatarVencimentoAcordo(parcela.vencimento)}</td>
            <td className="whitespace-nowrap p-3 text-right">{formatCurrency(parcela.centavos / 100)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {changedTotal && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        O total da simulação é {formatCurrency(previa.totalSimuladoCentavos / 100)}.
        Ao efetivar, será usado o total de {formatCurrency(previa.totalCentavos / 100)} do PDF.
      </p>}
      {previa.avisos.map(aviso => <p key={aviso} className="text-sm text-amber-900">{aviso}</p>)}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirmacao" checked={confirmed} disabled={saving} className="mt-1"
          onChange={event => setConfirmed(event.target.checked)} />
        Conferi o condomínio, a unidade e as parcelas. Confirmo as condições e o total apresentados no PDF.
      </label>
    </section>}
    {showSaveError && state.erro && <p role="alert" className="text-sm text-rose-700">{state.erro}</p>}
    <PendingSubmitButton disabled={!previa || !confirmed || reading || saving} pendingLabel="Efetivando…">Efetivar acordo</PendingSubmitButton>
  </form>;
}
