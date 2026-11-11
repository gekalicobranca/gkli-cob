"use client";

import { useActionState } from "react";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { registrarHomologacaoAdm } from "@/features/acordos/homologacao-actions";

export function AgreementHomologationForm({ id, revisao, simplified = false }: { id: string; revisao: string; simplified?: boolean }) {
  const [state, action] = useActionState(registrarHomologacaoAdm, {});
  if (simplified && state.mensagem === "Acordo homologado.") {
    return <p role="status" className="rounded-lg bg-emerald-50 p-4 text-emerald-900">Acordo efetivado. Conferência da administradora registrada.</p>;
  }
  const divergenceField = <label className="block">Divergências encontradas
    <textarea name="divergencia" maxLength={2000} rows={2} className="mt-1 block w-full rounded border p-2" placeholder="Informe o campo e os valores do app e da ADM." />
  </label>;
  return (
    <form action={action} className="space-y-3 text-sm"
      onReset={simplified ? event => event.preventDefault() : undefined}>
      <input type="hidden" name="acordo_id" value={id} />
      <input type="hidden" name="revisao" value={revisao} />
      <label className="block">Número ou protocolo do acordo na ADM
        <input name="referencia" required maxLength={150} className="mt-1 block w-full rounded border p-2" />
      </label>
      <label className="block">Registro baixado da ADM (PDF, até 3 MB)
        <input name="registro_adm" type="file" required accept="application/pdf,.pdf" className="mt-1 block w-full" />
      </label>
      <fieldset className="space-y-1">
        <legend className="font-medium">O registro da ADM confere com o cadastro do app?</legend>
        <label className="block"><input name="identificacao" type="checkbox" /> Condomínio, unidade, bloco e cotas negociadas.</label>
        <label className="block"><input name="condicoes" type="checkbox" /> Data do acordo, valor total e entrada.</label>
        <label className="block"><input name="parcelas" type="checkbox" /> Quantidade, valores e vencimentos das parcelas.</label>
      </fieldset>
      {simplified ? <details>
        <summary className="cursor-pointer font-medium">Informar uma divergência</summary>
        <div className="mt-2 space-y-2">
          {divergenceField}
          <PendingSubmitButton name="decisao" value="divergencia" variant="secondary">Registrar divergência</PendingSubmitButton>
        </div>
      </details> : divergenceField}
      {state.erro && <p role="alert" className="text-red-700">{state.erro}</p>}
      {state.mensagem && <p role="status" className="text-emerald-800">{state.mensagem}</p>}
      <div className="flex flex-wrap gap-2">
        {!simplified && <PendingSubmitButton name="decisao" value="divergencia" variant="secondary">Registrar divergência</PendingSubmitButton>}
        <PendingSubmitButton name="decisao" value="homologar">{simplified ? "Efetivar acordo" : "Homologar acordo"}</PendingSubmitButton>
      </div>
    </form>
  );
}
