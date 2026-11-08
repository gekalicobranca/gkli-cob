import NovoAcordoPage from "@/app/app/acordos/novo/page";

export default async function EasySimulationPage({
  searchParams,
}: {
  searchParams: Promise<{ cobrancaIds?: string | string[] }>;
}) {
  const query = await searchParams;
  return <NovoAcordoPage searchParams={Promise.resolve({ cobrancaIds: query.cobrancaIds, easy: "1" })} />;
}
