import { requireSindicoUser } from "@/features/sindico/portal";

export const dynamic = "force-dynamic";

export default async function SindicoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSindicoUser();

  return children;
}
