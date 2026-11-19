export type SaudeWorker={origem:string;worker:string;ultimoSinal:string|null;fila:number;maisAntigo:string|null;execucaoMaisAntiga:string|null;tentativas:number;ultimoSucesso:string|null;ultimaFalha:string|null};
export type SaudeEasy={consultadoEm:string;limiarSegundos:number;origemLimiar:string;workers:SaudeWorker[]};
export function avaliarSaudeWorker(worker:SaudeWorker,limiar:number,agora=Date.now()){
  const sinal=worker.ultimoSinal?Date.parse(worker.ultimoSinal):NaN;
  const idade=Number.isFinite(sinal)?Math.max(0,Math.floor((agora-sinal)/1000)):null;
  const recente=idade!==null&&idade<=limiar;
  return {idadeSegundos:idade,recente,texto:recente?'Sinal recente do worker':worker.fila>0?'Fila aguardando worker sem sinal recente':'Sem sinal recente; execução pode ocorrer sob demanda'};
}
