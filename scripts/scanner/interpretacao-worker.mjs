// Endpoint próprio; o executor não precisa ter credenciais do provedor de IA.
export async function analisarPendentes({fetchImpl=fetch,token=process.env.SCANNER_INTERPRETACAO_TOKEN}={}){
 if(!token)return {status:'nao_configurada',analisadas:0}
 const response=await fetchImpl('https://gkli-cob.vercel.app/api/jobs/scanner/interpretar',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(28000)})
 if(!response.ok){
  const codigo=response.status===404?'SCANNER_IA_ROTA_AUSENTE':[401,403].includes(response.status)?'SCANNER_IA_AUTENTICACAO':response.status===503?'SCANNER_IA_SERVICO_INDISPONIVEL':'SCANNER_IA_HTTP'
  throw Object.assign(Error(`Análise assistida indisponível (HTTP ${response.status??'desconhecido'}); coleta e conciliação seguem independentes.`),{code:codigo,http:response.status})
 }
 try{return await response.json()}catch{throw Object.assign(Error('Resposta inválida do serviço de análise assistida.'),{code:'SCANNER_IA_RESPOSTA_INVALIDA'})}
}
