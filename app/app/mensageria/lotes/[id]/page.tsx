import { redirect } from 'next/navigation'

type Props = {
  params: Promise<{ id: string }>
}

export default async function MensageriaLoteDetalheAliasPage({ params }: Props) {
  const { id } = await params
  redirect(`/app/lotes/${id}`)
}
