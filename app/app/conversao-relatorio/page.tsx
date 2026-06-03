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
    <div className="space-y-5">
      <PageHeader
        eyebrow="Base Cadastral"
        title="Conversão de Cobranças"
        description="Converta relatórios de inadimplência para o XLSX oficial de Importações/Cobranças. Responsáveis e unidades continuam disponíveis, mas agora ficam como fluxo secundário."
        actions={
          <span className="inline-flex min-h-10 items-center rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 shadow-sm">
            Prioridade: Cobranças
          </span>
        }
      />

      <ConversionUploadCard condominios={condominioOptions} />

      <RecognizedTemplatesCard />

      <section className="rounded-[28px] border border-dashed border-slate-300 bg-white p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
              Fluxo operacional
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">
              Como a conversão de cobranças funciona
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-slate-500">
            O motor identifica o padrão ativo, confirma o condomínio cadastrado e entrega o arquivo pronto para o importador oficial.
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            [
              "1",
              "Subir inadimplência",
              "Envie PDF, XLS, XLSX, CSV ou HTML de cobranças. O modo Cobranças já vem selecionado por padrão.",
            ],
            [
              "2",
              "Confirmar condomínio",
              "O sistema tenta detectar o condomínio e aplica o CNPJ cadastrado quando houver match seguro.",
            ],
            [
              "3",
              "Baixar XLSX GKLI",
              "O resultado sai no modelo de Importações/Cobranças, com 1 cobrança por recibo/parcela conforme o parser.",
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
