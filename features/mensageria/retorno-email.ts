/** Somente o diagnóstico do destinatário atual; nunca o corpo original citado no NDR. */
export function classificarRetornoEmail(diagnostico: string) {
 const texto=diagnostico.toLowerCase()
 if (/4\.2\.2|5\.2\.2|over.?quota|out of storage|mailbox full|caixa.*cheia/.test(texto)) return 'temporaria' as const
 if (/5\.1\.1\b|5\.1\.10\b|recipient.*not found|wasn.t found at|user unknown|no such user|does not exist|unknown to address/.test(texto)) return 'inexistente' as const
 if (/\b4\.\d\.\d\b|timed? out|connection|temporar|try again/.test(texto)) return 'temporaria' as const
 return 'revisao' as const
}
