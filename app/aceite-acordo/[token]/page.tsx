import { Card } from "@/components/ui/card";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function AceiteAcordoPage({ params }: PageProps) {
  await params;

  return (
    <PublicShell
      title="Aceite digital indisponível"
      description="A formalização de acordo não usa mais link público. O acordo será considerado firmado após a identificação do pagamento da entrada ou da primeira parcela."
    />
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
