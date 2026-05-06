import { ConversionUploadCard } from "@/features/conversao-relatorio/components/conversion-upload-card"
import { RecognizedTemplatesCard } from "@/features/conversao-relatorio/components/recognized-templates-card"

export default function ConversaoRelatorioPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-400">
              Base Cadastral
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              Conversão de Relatório
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Transforme relatórios de inadimplência das administradoras em cobranças estruturadas,
              com uma cobrança consolidada por unidade e parcelas vinculadas por vencimento.
            </p>
          </div>

          <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
            V1: Conectcon · XLS/HTML · Preview assistido
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <ConversionUploadCard />
        <RecognizedTemplatesCard />
      </div>

      <section className="rounded-[28px] border border-dashed border-slate-300 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-950">Como a conversão funciona</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          {[
            ["1", "Upload", "Envie XLS, CSV ou PDF exportado pela administradora."],
            ["2", "Detecção", "O sistema identifica a origem e aplica o parser correto."],
            ["3", "Preview", "Você confere cobranças, parcelas, inconsistências e totais."],
            ["4", "Conversão", "Após validação, o sistema cria cobranças e parcelas."],
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
