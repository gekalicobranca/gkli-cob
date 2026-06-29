import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/utils/supabase/server";

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
    return redirectWithError(request, "E-mail ou senha invalidos.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError || profile?.role !== "sindico") {
    await supabase.auth.signOut();
    return redirectWithError(request, "Este acesso e exclusivo para sindicos.");
  }

  return NextResponse.redirect(new URL("/sindico", request.url), { status: 303 });
}
