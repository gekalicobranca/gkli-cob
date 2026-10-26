import FlowAcordosPage from '@/components/flows/acordos/flow-acordos-page'
export const maxDuration = 300
export default function Page(props: Omit<Parameters<typeof FlowAcordosPage>[0], 'canal'>) {
  return <FlowAcordosPage {...props} canal="whatsapp" />
}
