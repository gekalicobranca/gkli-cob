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

function onlyDigits(value?: string | null) {
  return String(value ?? "").replace(/\D/g, "");
}

function buildWhatsappHref(params: {
  telefone?: string | null;
  responsavel?: string | null;
  condominio?: string | null;
  unidade?: string | null;
  valor?: number | string | null;
}) {
  const digits = onlyDigits(params.telefone);
  if (!digits) return null;

  const phone = digits.startsWith("55") ? digits : `55${digits}`;
  const message = [
    `Olá${params.responsavel ? `, ${params.responsavel}` : ""}.`,
    `Aqui é da GKLI Cobrança.`,
    `Estou entrando em contato sobre a unidade ${params.unidade ?? "-"} do ${params.condominio ?? "condomínio"}.`,
    "Podemos conversar para regularizar essa pendência?",
  ].join(" ");

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function CobrancaQuickActions({
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
    valor: cobranca.valor_atualizado,
  });

  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
            Ações rápidas
          </p>
          <h2 className="mt-2 text-lg font-semibold text-slate-950">
            Resolver sem sair do prontuário
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Registre contato, avance status, agende retorno ou transforme a
            cobranças da unidade em um acordo.
          </p>
        </div>
        {defaultAction ? (
          <span className="rounded-full bg-[var(--gkli-primary-light)] px-3 py-1.5 text-xs font-medium text-[var(--gkli-primary)]">
            Foco: {defaultAction}
          </span>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {whatsappHref ? (
          <ButtonLink
            href={whatsappHref}
            target="_blank"
            variant="secondary"
            className="w-full"
          >
            <MessageCircle size={15} />
            Abrir WhatsApp
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
            value="Tentativa de ligação registrada pelo cockpit/prontuário."
          />
          <Button type="submit" variant="secondary" className="w-full">
            <PhoneCall size={15} />
            Registrar ligação
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
            Em negociação
          </Button>
        </form>

        {canCreateAcordo ? (
          <ButtonLink
            href={`/app/acordos/selecionar?cobrancaId=${cobranca.id}`}
            className="w-full"
          >
            <Handshake size={15} />
            Agrupar cobranças
          </ButtonLink>
        ) : (
          <ButtonLink
            href="/app/acordos"
            variant="secondary"
            className="w-full"
          >
            <Handshake size={15} />
            Ver acordos
          </ButtonLink>
        )}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <form
          action={createInteracaoAction}
          className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
        >
          <input type="hidden" name="cobranca_id" value={cobranca.id} />
          <input
            type="hidden"
            name="carteira_id"
            value={cobranca.carteira_id}
          />
          <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
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
              placeholder="Anote rapidamente o contato, proposta, objeção ou retorno do responsável..."
            />
          </div>
          <div className="mt-3 flex justify-end">
            <Button type="submit" size="sm">
              Salvar contato
            </Button>
          </div>
        </form>

        <form
          action={agendarRetornoAction}
          className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
        >
          <input type="hidden" name="cobranca_id" value={cobranca.id} />
          <input
            type="hidden"
            name="carteira_id"
            value={cobranca.carteira_id}
          />
          <div className="grid gap-3 sm:grid-cols-[190px_1fr]">
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
              placeholder="Motivo do retorno ou combinado com o responsável..."
            />
          </div>
          <div className="mt-3 flex justify-end">
            <Button type="submit" size="sm" variant="secondary">
              <CalendarClock size={15} />
              Agendar retorno
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
