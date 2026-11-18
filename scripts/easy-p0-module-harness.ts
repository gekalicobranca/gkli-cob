import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import ts from 'typescript';

/** Executa as fronteiras reais com dependências explícitas; não carrega env ou clientes remotos. */
export function moduloIsolado(file:string,mocks:Record<string,unknown>,globals:Record<string,unknown>={}) {
  const mod={exports:{} as Record<string,any>};
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const forbidden=(name:string)=>new Proxy({}, {get:(_target,key)=>{
    if(key==='__esModule')return false;
    return ()=>{throw Error(`Dependência não permitida no teste isolado: ${name}.${String(key)}`);};
  }});
  new Script(code,{filename:file}).runInNewContext({module:mod,exports:mod.exports,
    require:(name:string)=>name in mocks?mocks[name]:forbidden(name),
    FormData,Date,Intl,URL,URLSearchParams,Error,console:{error:()=>{},warn:()=>{}},process:{env:{}},...globals});
  return mod.exports;
}
