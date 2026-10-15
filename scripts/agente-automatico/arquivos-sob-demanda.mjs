import { watch } from 'node:fs'
import { readFile, writeFile, rename, readdir, stat, mkdir } from 'node:fs/promises'
import path from 'node:path'

export const arquivoCaptacaoElegivel = nome => /^[A-Z0-9_]+_\d{4}-\d{2}-\d{2}\.xlsx?$/i.test(nome)
export async function observarArquivos(pasta, manifest, notify = () => {}) {
  await mkdir(pasta,{recursive:true}); await mkdir(path.dirname(manifest),{recursive:true})
  let state, timer, serial=Promise.resolve()
  const exclusive = fn => {const next=serial.then(fn);serial=next.catch(()=>{});return next}
  const snapshot = async () => {
    const files = {}
    for (const item of await readdir(pasta,{withFileTypes:true})) if(item.isFile() && arquivoCaptacaoElegivel(item.name)) {
      try { const s=await stat(path.join(pasta,item.name));files[item.name]=`${s.size}:${s.mtimeMs}` } catch(error){if(error.code!=='ENOENT')throw error}
    }
    return files
  }
  const save = async () => {await writeFile(manifest+'.tmp',JSON.stringify(state));await rename(manifest+'.tmp',manifest)}
  try {state=JSON.parse(await readFile(manifest,'utf8'));if(!state.known||!state.pending)throw Error('Manifesto de arquivos inválido.')}
  catch(error){if(error.code!=='ENOENT')throw error;state={known:await snapshot(),pending:{}};await save()}
  const watcher=watch(pasta,(_event,nome)=>{
    if(nome&&!arquivoCaptacaoElegivel(String(nome)))return
    clearTimeout(timer);timer=setTimeout(notify,2000);timer.unref()
  })
  watcher.on('error',error=>{console.error('Observador de arquivos:',error.message);notify()})
  return {
    pending() { return exclusive(async()=>{
      const previous=JSON.stringify(state)
      const files=await snapshot()
      for(const [nome,fingerprint] of Object.entries(files))if(state.known[nome]!==fingerprint)state.pending[nome]={fingerprint}
      for(const nome of Object.keys(state.pending))if(!files[nome])delete state.pending[nome]
      if(previous!==JSON.stringify(state))await save()
      return Object.keys(state.pending).sort()
    }) },
    complete(nome) { return exclusive(async()=>{
      const exists=await stat(path.join(pasta,nome)).then(()=>true).catch(error=>{if(error.code==='ENOENT')return false;throw error})
      if(exists)throw Error('Arquivo ainda na entrada; aguarda estabilidade ou liberação da captação.')
      delete state.pending[nome];delete state.known[nome];await save()
    }) },
    close(){clearTimeout(timer);watcher.close()},
  }
}
