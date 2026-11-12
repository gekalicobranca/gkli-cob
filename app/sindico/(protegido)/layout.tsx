import { AvisoJanelaAcesso } from "@/components/auth/aviso-janela-acesso";
import { precisaAcompanharJanela } from "@/utils/auth/janela-acesso";
import { requireSindicoUser } from "@/features/sindico/portal";

export const dynamic = "force-dynamic";

export default async function SindicoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSindicoUser();

  return (
    <>
      {precisaAcompanharJanela(user.id) && <AvisoJanelaAcesso />}
      {children}
    </>
  );
}
