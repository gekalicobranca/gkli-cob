import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/utils/supabase/server";
import { acessoTemporariamenteBloqueado, CAMINHO_AVISO_ACESSO } from "@/utils/auth/janela-acesso";
import { loadTrustedProfile, ProfileAuthorizationError } from "@/utils/auth/trusted-profile";

function redirectWithError(request: NextRequest, message: string) {
  const url = new URL("/sindico/login", request.url);
  url.searchParams.set("erro", message);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return redirectWithError(request, "Informe e-mail e senha para entrar.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    if (acessoTemporariamenteBloqueado()) {
      return NextResponse.redirect(new URL(CAMINHO_AVISO_ACESSO, request.url), { status: 303 });
    }
    return redirectWithError(request, "E-mail ou senha invalidos.");
  }

  try {
    const profile = await loadTrustedProfile(supabase, data.user.id);
    if (profile.role !== "sindico") throw new ProfileAuthorizationError(403, "portal_role_denied");
  } catch (error) {
    if (!(error instanceof ProfileAuthorizationError)) throw error;
    if (error.code === "janela_acesso") {
      await supabase.auth.signOut({ scope: "local" });
      return NextResponse.redirect(new URL(CAMINHO_AVISO_ACESSO, request.url), { status: 303 });
    }
    await supabase.auth.signOut();
    return redirectWithError(request, "Este acesso e exclusivo para sindicos.");
  }

  return NextResponse.redirect(new URL("/sindico", request.url), { status: 303 });
}
