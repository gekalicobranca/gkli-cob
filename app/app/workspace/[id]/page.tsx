import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function LegacyWorkspacePage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams ? await searchParams : {})) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      query.append(key, item)
    }
  }
  const suffix = query.toString()
  redirect(`/app/cobrancas/${encodeURIComponent(id)}${suffix ? `?${suffix}` : ''}`)
}
