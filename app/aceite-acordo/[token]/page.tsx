import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { createAdminClient } from "@/utils/supabase/admin";
import { registrarAceitePublicoTermo } from "@/features/acordos/actions";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ aceito?: string }>;
};

async function getTermo(token: string, tipo: "devedor" | "sindico") {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("acordos_termos")
    .select("*, acordos:acordo_id (id, fluxo_status, condominios:condominio_id (nome), unidades:unidade_id (identificacao, bloco, responsavel_nome))")
    .eq("token", token)
    .eq("tipo_aceite", tipo)
    .maybeSingle();

  if (error) throw new Error(`Erro ao carregar termo: ${error.message}`);
  return data as any;
}

async function getTipoTermo(token: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("acordos_termos")
    .select("tipo_aceite")
    .eq("token", token)
    .maybeSingle();

  return (data as any)?.tipo_aceite as string | null;
}

export default async function AceiteAcordoPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = await searchParams;
  const termo = await getTermo(token, "devedor");
  const aceito = query.aceito === "1" || termo?.status === "aceito";

  if (!termo) {
    const tipoTermo = await getTipoTermo(token);
    if (tipoTermo === "sindico") redirect(`/aceite-sindico/${token}`);
    return <PublicShell title="Link inválido" description="Não encontramos este termo de acordo." />;
  }

  if (!["pendente", "visualizado", "aceito"].includes(String(termo.status ?? ""))) {
    return <PublicShell title="Termo indisponivel" description="Este termo foi encerrado e nao permite novo aceite." />;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--gkli-primary)]">GKLI Cobrança</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Termo de acordo</h1>
          <p className="mt-2 text-sm text-slate-600">Conferência e aceite digital do acordo firmado.</p>
        </div>

        <Card className="space-y-5">
          {aceito ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
              <p className="font-semibold">Aceite registrado com sucesso.</p>
              <p className="mt-1 text-sm">O sistema já gerou o retorno operacional para solicitação dos boletos à administradora.</p>
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-950">{termo.titulo}</p>
            <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-6 text-slate-700">{termo.corpo}</pre>
          </div>

          {!aceito ? (
            <form action={registrarAceitePublicoTermo} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="tipo_aceite" value="devedor" />
              <FormField label="Nome completo de quem aceita">
                <Input name="nome" required defaultValue={termo.destinatario_nome ?? ""} />
              </FormField>
              <FormField label="CPF/CNPJ ou documento">
                <Input name="documento" placeholder="Opcional, mas recomendado" />
              </FormField>
              <label className="flex gap-3 rounded-xl bg-white p-3 text-sm text-slate-700">
                <input type="checkbox" required className="mt-1" />
                <span>Declaro que li, reconheço o débito e concordo com as condições do acordo acima.</span>
              </label>
              <Button type="submit" className="w-full">Aceitar termo digitalmente</Button>
            </form>
          ) : null}
        </Card>
      </div>
    </main>
  );
}

function PublicShell({ title, description }: { title: string; description: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="max-w-lg text-center">
        <h1 className="text-2xl font-semibold text-slate-950">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">{description}</p>
      </Card>
    </main>
  );
}
