import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {moduloIsolado} from './easy-p0-module-harness';
import {fixtureCancelamento} from './easy-p1-cancelamento-fixture';
import {fixtureId as id} from './easy-p0-fixture';
import {canonical} from '../features/easy-cob/captacao-assinatura';

test('serviço real recupera resposta perdida e não envia arquivo para Storage; action não devolve anexo em falha',async()=>{
  const {db}=await fixtureCancelamento();try{
    let perder=true,chamadas=0;
    const scope={perfil:'operador',userId:id(10),carteiraIds:[id(1)]};
    const client={rpc:async(name:string,args:Record<string,unknown>)=>{
      chamadas++;const keys=Object.keys(args);assert.ok(['acordo_cancelar_formalizacao_atomico','acordo_cancelamento_resultado'].includes(name));
      try{const result=(await db.query<any>(`select ${name}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')}) r`,Object.values(args))).rows[0].r;
        if(perder&&name==='acordo_cancelar_formalizacao_atomico'){perder=false;return {data:null,error:{code:'resposta_perdida'}};}
        return {data:result,error:null};
      }catch{return {data:null,error:{code:'P0001'}};}
    }};
    const server=moduloIsolado('features/acordos/cancelamento-server.ts',{
      'server-only':{},'node:crypto':{createHash},
      '@/utils/supabase/admin':{createAdminClient:()=>client},
      '@/utils/auth/get-permitted-carteiras':{getPermittedCarteiras:async()=>scope},
      '@/features/easy-cob/captacao-assinatura':{canonical},
    },{Buffer,File});
    const actions=moduloIsolado('app/app/configuracoes/easy/acordos/actions.ts',{
      '@/features/acordos/cancelamento-server':server,'next/cache':{revalidatePath:()=>{throw Error('Cache sintético');}},
    });
    const form=new FormData();form.set('acordo_id',id(40));form.set('operacao_id',id(70));form.set('motivo','Motivo sintético');form.set('confirmacao','on');form.set('debito_atualizado',new File(['%PDF-sintetico'],'debito.pdf'));
    const first=await actions.cancelEasyAgreement({error:'',success:false},form);assert.equal(first.success,false);assert.equal(first.attachmentUrl,undefined);
    const receipt=await actions.consultarCancelamentoEasy(id(40),id(70));assert.equal(receipt.confirmado,true);assert.match(receipt.attachmentUrl,/^\/api\/acordos\/documentos\//);
    const replay=await actions.cancelEasyAgreement({error:'',success:false},form);assert.equal(replay.success,true);
    assert.equal((await db.query('select * from acordo_documentos')).rows.length,1);
    scope.perfil='leitura';const antes=chamadas;assert.equal((await actions.cancelEasyAgreement({error:'',success:false},form)).success,false);assert.equal(chamadas,antes);
  }finally{await db.close();}
});

test('tela bloqueia repetição após interrupção e só mostra documento confirmado por consulta',async()=>{
  const hooks:any[]=[];let cursor=0,envios=0;
  const jsx=(type:any,props:any)=>({type,props});
  class FormFixture extends FormData{constructor(form?:FormData){super();if(form)for(const [k,v] of form.entries())this.append(k,v);}}
  const component=moduloIsolado('app/app/configuracoes/easy/acordos/cancellation.tsx',{
    react:{useState:(initial:any)=>{const n=cursor++;if(!(n in hooks))hooks[n]=initial;return [hooks[n],(v:any)=>{hooks[n]=typeof v==='function'?v(hooks[n]):v;}];},useRef:(initial:any)=>{const n=cursor++;return hooks[n]??(hooks[n]={current:initial});}},
    'react/jsx-runtime':{jsx,jsxs:jsx},'./actions':{
      cancelEasyAgreement:async()=>{envios++;throw Error('Resposta perdida');},
      consultarCancelamentoEasy:async()=>({confirmado:true,attachmentUrl:`/api/acordos/documentos/${id(80)}`}),
    },'lucide-react':{},'@/components/easy/easy.module.css':{default:{}},
  },{FormData:FormFixture});
  const render=()=>{cursor=0;return component.EasyCancellation({id:id(40),operacaoId:id(70)});};
  const all=(n:any):any[]=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(all)];
  const find=(tree:any,test:(n:any)=>boolean)=>{const node=all(tree).find(test);assert.ok(node);return node;};
  let tree=render();find(tree,n=>n.type==='textarea').props.onChange({target:{value:'Motivo sintético'}});tree=render();
  const form=new FormFixture();Object.assign(form,{reportValidity:()=>true});
  const submit=()=>({preventDefault:()=>{},currentTarget:form});
  await find(tree,n=>n.type==='form').props.onSubmit(submit());tree=render();
  await find(tree,n=>n.type==='form').props.onSubmit(submit());tree=render();
  assert.equal(find(tree,n=>n.type==='button'&&n.props.children==='Confirmar cancelamento').props.disabled,true);
  assert.equal(all(tree).filter(n=>n.type==='a').length,0);
  await find(tree,n=>n.type==='form').props.onSubmit(submit());assert.equal(envios,1);
  await find(tree,n=>n.type==='button'&&n.props.children==='Consultar resultado do cancelamento').props.onClick();tree=render();
  assert.equal(find(tree,n=>n.type==='a').props.href,`/api/acordos/documentos/${id(80)}`);
});
