import { PageHeader } from '@/components/ui/page-header'
import { Button, ButtonLink } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/utils/supabase/server'
import { requireUser } from '@/utils/auth/require-user'
import { salvarScanner, alternarScanner } from '@/features/agente-automatico/scanner-actions'

const data = (value: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
type ItemConciliacao = {tipo:string;id:string;acordo_id:string|null;resultado:string;motivo:string;app:{vencimento:string;valor:number;valor_pagamento:number};fonte:{data?:string;fonte?:string}|null}
type VinculoBBZ = {recibo:string;parcela_id:string|null;acordo_id:string|null;resultado:string;motivo:string}
type Sugestao = {candidato_id:string;tipo:string;documento_id:string;origem:string;motivo:string;classificacao:string;campos_iguais:string[];campos_divergentes:string[];impedimentos:string[]}
type ResultadoInterpretacao = {resumo:string;ia_status:string;sugestoes:Sugestao[];colunas:unknown[]}
export default async function ScannerPage() {
 const user = await requireUser()
 if (user.perfil !== 'admin') return <p>O scanner está disponível para administradores.</p>
 const db = await createClient()
 const [configs, condos, evidencias, conferencias, vinculosBBZ, baixas, analises] = await Promise.all([
   db.from('scanner_configuracoes').select('*').order('proxima_execucao').limit(1000),
   db.from('condominios').select('id,nome,administradora').eq('status', 'ativo').order('nome').limit(1000),
   db.from('scanner_evidencias').select('id,configuracao_id,unidade_portal,tipo,dados,coletado_em,observado_em,cadastro_status,conciliacao_status,cadastro:scanner_cadastro_auditoria(resultado,antes,depois)').order('observado_em', { ascending: false }).limit(50),
   db.from('scanner_conciliacao_auditoria').select('id,evidencia_id,unidade_id,resultado,resumo,itens,baixa,observado_em,conferido_em').order('conferido_em',{ascending:false}).limit(30),
   db.from('scanner_bbz_vinculacoes').select('id,condominio_id,unidade_id,observado_em,itens').order('criado_em',{ascending:false}).limit(20),
   db.from('scanner_baixas').select('id,tipo,item_id,acordo_id,unidade_id,portal,recibo,confirmado_por,operador_portal,confirmado_em,observado_em,data_pagamento,valor_pago_centavos,execucao_id,antes,depois').order('confirmado_em',{ascending:false}).limit(30),
   db.from('scanner_analises').select('id,condominio_id,unidade_id,observado_em,estado,modelo,resultado,concluido_em,evidencia:scanner_evidencias(observado_em)').order('criado_em',{ascending:false}).limit(30),
 ])
 const erro = configs.error || condos.error || evidencias.error || conferencias.error || vinculosBBZ.error || baixas.error || analises.error
 const nomes = new Map((condos.data ?? []).map(c => [c.id, c.nome]))
 const administradoras = new Map((condos.data ?? []).map(c => [c.id, c.administradora]))
 const situacoes: Record<string,string> = {validado:'Acesso validado',aguardando_primeira_coleta:'Aguardando primeira coleta noturna',pendente_acesso:'Pendente de acesso',pendente_adaptador:'Pendente de integração cadastral',sem_unidades:'Sem unidades cadastradas'}
 const nomesConfiguracoes = new Map((configs.data ?? []).map(c => [c.id, nomes.get(c.condominio_id) ?? c.codigo_portal]))
 return <main className="space-y-6">
   <PageHeader eyebrow="Inteligência · Automação" title="Scanner de enriquecimento" description="Responsáveis, contatos, celulares, e-mails e evidências de pagamento dos portais." actions={<ButtonLink href="/app/agente-automatico" variant="secondary">Voltar aos agentes</ButtonLink>} />
   <section className="rounded-2xl border bg-white p-5 space-y-2">
     <h2 className="font-semibold">Rotina noturna · 00h30 às 05h30</h2>
     <p>Horário de São Paulo. Até 20 unidades por lote, uma consulta por vez e intervalo mínimo de 15 minutos entre lotes. Cada passagem completa aguarda 24 horas.</p>
     <p>Dados cadastrais confirmados no portal substituem divergências nas unidades vinculadas, com histórico do antes e depois. Vínculos ambíguos ficam para revisão. Dados vazios não apagam informações existentes.</p>
     <p>Pagamentos integrais confirmados no portal e conciliados com vínculo único são baixados automaticamente, com a data efetiva do recebimento. Pagamentos inconsistentes ficam para revisão, sem impedir a coleta de contatos. Não há captação de inadimplência.</p>
     <p>A conciliação confere recibo, vínculo externo, vencimento, valor e data. Pagamentos parciais, divergências, vínculos duplicados, bloqueios humanos e casos judiciais exigem revisão. Cada baixa registra o scanner como responsável, a evidência e o antes/depois. Registros manuais anteriores são preservados.</p>
     <p className="text-sm text-slate-600">O executor local precisa estar ligado. Falhas interrompem o lote, aumentam a pausa e desativam o condomínio após três tentativas consecutivas.</p>
     <p>As outras administradoras foram incluídas usando os acessos já cadastrados. Cada consulta confere o condomínio, o bloco e a unidade. Portais sem acesso ou integração cadastral ficam pendentes, sem executar captação. O histórico de pagamento depende de validação específica do portal.</p>
     <p>{configs.data?.filter(c=>c.ativo).length ?? 0} na fila noturna · {configs.data?.filter(c=>!c.ativo).length ?? 0} pausados ou pendentes. Os lotes são compartilhados entre todos os condomínios; a passagem completa pode levar várias noites.</p>
   </section>
   {erro ? <p role="alert" className="rounded-xl bg-amber-50 p-4">Scanner indisponível. Confira a conexão e a aplicação da migração antes de configurar.</p> : <>
   <form action={salvarScanner} className="rounded-2xl border bg-white p-5 grid gap-4 md:grid-cols-2">
     <h2 className="font-semibold md:col-span-2">Adicionar condomínio</h2>
     <label>Adicionar acesso Lello validado<select required name="condominio_id" className="block w-full rounded border p-2">{(condos.data ?? []).filter(c=>c.administradora?.toLowerCase()==='lello'||c.id==='13290a44-ec8d-4232-81e7-711196547f91').map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
     <label>Código do condomínio no portal<Input required name="codigo_portal" pattern="[0-9]{1,10}" /></label>
     <label>Perfil de acesso<Input required name="perfil_acesso" placeholder="Ex.: SAFIRA" pattern="[A-Za-z][A-Za-z0-9_]{0,50}" /><span className="text-sm text-slate-500">Nome do perfil configurado no executor.</span></label>
     <label>Códigos das unidades no portal<Textarea required name="unidades" placeholder="Um código por linha; preserve os zeros iniciais." /></label>
     <div><Button type="submit">Ativar scanner noturno</Button></div>
   </form>
   <section className="space-y-3"><h2 className="font-semibold">Condomínios configurados</h2>
     {!configs.data?.length && <p>Nenhum condomínio configurado.</p>}
     {(configs.data ?? []).map(c => <article key={c.id} className="rounded-xl border bg-white p-4 space-y-2">
       <h3 className="font-semibold">{nomes.get(c.condominio_id) ?? c.condominio_id} · {c.ativo ? 'Na fila noturna' : 'Pausado / pendente'}</h3>
       <p>{administradoras.get(c.condominio_id) ?? 'Administradora não informada'} · {situacoes[c.situacao] ?? c.situacao}</p>
       <p>{c.unidades.length} unidades · cursor {c.cursor} · próxima elegibilidade {data(c.proxima_execucao)} (dentro da janela noturna)</p>
       <p>{c.ultimo_resultado ?? 'Aguardando a primeira coleta.'}</p>
       {['validado','aguardando_primeira_coleta'].includes(c.situacao)&&<form action={alternarScanner}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="ativo" value={String(!c.ativo)} /><Button type="submit" variant="secondary">{c.ativo ? 'Pausar' : 'Reativar'}</Button></form>}
     </article>)}
   </section>
   <section className="space-y-3"><h2 className="font-semibold">Vínculos de recibos BBZ</h2>
     <p>O vínculo exige recibo identificado como acordo, número e quantidade de parcelas, grade integral compatível e processo externo único. Vincular um recibo não confirma seu pagamento. Casos ambíguos ficam para revisão.</p>
     {!vinculosBBZ.data?.length&&<p>Aguardando documentos das unidades com acordos cadastrados.</p>}
     {(vinculosBBZ.data??[]).map(v=><details key={v.id} className="rounded-xl border bg-white p-4">
       <summary className="cursor-pointer">{nomes.get(v.condominio_id)??'Condomínio'} · {data(v.observado_em)} · {Array.isArray(v.itens)?v.itens.length:0} recibos examinados</summary>
       <div className="mt-2"><ButtonLink href={`/app/unidades/${v.unidade_id}`} variant="secondary">Abrir unidade</ButtonLink></div>
       {(Array.isArray(v.itens)?v.itens as VinculoBBZ[]:[]).map((item,i)=><article key={`${item.recibo}-${i}`} className="mt-3 border-t pt-3">
         <p><strong>Recibo {item.recibo} · {item.resultado}</strong></p><p>{item.motivo}</p>
         {item.acordo_id&&<ButtonLink href={`/app/acordos/${item.acordo_id}`} variant="secondary">Abrir acordo</ButtonLink>}
       </article>)}
     </details>)}
   </section>
   <section className="space-y-3"><h2 className="font-semibold">Interpretação assistida e sugestões de vínculos</h2>
     <p>As análises explicam possíveis correspondências e divergências. Toda sugestão exige revisão e revalidação da fonte; não homologa vínculos, não altera parcelas e não autoriza baixas.</p>
     {!analises.data?.length&&<p>Aguardando a análise noturna das evidências que precisam de revisão.</p>}
     {(analises.data??[]).map(a=>{
       const r=a.resultado as ResultadoInterpretacao|null
       const fonteAtual=Array.isArray(a.evidencia)?a.evidencia[0]:a.evidencia
       const historica=a.estado==='superada'||Date.parse(fonteAtual?.observado_em??'')!==Date.parse(a.observado_em)
       return <details key={a.id} className="rounded-xl border bg-white p-4">
         <summary className="cursor-pointer">{nomes.get(a.condominio_id)??'Condomínio'} · {historica?'Fonte atualizada; análise histórica':a.estado.replaceAll('_',' ')} · {data(a.observado_em)}</summary>
         <p className="mt-2">{r?.resumo??'Análise em processamento. A coleta e as verificações financeiras continuam independentes.'}</p>
         <p className="text-sm text-slate-600">{r?.ia_status==='analisada'?`Interpretação por IA · ${a.modelo}`:'Comparação por regras; interpretação por IA não concluída'} · revisão obrigatória</p>
         {a.unidade_id&&<div className="mt-2"><ButtonLink href={`/app/unidades/${a.unidade_id}`} variant="secondary">Abrir unidade</ButtonLink></div>}
         {(r?.sugestoes??[]).map((s,i)=><article key={`${s.candidato_id}-${s.documento_id}-${i}`} className="mt-3 border-t pt-3">
           <p><strong>{s.tipo==='acordo'?'Acordo':'Cobrança'} · {s.classificacao.replaceAll('_',' ')}</strong></p>
           <p>{s.motivo}</p><p>Coincidências: {s.campos_iguais.join(', ')||'Nenhuma comprovada'} · divergências: {s.campos_divergentes.join(', ')||'Nenhuma nos campos comparados'}</p>
           {s.impedimentos.map((m,i)=><p key={i} className="text-sm text-slate-600">{m}</p>)}
           <p className="text-sm">Candidato: {s.candidato_id} · documento: {s.documento_id} · sugestão por {s.origem}</p>
           {s.tipo==='acordo'&&<ButtonLink href={`/app/acordos/${s.candidato_id}`} variant="secondary">Abrir acordo</ButtonLink>}
         </article>)}
         {r&&<details className="mt-2"><summary>Evidências e interpretação registradas</summary><pre className="overflow-auto whitespace-pre-wrap text-sm">{JSON.stringify(r,null,2)}</pre></details>}
       </details>
     })}
   </section>
   <section className="space-y-3"><h2 className="font-semibold">Baixas automáticas e responsável pela confirmação</h2>
     <p>Responsável no app: Scanner noturno. O nome de quem lançou o recebimento no portal só aparece quando informado pela fonte. Acordos só são quitados com cronograma completo e integralmente pago.</p>
     {!baixas.data?.length&&<p>Nenhuma baixa automática registrada. Evidências inconclusivas e pagamentos já registrados não geram nova baixa.</p>}
     {(baixas.data??[]).map(b=><details key={b.id} className="rounded-xl border bg-white p-4">
       <summary className="cursor-pointer">{b.tipo==='parcela'?'Parcela de acordo':'Cobrança'} · recibo {b.recibo} · {(Number(b.valor_pago_centavos)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} · {b.portal}</summary>
       <p className="mt-2">Confirmado por: <strong>Scanner noturno</strong> · {data(b.confirmado_em)}</p>
       <p>Recebimento no portal: {b.data_pagamento.split('-').reverse().join('/')} · fonte consultada em {data(b.observado_em)}</p>
       <p>Operador no portal: {b.operador_portal??'Não informado pela fonte'}</p>
       <p className="text-sm text-slate-600">Execução: {b.execucao_id} · registro de baixa: {b.id}</p>
       <div className="mt-2 flex gap-2"><ButtonLink href={`/app/unidades/${b.unidade_id}`} variant="secondary">Abrir unidade</ButtonLink>{b.acordo_id&&<ButtonLink href={`/app/acordos/${b.acordo_id}`} variant="secondary">Abrir acordo</ButtonLink>}</div>
       <details className="mt-2"><summary>Histórico antes e depois</summary><pre className="overflow-auto whitespace-pre-wrap text-sm">{JSON.stringify({antes:b.antes,depois:b.depois},null,2)}</pre></details>
     </details>)}
   </section>
   <section className="space-y-3"><h2 className="font-semibold">Conciliação de cobranças e parcelas</h2>
     {!conferencias.data?.length&&<p>Aguardando o processamento noturno das evidências de pagamento.</p>}
     {(conferencias.data??[]).map(c=><details key={c.id} className="rounded-xl border bg-white p-4">
       <summary className="cursor-pointer">{c.resultado.replaceAll('_',' ')} · observado em {data(c.observado_em)} · conferido em {data(c.conferido_em)}</summary>
       {c.unidade_id&&<div className="mt-2"><ButtonLink href={`/app/unidades/${c.unidade_id}`} variant="secondary">Abrir unidade</ButtonLink></div>}
       <p className="mt-2">{Object.entries(c.resumo??{}).map(([k,v])=>`${k.replaceAll('_',' ')}: ${v}`).join(' · ')||'Sem itens conciliados; confira o vínculo ou a disponibilidade da fonte.'}</p>
       {c.baixa&&typeof c.baixa==='object'&&!Array.isArray(c.baixa)&&<details className="mt-2"><summary>Resultado da baixa</summary><pre className="overflow-auto whitespace-pre-wrap text-sm">{JSON.stringify(c.baixa,null,2)}</pre></details>}
       {(Array.isArray(c.itens)?c.itens as ItemConciliacao[]:[]).map(item=><article key={item.id} className="mt-3 border-t pt-3">
         <p><strong>{item.tipo==='parcela'?'Parcela de acordo':'Cobrança'} · {item.resultado}</strong> · vencimento {item.app.vencimento}</p>
         <p>{item.motivo}</p>
         <p className="text-sm text-slate-600">Identificador no app: {item.id}{item.fonte?.data?` · pagamento na fonte: ${item.fonte.data}`:''}</p>
         {item.acordo_id&&<ButtonLink href={`/app/acordos/${item.acordo_id}`} variant="secondary">Abrir acordo</ButtonLink>}
         <details className="mt-2"><summary>Comparação registrada</summary><pre className="overflow-auto whitespace-pre-wrap text-sm">{JSON.stringify({app:item.app,fonte:item.fonte},null,2)}</pre></details>
       </article>)}
     </details>)}
   </section>
   <section className="space-y-3"><h2 className="font-semibold">Últimas 50 evidências</h2>
     {!evidencias.data?.length && <p>Nenhuma evidência coletada.</p>}
     {(evidencias.data ?? []).map(e => <details key={e.id} className="rounded-xl border bg-white p-4">
       <summary className="cursor-pointer">{nomesConfiguracoes.get(e.configuracao_id) ?? 'Condomínio'} · unidade {e.unidade_portal} · {e.tipo} · {data(e.observado_em)}</summary>
       {e.tipo==='contatos'&&<p className="mt-2 text-sm">Cadastro: {e.cadastro_status.replaceAll('_',' ')}</p>}
       {e.tipo==='pagamentos'&&<p className="mt-2 text-sm">Conciliação: {e.conciliacao_status.replaceAll('_',' ')}</p>}
       <pre className="mt-3 overflow-auto whitespace-pre-wrap text-sm">{JSON.stringify(e.dados, null, 2)}</pre>
       {e.cadastro&&<pre className="mt-3 overflow-auto whitespace-pre-wrap text-sm">{JSON.stringify(e.cadastro,null,2)}</pre>}
     </details>)}
   </section></>}
 </main>
}
