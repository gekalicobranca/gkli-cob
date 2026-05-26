import { PageHeader } from "@/components/ui/page-header"
import { ConversionUploadCard } from "@/features/conversao-relatorio/components/conversion-upload-card"
import { RecognizedTemplatesCard } from "@/features/conversao-relatorio/components/recognized-templates-card"
import { listCondominios } from "@/features/condominios/queries"
import { getPermittedCarteiras } from "@/utils/auth/get-permitted-carteiras"

export default async function ConversaoRelatorioPage() {
  const scope = await getPermittedCarteiras()
  const condominios = await listCondominios(scope, { status: "ativo" })
  const condominioOptions = condominios
    .filter((condominio) => condominio.cnpj)
    .map((condominio) => ({
      id: String(condominio.id),
      nome: String(condominio.nome ?? ""),
      cnpj: String(condominio.cnpj ?? ""),
    }))
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Base Cadastral"
        title="Conversão de Relatório"
        description="Transforme relatórios de inadimplência das administradoras em cobranças estruturadas. No Condopro/BBZ, o Lab gera uma cobrança por recibo, com unidade, bloco, vencimento e composição financeira."
        actions={
          <span className="inline-flex min-h-10 items-center rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white/90 shadow-sm">
            V1 · Conectcon · Condopro/BBZ
          </span>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <ConversionUploadCard condominios={condominioOptions} />
        <RecognizedTemplatesCard />
      </div>

      <section className="rounded-[28px] border border-dashed border-slate-300 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-950">Como a conversão funciona</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          {[
            ["1", "Upload", "Envie XLS, CSV ou PDF exportado pela administradora."],
            ["2", "Detecção", "O sistema identifica a origem e aplica o parser correto."],
            ["3", "Preview", "Você confere cobranças, parcelas, inconsistências e totais."],
            ["4", "Saída GKLI", "Baixe o XLSX padrão e use a importação oficial de cobranças."],
          ].map(([step, title, text]) => (
            <div key={step} className="rounded-2xl bg-slate-50 p-4">
              <div className="grid h-8 w-8 place-items-center rounded-xl bg-slate-900 text-xs font-bold text-white">
                {step}
              </div>
              <h3 className="mt-3 text-sm font-semibold text-slate-950">{title}</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
