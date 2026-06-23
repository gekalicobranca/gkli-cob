"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/utils/auth/require-user";
import { createAdminClient } from "@/utils/supabase/admin";
import { sendSmtpEmail } from "@/features/mensageria/email-provider";

const PAGE_PATH = "/app/configuracoes/integracoes";

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function boolValue(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function redirectWithResult(type: "saved" | "tested" | "error", message?: string) {
  const params = new URLSearchParams({ smtp: type });
  if (message) params.set("msg", message.slice(0, 180));
  redirect(`${PAGE_PATH}?${params.toString()}`);
}

export async function salvarConfiguracaoSmtp(formData: FormData) {
  const user = await requireUser();
  const supabase = createAdminClient();

  const host = formString(formData, "host");
  const porta = Number(formString(formData, "porta") || 587);
  const usuario = formString(formData, "usuario") || null;
  const senha = formString(formData, "senha");
  const remetente = formString(formData, "remetente") || usuario;
  const ehloDomain = formString(formData, "ehlo_domain") || "gkli.local";
  const ativo = boolValue(formData, "ativo");
  const secure = boolValue(formData, "secure") || porta === 465;
  const starttls = boolValue(formData, "starttls");

  if (!host) redirectWithResult("error", "Informe o servidor SMTP.");
  if (!Number.isFinite(porta) || porta <= 0) redirectWithResult("error", "Informe uma porta válida.");
  if (!remetente || !remetente.includes("@")) redirectWithResult("error", "Informe um remetente válido.");

  const { data: atual, error: currentError } = await supabase
    .from("integracoes_smtp_config")
    .select("id,senha")
    .order("atualizado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (currentError) redirectWithResult("error", `Não foi possível carregar a configuração: ${currentError.message}`);

  const payload = {
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

  const { error } = await query;
  if (error) redirectWithResult("error", `Erro ao salvar SMTP: ${error.message}`);

  revalidatePath(PAGE_PATH);
  redirectWithResult("saved", "Configuração SMTP salva.");
}

export async function testarConfiguracaoSmtp(formData: FormData) {
  await requireUser();

  const destinatario = formString(formData, "destinatario_teste");
  if (!destinatario || !destinatario.includes("@")) {
    redirectWithResult("error", "Informe um destinatário de teste válido.");
  }

  try {
    await sendSmtpEmail({
      to: destinatario,
      subject: "Teste SMTP - GKLI Cobrança",
      text: [
        "Teste de envio SMTP realizado pelo GKLI Cobrança.",
        "",
        `Data/hora: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
      ].join("\n"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    redirectWithResult("error", `Teste falhou: ${message}`);
  }

  revalidatePath(PAGE_PATH);
  redirectWithResult("tested", `E-mail de teste enviado para ${destinatario}.`);
}
