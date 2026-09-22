import { FlowCobrancaPage, type FlowCobrancaParams } from '@/components/flows/cobranca/flow-cobranca-page'

export const maxDuration = 300

export default function EmailFlowsPage({ searchParams }: { searchParams: FlowCobrancaParams }) {
  return <FlowCobrancaPage canal="email" searchParams={searchParams} />
}
