import { KeyRound, PlusCircle } from "lucide-react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { createSindicoAccess } from "@/features/sindico/actions";
import { requireAdmin } from "@/utils/auth/require-admin";
import { createAdminClient } from "@/utils/supabase/admin";

async function listCondominiosForAccess() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("condominios")
    .select("id, nome, administradora, status")
    .order("nome", { ascending: true });

  if (error) throw new Error(`Erro ao carregar condominios: ${error.message}`);
  return (data ?? []) as any[];
}

async function listSindicoAccesses() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("portal_sindico_usuarios")
    .select("id, nome, email, telefone, portal_sindico_condominios (id, condominios:condominio_id (nome))")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throw new Error(`Erro ao carregar acessos do sindico: ${error.message}`);
  return (data ?? []) as any[];
}

export default async function SindicoAccessPage({
  searchParams,
}: {
  searchParams?: Promise<{ criado?: string }>;
}) {
  await requireAdmin();

  const params = searchParams ? await searchParams : undefined;
  const [condominios, acessos] = await Promise.all([
    listCondominiosForAccess(),
    listSindicoAccesses(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Configurações"
        title="Acessos dos síndicos"
        description="Crie o login do síndico e vincule o acesso aos condomínios liberados para consulta."
        actions={
          <ButtonLink href="/sindico/login" target="_blank" variant="secondary">
            <KeyRound className="h-4 w-4" />
            Login do sindico
          </ButtonLink>
        }
      />

      {params?.criado === "1" ? (
        <Card className="border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
          Acesso do sindico criado ou atualizado com sucesso.
        </Card>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[minmax(360px,.85fr)_minmax(0,1.15fr)]">
        <Card className="p-5">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#e8f6fb] text-[#04799a]">
              <PlusCircle className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-950">Novo acesso</h2>
              <p className="mt-1 text-sm text-slate-500">Senha temporaria com e-mail confirmado.</p>
            </div>
          </div>

          <form action={createSindicoAccess} className="space-y-4">
            <FormField label="Nome do sindico">
              <Input name="nome" required placeholder="Nome completo" />
            </FormField>
            <FormField label="E-mail">
              <Input name="email" type="email" required placeholder="sindico@email.com" />
            </FormField>
            <FormField label="Senha temporaria">
              <Input name="password" type="password" required minLength={6} placeholder="Minimo 6 caracteres" />
            </FormField>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField label="Telefone">
                <Input name="telefone" placeholder="Opcional" />
              </FormField>
              <FormField label="Documento">
                <Input name="documento" placeholder="Opcional" />
              </FormField>
            </div>
            <FormField label="Condominio liberado">
              <Select name="condominio_id" required defaultValue="">
                <option value="">Selecione</option>
                {condominios.map((condominio) => (
                  <option key={condominio.id} value={condominio.id}>
                    {condominio.nome} {condominio.status ? `- ${condominio.status}` : ""}
                  </option>
                ))}
              </Select>
            </FormField>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
              O sindico entra pelo portal separado em /sindico/login e nao acessa o menu interno do GKLI Cob.
            </div>

            <div className="flex justify-end">
              <Button type="submit">Criar acesso</Button>
            </div>
          </form>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-950">Acessos recentes</h2>
            <p className="mt-1 text-sm text-slate-500">Ultimos usuarios cadastrados no portal do sindico.</p>
          </div>

          {acessos.length ? (
            <div className="divide-y divide-slate-100">
              {acessos.map((acesso) => {
                const vinculos = acesso.portal_sindico_condominios ?? [];
                return (
                  <div key={acesso.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(220px,1fr)_1fr_100px] lg:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">{acesso.nome}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{acesso.email}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Condominios</p>
                      <p className="mt-1 truncate text-sm text-slate-700">
                        {vinculos.length
                          ? vinculos.map((item: any) => item.condominios?.nome ?? "Condominio").join(", ")
                          : "Sem vinculo"}
                      </p>
                    </div>
                    <div>
                      <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        {acesso.status ?? "ativo"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-10 text-center text-sm text-slate-500">
              Nenhum acesso de sindico cadastrado ainda.
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
