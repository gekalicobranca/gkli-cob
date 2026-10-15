import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp,writeFile,rename,rm,mkdir } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { observarArquivos } from './arquivos-sob-demanda.mjs'
import { argumentosWorker } from './workers-registry.mjs'

test('arquivo antigo não é reimportado; chegada, retomada e conclusão ficam persistidas',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'gkli-watch-')),folder=path.join(root,'Downloads'),manifest=path.join(root,'estado.json')
 await mkdir(folder);await writeFile(path.join(folder,'SAFIRA_2026-10-15.xls'),'arquivo anterior')
 let queue=await observarArquivos(folder,manifest)
 try{
 assert.deepEqual(await queue.pending(),[])
 await writeFile(path.join(folder,'NOVO_2026-10-15.xlsx'),'arquivo novo')
 await writeFile(path.join(folder,'outro.txt'),'ignorado')
 assert.deepEqual(await queue.pending(),['NOVO_2026-10-15.xlsx'])
 queue.close();queue=await observarArquivos(folder,manifest)
 assert.deepEqual(await queue.pending(),['NOVO_2026-10-15.xlsx'])
 await assert.rejects(queue.complete('NOVO_2026-10-15.xlsx'),/ainda na entrada/)
 await rename(path.join(folder,'NOVO_2026-10-15.xlsx'),path.join(folder,'processado.xlsx'))
 await Promise.all([queue.pending(),queue.complete('NOVO_2026-10-15.xlsx')])
 assert.deepEqual(await queue.pending(),[])
 assert.deepEqual(argumentosWorker('pdf:hflex'),['--env-file=.env.local','scripts/acordos-portais/fila.mjs','hflex'])
 assert.throws(()=>argumentosWorker('importacao:arquivos','../secreto.xls'))
 assert.throws(()=>argumentosWorker('desconhecido'))
 }finally{queue.close();await rm(root,{recursive:true,force:true})}
})
