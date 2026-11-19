import {avaliarSaudeWorker,type SaudeEasy} from '@/features/easy-cob/worker-health-model';
export function EasyWorkerHealth({saude,erro}:{saude?:SaudeEasy;erro?:boolean}){
  if(!saude)return <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm">{erro?'Saúde dos workers indisponível.':'Saúde dos workers ainda não consultada.'} Um pedido aceito não confirma processamento.</p>;
  const data=(s:string|null)=>s?new Date(s).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Sem registro';
  return <details className="rounded-xl border p-4 text-sm"><summary>Saúde da fila e dos workers</summary>
    <p className="my-2">Limite de sinal recente: {saude.limiarSegundos}s · {saude.origemLimiar} · Consulta {data(saude.consultadoEm)}</p>
    {saude.workers.map((w,i)=>{const estado=avaliarSaudeWorker(w,saude.limiarSegundos,Date.parse(saude.consultadoEm));return <div key={`${w.worker}:${i}`} className="border-t py-3"><p className="font-semibold">{w.origem} · {estado.texto}</p>
      <p>Último sinal: {data(w.ultimoSinal)} · {w.fila} pedido(s) na fila · Maior número de tentativas pendentes: {w.tentativas}</p><p>Pedido na fila mais antigo: {data(w.maisAntigo)} · Início/criação da execução mais antiga: {data(w.execucaoMaisAntiga)}</p>
      <p>Último sucesso: {data(w.ultimoSucesso)} · Última falha: {data(w.ultimaFalha)}</p></div>;})}
    <p>A ausência de sinal não comprova que o worker esteja desligado. Workers sob demanda podem não manter heartbeat entre rodadas.</p>
  </details>;
}
