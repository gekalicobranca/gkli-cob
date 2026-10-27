"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/utils/auth/require-user";
import { createAdminClient } from "@/utils/supabase/admin";
import { sendSmtpEmail } from "@/features/mensageria/email-provider";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";

const PAGE_PATH = "/app/configuracoes/integracoes";

async function authorizeCarteira(carteiraId: string | null) {
  const scope = await getPermittedCarteiras();
  if (!scope.isAdmin && (!carteiraId || !scope.carteiraIds?.includes(carteiraId))) throw new Error("Carteira não autorizada.");
}

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function boolValue(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function getCarteiraParam(formData: FormData) {
  const value = formString(formData, "carteira_id");
  return value === "global" ? "" : value;
}

function redirectWithResult(type: "saved" | "tested" | "error", message?: string, carteiraId?: string | null, configId?: string) {
  const params = new URLSearchParams({ smtp: type });
  if (message) params.set("msg", message.slice(0, 360));
  if (carteiraId) params.set("carteira", carteiraId);
  if (configId) params.set('conta', configId);
  redirect(`${PAGE_PATH}?${params.toString()}`);
}

export async function salvarConfiguracaoSmtp(formData: FormData) {
  const user = await requireUser();
  const supabase = createAdminClient();
  const carteiraId = getCarteiraParam(formData) || null;
  await authorizeCarteira(carteiraId);
  const configId = formString(formData, 'config_id');
  if (configId && !/^[0-9a-f-]{36}$/i.test(configId)) redirectWithResult('error', 'Conta SMTP inválida.', carteiraId);

  const host = formString(formData, "host");
  const porta = Number(formString(formData, "porta") || 587);
  const usuario = formString(formData, "usuario") || null;
  const senha = formString(formData, "senha");
  const remetente = formString(formData, "remetente") || usuario;
  const ehloDomain = formString(formData, "ehlo_domain") || "gkli.local";
  const ativo = boolValue(formData, "ativo");
  const secure = boolValue(formData, "secure");
  const starttls = !secure && boolValue(formData, "starttls");

  if (!host) redirectWithResult("error", "Informe o servidor SMTP.", carteiraId);
  if (!Number.isInteger(porta) || porta <= 0 || porta > 65535) redirectWithResult("error", "Informe uma porta valida.", carteiraId);
  if (!usuario || !/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(usuario)) redirectWithResult('error', 'Informe o e-mail da conta autenticada.', carteiraId);
  if (!remetente || !remetente.includes("@")) redirectWithResult("error", "Informe um remetente valido.", carteiraId);

  let currentQuery = supabase
    .from("integracoes_smtp_config")
    .select("id,senha,auth_method,usuario")
    .eq('id', configId || '00000000-0000-0000-0000-000000000000');

  currentQuery = carteiraId ? currentQuery.eq("carteira_id", carteiraId) : currentQuery.is("carteira_id", null);

  const { data: atual, error: currentError } = await currentQuery.maybeSingle();

  if (currentError) {
    redirectWithResult("error", `Nao foi possivel carregar a configuracao: ${currentError.message}`, carteiraId);
  }
  if (configId && !atual) redirectWithResult('error', 'Conta SMTP não encontrada nesta carteira.', carteiraId);
  if (atual?.usuario && usuario?.toLowerCase() !== atual.usuario.toLowerCase()) redirectWithResult('error', 'Para outro e-mail, adicione uma conta SMTP. A identidade desta conta deve ser preservada.', carteiraId);
  if (ativo && atual?.auth_method !== 'google_oauth' && !senha && !atual?.senha) redirectWithResult('error', 'Informe a senha antes de ativar esta conta.', carteiraId);

  if (atual?.auth_method === 'google_oauth' && (usuario !== atual.usuario || host !== 'smtp.gmail.com' || porta !== 465 || !secure || senha)) {
    redirectWithResult('error', 'Esta conta usa Google OAuth. Mantenha o e-mail, SSL e servidor Google; não informe senha.', carteiraId);
  }

  const payload = {
    carteira_id: carteiraId,
    ativo,
    host,
    porta,
    usuario,
    senha: senha || (atual as any)?.senha || null,
    remetente,
    secure,
    starttls,
    ehlo_domain: ehloDomain,
    atualizado_em: new Date().toISOString(),
    atualizado_por: user.id,
  };

  const query = (atual as any)?.id
    ? supabase.from("integracoes_smtp_config").update(payload as any).eq("id", (atual as any).id)
    : supabase.from("integracoes_smtp_config").insert(payload as any);

  const { data: saved, error } = await query.select('id').single();
  if (error) redirectWithResult("error", `Erro ao salvar SMTP: ${error.message}`, carteiraId);

  revalidatePath(PAGE_PATH);
  redirectWithResult("saved", "Configuracao SMTP salva.", carteiraId, saved?.id);
}

export async function testarConfiguracaoSmtp(formData: FormData) {
  await requireUser();

  const carteiraId = getCarteiraParam(formData) || null;
  await authorizeCarteira(carteiraId);
  const smtpConfigId = formString(formData, 'config_id');
  if (!smtpConfigId || !/^[0-9a-f-]{36}$/i.test(smtpConfigId)) redirectWithResult('error', 'Selecione e salve a conta SMTP antes de testar.', carteiraId);
  const destinatario = formString(formData, "destinatario_teste");
  if (!destinatario || !destinatario.includes("@")) {
    redirectWithResult("error", "Informe um destinatario de teste valido.", carteiraId);
  }

  try {
    await sendSmtpEmail(
      {
        to: destinatario,
        subject: "Teste SMTP - GKLI Cobranca",
        text: [
          "Teste de envio SMTP realizado pelo GKLI Cobranca.",
          "",
          `Data/hora: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
        ].join("\n"),
      },
      { carteiraId, smtpConfigId },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    redirectWithResult("error", `Teste falhou: ${message}`, carteiraId);
  }

  revalidatePath(PAGE_PATH);
  redirectWithResult("tested", `E-mail de teste enviado para ${destinatario}.`, carteiraId, smtpConfigId);
}
