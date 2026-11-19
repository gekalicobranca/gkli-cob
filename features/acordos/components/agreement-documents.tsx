import { createClient } from "@/utils/supabase/server";
import { AgreementDocumentUpload } from "./agreement-document-upload";

export async function AgreementDocuments({ id }: { id: string }) {
  const db = await createClient();
  const { data, error } = await db.from("acordo_documentos").select("id,nome,criado_em").eq("acordo_id", id).order("criado_em", { ascending: false });
  return <details className="rounded-lg border border-slate-200 p-3">
    <summary className="cursor-pointer text-sm font-semibold">Documentos do acordo</summary>
    <div className="mt-3 space-y-3">
      <AgreementDocumentUpload id={id} />
      {error ? <p className="text-sm text-red-700">Não foi possível carregar os documentos.</p> : data?.length ?
        <ul className="space-y-2 text-sm">{data.map(d => <li key={d.id}>
          <a className="text-cyan-800 underline" href={`/api/acordos/documentos/${d.id}`}>Baixar {d.nome}</a>
          <span className="ml-2 text-xs text-slate-500">{new Intl.DateTimeFormat("pt-BR", {timeZone:"America/Sao_Paulo",dateStyle:"short"}).format(new Date(d.criado_em))}</span>
        </li>)}</ul> : <p className="text-sm text-slate-500">Nenhum documento anexado.</p>}
    </div>
  </details>;
}
