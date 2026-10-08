import { AtendimentosAgentePage } from '@/components/agentes-virtuais/atendimentos-page'
type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> }
export default async function Page(props: Props) { return <AtendimentosAgentePage {...props} agenteId="keila" /> }
