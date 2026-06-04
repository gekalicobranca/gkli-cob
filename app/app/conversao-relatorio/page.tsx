import { PageHeader } from "@/components/ui/page-header";
import { ConversionUploadCard } from "@/features/conversao-relatorio/components/conversion-upload-card";
import { RecognizedTemplatesCard } from "@/features/conversao-relatorio/components/recognized-templates-card";
import { listCondominiosParaConversao } from "@/features/condominios/queries";
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras";

export default async function ConversaoRelatorioPage() {
  const scope = await getPermittedCarteiras();
  const condominios = await listCondominiosParaConversao(scope);
  const condominioOptions = condominios
    .filter((condominio) => condominio.cnpj)
    .map((condominio) => ({
      id: String(condominio.id),
      nome: String(condominio.nome ?? ""),
      nomeOperacional: String(condominio.nome_operacional ?? ""),
      cnpj: String(condominio.cnpj ?? ""),
    }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Base Cadastral"
        title="Motor de Conversão"
        description="Converta arquivos externos para o modelo oficial de Importações. O motor identifica o padrão ativo da administradora/sistema e separa isso do condomínio operacional."
        actions={
          <span className="inline-flex min-h-10 items-center rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 shadow-sm">
            Conversão por categoria
          </span>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <ConversionUploadCard condominios={condominioOptions} />
        <RecognizedTemplatesCard />
      </div>

      <section className="rounded-[28px] border border-dashed border-slate-300 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-950">
          Como a conversão funciona
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          {[
            [
              "1",
              "Tipo",
              "Escolha se o arquivo será convertido para Responsáveis ou Cobranças.",
            ],
            [
              "2",
              "Padrão",
              "O motor detecta o fornecedor/layout ativo, como Hflex / LiveFacilities.",
            ],
            [
              "3",
              "Condomínio",
              "Confirme o condomínio operacional usado no XLSX final.",
            ],
            [
              "4",
              "Saída GKLI",
              "Baixe o XLSX padrão e importe no módulo oficial correspondente.",
            ],
          ].map(([step, title, text]) => (
            <div key={step} className="rounded-2xl bg-slate-50 p-4">
              <div className="grid h-8 w-8 place-items-center rounded-xl bg-slate-900 text-xs font-bold text-white">
                {step}
              </div>
              <h3 className="mt-3 text-sm font-semibold text-slate-950">
                {title}
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
