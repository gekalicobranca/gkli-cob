import {
  CalendarClock,
  Handshake,
  MessageCircle,
  PhoneCall,
  Send,
} from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { COBRANCA_STATUS_OPERACIONAL } from "@/lib/constants/cobrancas";
import { buildWhatsappHref } from "@/features/cobrancas/workspace/contact";

export function CobrancaWorkspaceActions({
  cobranca,
  canCreateAcordo,
  defaultAction,
  updateStatusAction,
  createInteracaoAction,
  agendarRetornoAction,
}: {
  cobranca: any;
  canCreateAcordo: boolean;
  defaultAction?: string | null;
  updateStatusAction: (formData: FormData) => Promise<void>;
  createInteracaoAction: (formData: FormData) => Promise<void>;
  agendarRetornoAction: (formData: FormData) => Promise<void>;
}) {
  const whatsappHref = buildWhatsappHref({
    telefone: cobranca.unidades?.telefone,
    responsavel: cobranca.unidades?.responsavel_nome,
    condominio: cobranca.condominios?.nome,
    unidade: cobranca.unidades?.identificacao,
  });

  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Ações rápidas
          </p>
          <h2 className="mt-1 text-base font-semibold text-slate-950">
            Resolver agora
          </h2>
        </div>
        {defaultAction ? (
          <span className="rounded-full bg-[var(--gkli-primary-light)] px-3 py-1.5 text-xs font-medium text-[var(--gkli-primary)]">
            Foco: {defaultAction}
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {whatsappHref ? (
          <ButtonLink
            href={whatsappHref}
            target="_blank"
            variant="secondary"
            className="w-full"
          >
            <MessageCircle size={15} />
            WhatsApp
          </ButtonLink>
        ) : (
          <span className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-[13px] font-medium text-slate-400">
            Sem telefone
          </span>
        )}

        <form action={createInteracaoAction}>
          <input type="hidden" name="cobranca_id" value={cobranca.id} />
          <input
            type="hidden"
            name="carteira_id"
            value={cobranca.carteira_id}
          />
          <input type="hidden" name="tipo" value="ligacao" />
          <input
            type="hidden"
            name="conteudo"
            value="Tentativa de ligação registrada pelo workspace."
          />
          <Button type="submit" variant="secondary" className="w-full">
            <PhoneCall size={15} />
            Ligação
          </Button>
        </form>

        <form action={updateStatusAction}>
          <input type="hidden" name="cobranca_id" value={cobranca.id} />
          <input
            type="hidden"
            name="status"
            value={COBRANCA_STATUS_OPERACIONAL.EM_NEGOCIACAO}
          />
          <Button type="submit" variant="secondary" className="w-full">
            <Send size={15} />
            Negociação
          </Button>
        </form>

        {canCreateAcordo ? (
          <ButtonLink
            href={`/app/acordos/selecionar?cobrancaId=${cobranca.id}`}
            className="w-full"
          >
            <Handshake size={15} />
            Acordo
          </ButtonLink>
        ) : (
          <ButtonLink
            href="/app/acordos"
            variant="secondary"
            className="w-full"
          >
            <Handshake size={15} />
            Acordos
          </ButtonLink>
        )}
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
        <form
          action={createInteracaoAction}
          className="rounded-2xl border border-slate-100 bg-slate-50 p-3"
        >
          <input type="hidden" name="cobranca_id" value={cobranca.id} />
          <input
            type="hidden"
            name="carteira_id"
            value={cobranca.carteira_id}
          />
          <div className="grid gap-2 sm:grid-cols-[130px_1fr]">
            <select
              name="tipo"
              defaultValue="registro"
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none"
            >
              <option value="registro">registro</option>
              <option value="whatsapp">whatsapp</option>
              <option value="ligacao">ligação</option>
              <option value="email">e-mail</option>
              <option value="negociacao">negociação</option>
            </select>
            <Textarea
              name="conteudo"
              required
              placeholder="Registro rápido do contato, proposta ou objeção..."
            />
          </div>
          <div className="mt-2 flex justify-end">
            <Button type="submit" size="sm">
              Salvar
            </Button>
          </div>
        </form>

        <form
          action={agendarRetornoAction}
          className="rounded-2xl border border-slate-100 bg-slate-50 p-3"
        >
          <input type="hidden" name="cobranca_id" value={cobranca.id} />
          <input
            type="hidden"
            name="carteira_id"
            value={cobranca.carteira_id}
          />
          <div className="grid gap-2 sm:grid-cols-[175px_1fr]">
            <label className="text-sm font-medium text-slate-700">
              Retorno
              <input
                name="proxima_acao_em"
                type="datetime-local"
                required
                className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none"
              />
            </label>
            <Textarea
              name="observacao"
              placeholder="Combinado ou motivo do retorno..."
            />
          </div>
          <div className="mt-2 flex justify-end">
            <Button type="submit" size="sm" variant="secondary">
              <CalendarClock size={15} />
              Agendar
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
