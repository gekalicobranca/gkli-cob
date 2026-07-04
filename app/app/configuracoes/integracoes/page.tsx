import { Mail, Save, Send, Server, ShieldCheck } from "lucide-react";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getSmtpConfigStatus } from "@/features/mensageria/email-provider";
import { salvarConfiguracaoSmtp, testarConfiguracaoSmtp } from "@/features/configuracoes/smtp-actions";
import { listCarteiras } from "@/features/carteiras/queries";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function ResultBanner({ type, message }: { type?: string; message?: string }) {
  if (!type) return null;

  const isError = type === "error";
  const isTest = type === "tested";
  const text = message || (isError ? "Não foi possível concluir a operação." : isTest ? "Teste enviado." : "Configuração salva.");

  return (
    <div
      className={[
        "rounded-xl border px-4 py-3 text-sm",
        isError
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700",
      ].join(" ")}
    >
      {text}
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  placeholder,
  helper,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  placeholder?: string;
  helper?: string;
}) {
  return (
    <label className="grid gap-2 text-sm text-slate-700">
      <span>{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-950 outline-none transition focus:border-[#04799a] focus:ring-2 focus:ring-[#04799a]/15"
      />
      {helper ? <span className="text-xs leading-5 text-slate-500">{helper}</span> : null}
    </label>
  );
}

function Toggle({ label, name, defaultChecked, helper }: { label: string; name: string; defaultChecked?: boolean; helper?: string }) {
  return (
    <label className="flex min-h-11 items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
      <input name={name} type="checkbox" defaultChecked={defaultChecked} className="mt-0.5 h-4 w-4 accent-[#04799a]" />
      <span>
        <span className="block font-medium text-slate-900">{label}</span>
        {helper ? <span className="mt-1 block text-xs leading-5 text-slate-500">{helper}</span> : null}
      </span>
    </label>
  );
}

function StatusCard({ title, value, detail, icon: Icon }: { title: string; value: string; detail: string; icon: typeof Server }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">{title}</p>
          <p className="mt-3 text-2xl font-semibold text-slate-950">{value}</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p>
        </div>
        <span className="rounded-full bg-cyan-50 p-3 text-[#04799a]">
          <Icon size={18} />
        </span>
      </div>
    </div>
  );
}

function CarteiraSelector({
  carteiras,
  selectedCarteiraId,
}: {
  carteiras: any[];
  selectedCarteiraId: string;
}) {
  return (
    <form className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <label className="grid gap-2 text-sm text-slate-700">
        <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Carteira de envio</span>
        <select
          name="carteira"
          defaultValue={selectedCarteiraId || "global"}
          className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-950 outline-none transition focus:border-[#04799a] focus:ring-2 focus:ring-[#04799a]/15"
        >
          <option value="global">Fallback global do app</option>
          {carteiras.map((carteira) => (
            <option key={carteira.id} value={carteira.id}>
              {carteira.nome}
            </option>
          ))}
        </select>
        <span className="text-xs leading-5 text-slate-500">
          A regua usa primeiro o SMTP da carteira da mensagem. Se nao houver conta ativa, usa o fallback global.
        </span>
      </label>
      <button className="mt-4 rounded-lg bg-[#04799a] px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
        Carregar configuracao
      </button>
    </form>
  );
}

export const dynamic = "force-dynamic";

export default async function IntegracoesPage({ searchParams }: PageProps) {
  const emptyParams: Record<string, string | string[] | undefined> = {};
  const params = searchParams ? await searchParams : emptyParams;
  const selectedCarteiraId = singleParam(params.carteira) === "global" ? "" : singleParam(params.carteira) || "";
  const scope = await getPermittedCarteiras();
  const [status, carteiras] = await Promise.all([
    getSmtpConfigStatus(selectedCarteiraId),
    listCarteiras(scope),
  ]);
  const resultType = singleParam(params.smtp);
  const resultMessage = singleParam(params.msg);
  const selectedCarteira = carteiras.find((carteira: any) => carteira.id === selectedCarteiraId);
  const selectedCarteiraValue = selectedCarteiraId || "global";
  const editingDatabaseRecord = status.source === "database" && status.configScope !== "fallback_global";

  const sourceLabel =
    status.configScope === "carteira"
      ? "Carteira"
      : status.configScope === "fallback_global"
        ? "Fallback global"
        : status.source === "database"
          ? "Banco de dados"
          : status.source === "environment"
            ? "Ambiente"
            : "Não configurado";
  const statusLabel = status.configured && status.active ? "Pronto" : status.configured ? "Inativo" : "Pendente";

  return (
    <div className="space-y-5">
      <section className="rounded-[1.4rem] bg-gradient-to-r from-[#04799a] to-[#06465a] p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100">Configurações</span>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">Integrações</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-cyan-50">
              Configure o SMTP usado pela mensageria, lotes e operação supervisionada da Keila.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-sm">
            <Mail size={16} />
            SMTP
          </span>
        </div>
      </section>

      <ResultBanner type={resultType} message={resultMessage} />

      {status.unavailableReason ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
          A tabela de configuração SMTP ainda não respondeu. A tela continua mostrando o fallback por ambiente.
          Detalhe: {status.unavailableReason}
        </div>
      ) : null}

      <CarteiraSelector carteiras={carteiras} selectedCarteiraId={selectedCarteiraValue} />

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
        Configurando:{" "}
        <span className="font-medium text-slate-950">
          {selectedCarteira ? selectedCarteira.nome : "Fallback global do app"}
        </span>
        {status.configScope === "fallback_global" ? (
          <span className="ml-2 text-amber-700">Esta carteira ainda usa o SMTP global.</span>
        ) : null}
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <StatusCard title="Status" value={statusLabel} detail={status.configured ? "Servidor e remetente informados." : "Informe os dados para liberar testes."} icon={ShieldCheck} />
        <StatusCard
          title="Origem"
          value={sourceLabel}
          detail={status.source === "database" ? "Configuração gerenciada nesta tela." : "Fallback por variáveis de ambiente."}
          icon={Server}
        />
        <StatusCard title="Servidor" value={status.host || "-"} detail={`${status.port || 587} · ${status.secure ? "SSL direto" : status.starttls ? "STARTTLS" : "sem TLS"}`} icon={Mail} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <form action={salvarConfiguracaoSmtp} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <input type="hidden" name="carteira_id" value={selectedCarteiraValue} />
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">SMTP</span>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">Configuração de envio</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Use os dados do provedor de e-mail. A senha fica armazenada no servidor e não é exibida depois de salva.
              </p>
            </div>
            <PendingSubmitButton icon={<Save size={16} />} pendingLabel="Salvando...">
              Salvar SMTP
            </PendingSubmitButton>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <Field label="Servidor SMTP" name="host" defaultValue={editingDatabaseRecord ? status.host : ""} placeholder="smtp.seudominio.com.br" />
            <Field label="Porta" name="porta" type="number" defaultValue={editingDatabaseRecord ? status.port : 587} />
            <Field label="Usuário" name="usuario" defaultValue={editingDatabaseRecord ? status.user : ""} placeholder="usuario@dominio.com.br" />
            <Field
              label="Senha"
              name="senha"
              type="password"
              placeholder={status.hasPassword ? "Senha já cadastrada" : "Senha do SMTP"}
              helper={status.hasPassword ? "Deixe em branco para manter a senha atual." : "Será usada somente no servidor."}
            />
            <Field label="Remetente" name="remetente" defaultValue={editingDatabaseRecord ? status.from : ""} placeholder="cobranca@dominio.com.br" />
            <Field label="Domínio EHLO" name="ehlo_domain" defaultValue={editingDatabaseRecord ? status.ehloDomain : "gkli.local"} />
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            <Toggle label="Ativar envio por SMTP" name="ativo" defaultChecked={editingDatabaseRecord ? status.active : false} helper="Quando ativo, lotes e testes usam esta configuração." />
            <Toggle label="SSL direto" name="secure" defaultChecked={editingDatabaseRecord ? status.secure : false} helper="Normalmente usado na porta 465. Não use junto com STARTTLS." />
            <Toggle label="STARTTLS" name="starttls" defaultChecked={editingDatabaseRecord ? status.starttls : true} helper="Normalmente usado nas portas 587 ou 25. Se SSL direto estiver ligado, esta opção é ignorada." />
          </div>
        </form>

        <form action={testarConfiguracaoSmtp} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <input type="hidden" name="carteira_id" value={selectedCarteiraValue} />
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">Teste</span>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Enviar e-mail de teste</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Usa a configuração ativa no banco. Se não houver uma ativa, usa o SMTP das variáveis de ambiente.
          </p>

          <div className="mt-5 grid gap-4">
            <Field label="Destinatário" name="destinatario_teste" type="email" placeholder="email@dominio.com.br" />
            <PendingSubmitButton icon={<Send size={16} />} pendingLabel="Enviando..." disabled={!status.configured || !status.active}>
              Enviar teste
            </PendingSubmitButton>
            {!status.configured || !status.active ? (
              <p className="text-sm leading-6 text-amber-700">Salve e ative uma configuração SMTP antes de testar.</p>
            ) : null}
          </div>

          <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            <p className="font-medium text-slate-900">Resumo atual</p>
            <p>Remetente: {status.from || "-"}</p>
            <p>Usuário: {status.user || "-"}</p>
            <p>Senha: {status.hasPassword ? "cadastrada" : "não cadastrada"}</p>
          </div>
        </form>
      </section>
    </div>
  );
}
