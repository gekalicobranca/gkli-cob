import assert from 'node:assert/strict';
import {test} from 'node:test';
import {moduloIsolado} from './easy-p0-module-harness';
import {fixtureId as id} from './easy-p0-fixture';

test('Maestro confere efeitos antes de solicitar e envia a versão/ativação exibidas',async()=>{
  let efeito: () => void = () => {};
  let falharConsulta = true;
  const hooks:any[]=[];let cursor=0,previas=0;const pedidos:any[][]=[];
  const receita={id:id(8),administradora:'sintetica',administradoraNome:'Sintética',condominioId:id(2),condominio:'Condomínio sintético',nome:'Receita',estado:'disponivel',liberada:true,easy:false};
  const inicial={ativo:true,receitas:[receita]};const jsx=(type:any,props:any)=>({type,props});
  const model=moduloIsolado('app/app/configuracoes/easy/maestro/painel.tsx',{
    react:{useState:(initial:any)=>{const n=cursor++;if(!(n in hooks))hooks[n]=initial;return [hooks[n],(v:any)=>{hooks[n]=typeof v==='function'?v(hooks[n]):v;}];},useRef:(initial:any)=>{const n=cursor++;return hooks[n]??(hooks[n]={current:initial});},useEffect:(fn:()=>void)=>{efeito=fn;},useTransition:()=>[false,()=>{}]},
    'react/jsx-runtime':{jsx,jsxs:jsx},'next/link':{default:'Link'},'next/navigation':{useRouter:()=>({})},'lucide-react':{},'@/components/easy/easy.module.css':{default:{}},
    '@/features/acordos/formatar-vencimento':{formatarVencimentoAcordo:(v:any)=>v},'@/components/easy/worker-health':{EasyWorkerHealth:'Health'},
    './actions':{prepararEasyMaestro:async()=>{previas++;return {efeitos:{versao:'a'.repeat(32),ativacaoAutomatica:true,montarFlow:true,condominios:1}};},captarEasyMaestro:async(...args:any[])=>{pedidos.push(args);return {criadas:1};},consultarEasyMaestro:async(adm:string)=>{assert.equal(adm,'sintetica');if(falharConsulta)throw Error('timeout');return inicial;}},
  },{crypto});
  const render=()=>{cursor=0;return model.EasyMaestro({administradoras:[['sintetica','Sintética']],podeCaptar:true});};
  const all=(n:any):any[]=>!n||typeof n!=='object'?[]:[n,...[n.props?.children].flat(Infinity).flatMap(all)];
  const text=(n:any):string=>typeof n==='string'?n:n&&typeof n==='object'?[n.props?.children].flat(Infinity).map(text).join(''):'';
  const find=(tree:any,fn:(n:any)=>boolean)=>{const node=all(tree).find(fn);assert.ok(node);return node;};
  let tree=render();find(tree,n=>n.type==='select').props.onChange({target:{value:'sintetica'}});tree=render();
  efeito();await new Promise(resolve=>setImmediate(resolve));tree=render();
  assert.match(text(tree),/consulta das captações desta administradora falhou/);
  find(tree,n=>n.type==='select');
  falharConsulta=false;
  find(tree,n=>n.type==='button'&&text(n).includes('Atualizar andamento')).props.onClick();
  tree=render();efeito();await new Promise(resolve=>setImmediate(resolve));tree=render();
  find(tree,n=>n.type==='input'&&n.props.type==='checkbox'&&!n.props.checked).props.onChange({target:{checked:true}});tree=render();
  await find(tree,n=>n.type==='button'&&text(n).includes('Conferir efeitos')).props.onClick();tree=render();
  assert.equal(previas,1);assert.equal(pedidos.length,0);assert.match(text(tree),/permitir a ativação automática/);
  await find(tree,n=>n.type==='button'&&text(n).includes('Confirmar pedido')).props.onClick();
  assert.equal(pedidos.length,1);assert.equal(pedidos[0][4],'a'.repeat(32));assert.equal(pedidos[0][5],true);assert.deepEqual([...pedidos[0][3]],[id(2)]);
});

test('actions Maestro usam ator autenticado, falham fechadas sem consentimento e sanitizam falhas de portal',async()=>{
  const chamadas:{name:string;args:any}[]=[];
  const model=moduloIsolado('app/app/configuracoes/easy/maestro/actions.ts',{
    '@/utils/auth/get-permitted-carteiras':{getPermittedCarteiras:async()=>({perfil:'operador',userId:id(10),carteiraIds:[id(1)]})},
    '@/utils/supabase/admin':{createAdminClient:()=>({rpc:async(name:string,args:any)=>{chamadas.push({name,args});return name==='easy_maestro_painel'?{data:{ativo:true,receitas:[{estado:'revisar',detalhe:'Dado privado do portal'}]},error:null}:{data:1,error:null};}})},
    '@/features/easy-cob/worker-health-server':{consultarSaudeEasy:async()=>{throw Error('Falha privada');}},
  });
  await assert.rejects(model.consultarEasyMaestro(), /Selecione/);
  assert.equal(chamadas.length,0);
  const painel=await model.consultarEasyMaestro('sintetica');assert.equal(painel.saudeIndisponivel,true);assert.equal(JSON.stringify(painel).includes('Dado privado'),false);
  assert.ok((await model.captarEasyMaestro('sintetica',id(80),true,[id(2)],'',false)).error);
  await model.captarEasyMaestro('sintetica',id(80),true,[id(2)],'a'.repeat(32),true);
  assert.equal(chamadas.at(-1)?.name,'easy_maestro_captar_confirmado');assert.equal(chamadas.at(-1)?.args.p_operador,id(10));assert.equal(chamadas.at(-1)?.args.p_ativacao,true);
});

test('a abertura preserva o painel e a saúde quando o catálogo fica indisponível',async()=>{
  const jsx=(type:any,props:any)=>({type,props});
  const saude={workers:[]};
  const page=moduloIsolado('app/app/configuracoes/easy/maestro/page.tsx',{
    'react/jsx-runtime':{jsx,jsxs:jsx},
    '@/components/easy/easy-ui':{EasyHeader:'Header'},
    '@/components/easy/easy.module.css':{default:{}},
    '@/utils/auth/get-permitted-carteiras':{getPermittedCarteiras:async()=>({perfil:'operador',carteiraIds:[id(1)]})},
    '@/features/easy-cob/worker-health-server':{consultarSaudeEasy:async()=>saude},
    './catalogo':{listarAdministradoras:async(ids:string[])=>{assert.deepEqual([...ids],[id(1)]);throw Error('timeout');}},
    './painel':{EasyMaestro:'Painel'},
  });
  const tree=await page.default();
  const painel=tree.props.children.find((item:any)=>item.type==='Painel');
  assert.equal(painel.props.administradoras,null);
  assert.equal(painel.props.saudeInicial,saude);
});

test('catálogo consulta apenas as administradoras das carteiras e percorre todas as páginas',async()=>{
  const escopo=[id(1)];
  const cliente={rpc:(nome:string,args:any)=>{
    assert.equal(nome,'easy_maestro_receitas');
    assert.equal(args.p_carteiras,escopo);
    return {select:(campos:string)=>{
      assert.equal(campos,'administradora,administradora_nome');
      return {order:(ordem:string)=>{
        assert.equal(ordem,'receita_id');
        return {range:async(inicio:number,fim:number)=>{
          assert.equal(fim,inicio+499);
          const linha=inicio===0?{administradora:'z',administradora_nome:'Z'}:{administradora:'a',administradora_nome:'A'};
          return {data:Array(inicio===0?500:1).fill(linha),error:null};
        }};
      }};
    }};
  }};
  const model=moduloIsolado('app/app/configuracoes/easy/maestro/catalogo.ts',{
    'server-only':{},'@/utils/supabase/admin':{createAdminClient:()=>cliente},
  });
  assert.equal(JSON.stringify(await model.listarAdministradoras(escopo)),JSON.stringify([['a','A'],['z','Z']]));
});
