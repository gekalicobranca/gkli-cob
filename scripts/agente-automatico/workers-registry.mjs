export const PDF_WORKERS = {
 'pdf:manager': ['scripts/manager-acordos/fila.mjs'],
 'pdf:lello': ['scripts/acordos-portais/fila.mjs','lello'],
 'pdf:bbz': ['scripts/acordos-portais/fila.mjs','bbz'],
 'pdf:atipass': ['scripts/acordos-portais/fila.mjs','atipass'],
 'pdf:hflex': ['scripts/acordos-portais/fila.mjs','hflex'],
}
export function argumentosWorker(key, arquivo) {
 if(Object.hasOwn(PDF_WORKERS,key))return ['--env-file=.env.local',...PDF_WORKERS[key]]
 if(key==='whatsapp:cloud')return ['--env-file=.env.local','scripts/whatsapp-cloud/worker.mjs']
 if(key==='importacao:arquivos'){
  if(!arquivo || arquivo.includes('/') || arquivo.includes('\\'))throw Error('Arquivo de captação inválido.')
  return ['--env-file=.env.local','node_modules/tsx/dist/cli.mjs','scripts/captacao-automatizada/worker.ts']
 }
 throw Error('Worker não autorizado.')
}
