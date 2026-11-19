import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{id:string}> }) {
  const { id } = await params;
  if (!/^[\da-f-]{36}$/i.test(id)) return new NextResponse("Documento inválido.", {status:400});
  const db = await createClient();
  const { data, error } = await db.rpc("acordo_baixar_documento", {p_id:id}).maybeSingle();
  if (error || !data) return new NextResponse("Documento não encontrado.", {status:404});
  const doc = data as {nome:string;tipo:string;base64:string};
  const nome = doc.nome.replace(/[^a-zA-Z0-9._-]/g,"_");
  return new NextResponse(new Uint8Array(Buffer.from(doc.base64,"base64")), {headers:{
    "Content-Type":doc.tipo, "Content-Disposition":`attachment; filename="${nome}"`,
    "Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff",
  }});
}
