// Reserva tempo para não iniciar outra unidade perto do fechamento obrigatório.
export function orcamentoLote({agora=Date.now,duracaoMs=240000,margemMs=45000}={}){
 const fim=agora()+duracaoMs
 return {podeIniciarUnidade:()=>agora()+margemMs<fim}
}
