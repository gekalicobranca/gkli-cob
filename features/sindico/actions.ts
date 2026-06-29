"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/utils/supabase/admin";
import { requireAdmin } from "@/utils/auth/require-admin";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function validateEmail(value: string) {
  return value.includes("@") && value.includes(".");
}

async function findAuthUserIdByEmail(email: string) {
  const admin = createAdminClient();
  let page = 1;

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Erro ao buscar usuario no Auth: ${error.message}`);

    const users = (data.users ?? []) as Array<{ id: string; email?: string | null }>;
    const match = users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match.id;
    if (users.length < 1000) break;
    page += 1;
  }

  return null;
}

export async function createSindicoAccess(formData: FormData) {
  await requireAdmin();

  const nome = clean(formData.get("nome"));
  const email = clean(formData.get("email")).toLowerCase();
  const password = String(formData.get("password") ?? "");
  const condominioId = clean(formData.get("condominio_id"));
  const telefone = clean(formData.get("telefone")) || null;
  const documento = clean(formData.get("documento")) || null;

  if (nome.length < 2) throw new Error("Nome do sindico obrigatorio.");
  if (!validateEmail(email)) throw new Error("E-mail invalido.");
  if (password.length < 6) throw new Error("A senha temporaria deve ter pelo menos 6 caracteres.");
  if (!condominioId) throw new Error("Selecione um condominio para vincular.");

  const admin = createAdminClient();

  const { data: condominio, error: condominioError } = await admin
    .from("condominios")
    .select("id, carteira_id")
    .eq("id", condominioId)
    .maybeSingle();

  if (condominioError) {
    throw new Error(`Erro ao validar condominio: ${condominioError.message}`);
  }

  if (!condominio) {
    throw new Error("Condominio nao encontrado.");
  }

  let userId: string | undefined;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      nome,
      role: "sindico",
    },
  });

  if (createError) {
    const alreadyExists =
      createError.message.toLowerCase().includes("already been registered") ||
      createError.message.toLowerCase().includes("already registered") ||
      createError.message.toLowerCase().includes("already exists") ||
      createError.status === 422;

    if (!alreadyExists) {
      throw new Error(`Erro ao criar sindico no Auth: ${createError.message}`);
    }

    userId = (await findAuthUserIdByEmail(email)) ?? undefined;
  } else {
    userId = created.user?.id;
  }

  if (!userId) {
    throw new Error("Nao foi possivel localizar o usuario do sindico no Auth.");
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: userId,
      email,
      nome,
      role: "sindico",
    },
    { onConflict: "id" },
  );

  if (profileError) {
    throw new Error(`Erro ao salvar perfil do sindico: ${profileError.message}`);
  }

  const { data: portalUser, error: portalUserError } = await admin
    .from("portal_sindico_usuarios")
    .upsert(
      {
        user_id: userId,
        nome,
        email,
        telefone,
        documento,
        status: "ativo",
      },
      { onConflict: "user_id" },
    )
    .select("id")
    .single();

  if (portalUserError) {
    throw new Error(`Erro ao salvar usuario do portal: ${portalUserError.message}`);
  }

  const { error: vinculoError } = await admin.from("portal_sindico_condominios").upsert(
    {
      portal_usuario_id: portalUser.id,
      condominio_id: condominioId,
      carteira_id: (condominio as any).carteira_id ?? null,
      perfil: "sindico",
      status: "ativo",
    },
    { onConflict: "portal_usuario_id,condominio_id" },
  );

  if (vinculoError) {
    throw new Error(`Erro ao vincular condominio ao sindico: ${vinculoError.message}`);
  }

  revalidatePath("/app/gestao/visao-sindico");
  revalidatePath("/app/gestao/visao-sindico/acessos");
  redirect("/app/gestao/visao-sindico/acessos?criado=1");
}
