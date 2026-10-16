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
      createError.message.toLowerCase().includes("already exists");

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

  // Never turn an existing internal user into a portal-only user.
  const { data: existingProfile, error: existingProfileError } = await admin
    .from("profiles").select("role").eq("id", userId).maybeSingle();
  if (existingProfileError) throw new Error(`Erro ao verificar perfil: ${existingProfileError.message}`);
  if (!created?.user && existingProfile && existingProfile.role !== "sindico") {
    throw new Error("Este e-mail pertence a um acesso interno. Use outro e-mail para o síndico.");
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

  const { data: existingPortal, error: existingPortalError } = await admin
    .from("portal_sindico_usuarios").select("id,user_id")
    .eq("email", email).maybeSingle();
  if (existingPortalError) throw new Error(`Erro ao verificar acesso: ${existingPortalError.message}`);
  if (existingPortal?.user_id && existingPortal.user_id !== userId) {
    throw new Error("Este acesso já está vinculado a outro usuário.");
  }
  const portalPayload = { user_id: userId, nome, email, telefone, documento };
  // The legacy hash is required on INSERT only. Authentication uses Supabase
  // Auth; this marker cannot authenticate and never replaces an existing hash.
  const portalUserResult = existingPortal
    ? await admin.from("portal_sindico_usuarios").update(portalPayload)
        .eq("id", existingPortal.id).select("id").single()
    : await admin.from("portal_sindico_usuarios").insert({
        ...portalPayload, senha_hash: "!SUPABASE_AUTH_ONLY!", status: "ativo", ativo: true,
      }).select("id").single();

  const { data: portalUser, error: portalUserError } = portalUserResult;

  if (portalUserError) {
    throw new Error(`Erro ao salvar usuario do portal: ${portalUserError.message}`);
  }

  const { data: existingLink, error: existingLinkError } = await admin
    .from("portal_sindico_condominios").select("id")
    .eq("condominio_id", condominioId)
    .or(`portal_usuario_id.eq.${portalUser.id},usuario_id.eq.${portalUser.id}`)
    .maybeSingle();
  if (existingLinkError) throw new Error(`Erro ao verificar vínculo: ${existingLinkError.message}`);
  const linkPayload = {
    usuario_id: portalUser.id,
    portal_usuario_id: portalUser.id,
    condominio_id: condominioId,
    carteira_id: condominio.carteira_id ?? null,
  };
  // Keep legacy and current IDs aligned without reactivating existing access.
  const vinculoResult = existingLink
    ? await admin.from("portal_sindico_condominios").update(linkPayload).eq("id", existingLink.id)
    : await admin.from("portal_sindico_condominios").insert({
        ...linkPayload, perfil: "sindico", papel: "sindico", status: "ativo", ativo: true,
      });

  const { error: vinculoError } = vinculoResult;

  if (vinculoError) {
    throw new Error(`Erro ao vincular condominio ao sindico: ${vinculoError.message}`);
  }

  revalidatePath("/app/gestao/visao-sindico");
  revalidatePath("/app/configuracoes/acessos-sindicos");
  redirect("/app/configuracoes/acessos-sindicos?criado=1");
}
