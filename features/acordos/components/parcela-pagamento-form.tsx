import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { corrigirRepassePago, marcarParcelaComoPaga } from "@/features/acordos/actions";

type Parcela = {
  id: string;
  valor: number | string;
  valor_pago?: number | string | null;
  valor_repasse_informado?: number | string | null;
};

export function ParcelaPagamentoForm({ parcela, acordoId, paga = false }: { parcela: Parcela; acordoId: string; paga?: boolean }) {
  const repasse = parcela.valor_repasse_informado == null ? "" : Number(parcela.valor_repasse_informado).toFixed(2);
  const inputClass = "mt-1 block h-9 w-32 rounded-lg border border-slate-300 px-2 text-sm";
  return (
    <form action={paga ? corrigirRepassePago : marcarParcelaComoPaga} className="flex flex-wrap items-end gap-2 text-left text-xs text-slate-600">
      <input type="hidden" name="parcela_id" value={parcela.id} />
      <input type="hidden" name="acordo_id" value={acordoId} />
      <input type="hidden" name="repasse_anterior" value={repasse} />
      {!paga && <label>Valor pago (R$)
        <input name="valor_pago" type="number" min="0" step="0.01" defaultValue={Number(parcela.valor_pago ?? parcela.valor).toFixed(2)} className={inputClass} />
      </label>}
      <label>Repasse (R$)
        <input name="valor_repasse_informado" type="number" min="0" step="0.01" defaultValue={repasse} placeholder="Automático" className={inputClass} />
      </label>
      <PendingSubmitButton size="sm" pendingLabel="Salvando...">{paga ? "Salvar repasse" : "Marcar como paga"}</PendingSubmitButton>
      <span className="basis-full">Em branco usa o rateio do acordo. Informe 0,00 para isenção.</span>
    </form>
  );
}
