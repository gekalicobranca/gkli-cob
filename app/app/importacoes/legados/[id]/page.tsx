import { redirect } from "next/navigation";

type ImportacaoLegadaRedirectPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ImportacaoLegadaRedirectPage({
  params,
}: ImportacaoLegadaRedirectPageProps) {
  const { id } = await params;
  redirect(`/app/importacoes/${id}`);
}
