import {chromium} from 'playwright'
const perfil=process.argv[2]
if(!/^[A-Z][A-Z0-9_]*$/.test(perfil||''))throw Error('Perfil inválido')
const b=await chromium.launch({channel:'chrome',headless:true})
try{
 const p=await b.newPage({viewport:{width:1920,height:1080}});p.setDefaultTimeout(45_000)
 await p.goto('https://portal.lellocondominios.com.br/menuPortal2/',{waitUntil:'domcontentloaded'})
 await p.locator('input[type=text]').first().fill(process.env[`SCANNER_LELLO_${perfil}_USUARIO`])
 await p.locator('input[type=password]').first().fill(process.env[`SCANNER_LELLO_${perfil}_SENHA`])
 await p.getByText('Acessar',{exact:true}).click({noWaitAfter:true})
 await p.waitForTimeout(30_000)
 console.log(JSON.stringify(await p.locator('body').evaluate(el=>({path:location.pathname,login:!!el.querySelector('input[type=password]'),negado:/Erro na autentica|Usu[aá]rio nulo|Acesso ao recurso n[aã]o permitido|usu[aá]rio.*inv[aá]lido|senha.*inv[aá]lida/i.test(el.innerText),cabecalhos:[...el.querySelectorAll('button,a,span')].map(e=>e.innerText?.trim()).filter(t=>/^\d+\s*-\s*SAFIRA/.test(t||'')).map(t=>t.slice(0,80)).slice(0,5),cadastro:[...el.querySelectorAll('a[href]')].filter(a=>a.href.includes('CadastroUnidades.do')).length}))))
 for(const f of p.frames()){
  let texto=(await f.locator('body').innerText().catch(()=>''))
  for(const [k,v]of Object.entries(process.env))if(/^SCANNER_.*_(USUARIO|SENHA)$/.test(k)&&v)texto=texto.replaceAll(v,'[protegido]')
  texto=texto.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[email]').replace(/\d{8,}/g,'[numero]')
  console.log(JSON.stringify({frame:new URL(f.url()).pathname,texto:texto.slice(0,1500)}))
 }
}finally{await b.close()}
