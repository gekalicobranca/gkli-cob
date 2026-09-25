"""Gera o relatório financeiro e cruza candidatos por nome exato, via configuração.
python gerar_relatorio.py --config co_next.json
Requer reportlab/pypdf. Os nomes geram vínculos a confirmar, nunca confirmação dos autos.
"""
import argparse,json,re
from pathlib import Path
from collections import defaultdict
from datetime import date
from decimal import Decimal
from xml.sax.saxutils import escape
from analisar import analisar,xlsx_rows,normalizar,ZERO,somar
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,PageBreak,KeepTogether
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader,PdfWriter,Transformation

def money(v):return f'{v:,.2f}'.replace(',','_').replace('.',',').replace('_','.')
def dstr(v):return v.strftime('%d/%m/%Y')
def digits(s):return re.sub(r'\D','',s)
def process_state(r):
 s=normalizar(r.get('I',''))
 if any(w in s for w in ['EXTINT','CANCELADO','ARQUIVADO']):return 'Histórico / encerrado informado'
 if 'SUSPENS' in s:return 'Suspenso'
 if 'PUBLICACAO MAIS RECENTE' in s or 'EM GRAU DE RECURSO' in s:return 'Movimentação recente'
 return 'Situação não confirmada'
def office(r):
 if 'LIDIANE' in normalizar(r.get('O','')):return 'Genske Advogados (vínculo confirmado pelo solicitante)'+('; também '+r['P'] if r.get('P') and not normalizar(r['P']).startswith('NAO IDENTIFICADO') else '')
 return r.get('P','Não identificado')
def mark(rs):
 if not rs:return 'S'
 codes={'G' if 'LIDIANE' in normalizar(r.get('O','')) else 'NI' if normalizar(r.get('P','NAO IDENTIFICADO')).startswith('NAO IDENTIFICADO') else 'O' for r in rs}
 return 'N-'+('/'.join(sorted(codes)))+(' [H]' if all(process_state(r)=='Histórico / encerrado informado' for r in rs) else '')
def color(rs):
 if any(process_state(r)=='Movimentação recente' for r in rs):return '#E3F2E8'
 if any(process_state(r)=='Suspenso' for r in rs):return '#FFF1D2'
 return None
def build(cfg):
 a=analisar(cfg['inadimplencia'],date.fromisoformat(cfg['data_base']))
 if any(c['diferenca'] for c in a['conferencias']):raise ValueError('Conferência financeira pendente; revisar antes da geração.')
 proc=[r for r in xlsx_rows(cfg['processos']) if r['linha']>=5 and re.fullmatch(r'\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}',r.get('C',''))]
 if not proc:raise ValueError('Nenhum processo reconhecido; conferir formato.')
 if any(digits(r.get('B',''))!=digits(cfg['cnpj']) for r in proc):raise ValueError('CNPJ de processo difere do condomínio configurado.')
 own=[r for r in proc if any(t in normalizar(r.get('L','')) for t in ['EXEQUENTE','AUTOR','REQUERENTE']) and any(t in normalizar(r.get('G','')+' '+r.get('H','')) for t in ['EXECUCAO','CUMPRIMENTO','COBRANCA','DESPESAS CONDOMINIAIS'])]
 others=[r for r in proc if r not in own]
 links={}
 for u in a['unidades']:
  names={normalizar(n) for n in u['nomes']}
  links[u['unidade']]=[r for r in own if normalizar(r.get('M','')) in names]
 pre=[r for r in xlsx_rows(cfg['pre_juridico']) if r['linha']>1 and (digits(r.get('F',''))==digits(cfg['cnpj']) or 'CO NEXT LIBERDADE' in normalizar(r.get('G','')).replace('.',''))]
 if pre:raise ValueError('Há pré-jurídico do condomínio; revisar e configurar vínculo por unidade antes de concluir.')
 fonts=Path('C:/Windows/Fonts')
 pdfmetrics.registerFont(TTFont('Arial',str(fonts/'arial.ttf')));pdfmetrics.registerFont(TTFont('Arial-Bold',str(fonts/'arialbd.ttf')))
 styles=getSampleStyleSheet()
 for st in ['BodyText','Heading1','Heading2','Title']:styles[st].fontName='Arial'
 styles['BodyText'].fontSize=9;styles['BodyText'].leading=12;styles['BodyText'].spaceAfter=6
 styles['Title'].fontSize=20;styles['Title'].leading=24;styles['Title'].alignment=0
 styles['Heading1'].fontSize=14;styles['Heading1'].leading=18
 styles['Heading2'].fontSize=10;styles['Heading2'].leading=13
 small=ParagraphStyle('small',fontName='Arial',fontSize=7.6,leading=10)
 head=ParagraphStyle('head',parent=small,fontName='Arial-Bold',textColor=colors.white)
 story=[]
 def p(s,style='BodyText'):story.append(Paragraph(s,styles[style]))
 def table(headers,rows,widths,fills=None):
  data=[[Paragraph(escape(str(x)),head) for x in headers]]+[[Paragraph(escape(str(x)),small) for x in r] for r in rows]
  t=Table(data,colWidths=widths,repeatRows=1,hAlign='LEFT')
  rules=[('BACKGROUND',(0,0),(-1,0),colors.HexColor('#3B2049')),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#F5F2F6')])]
  if fills:rules += [('BACKGROUND',(0,i+1),(-1,i+1),colors.HexColor(f)) for i,f in enumerate(fills) if f]
  t.setStyle(TableStyle(rules));t.spaceAfter=8;story.append(t)
 def page(title):story.append(PageBreak());p(title,'Heading1')
 def sumfield(us,k):return sum((u[k] for u in us),ZERO)
 p(escape(cfg['nome']),'Title');p('Relatório consolidado de inadimplência','Heading1')
 p('Posição financeira: '+dstr(a['data_base'])+' | Referência '+a.get('referencia','')+' | CNPJ '+cfg['cnpj'])
 p('Relatório produzido com base em informações públicas e privadas, protegido pela LGPD e destinado somente para pessoas autorizadas. Não reproduzir esse conteúdo de forma parcial ou completa.')
 t=a['totais'];p('<b>Saldo atualizado: R$ '+money(t['total'])+'</b>, em '+str(a['contagem']['unidades'])+' unidades e '+str(a['contagem']['recibos'])+' recibos. Relação de processos consolidada em '+dstr(date.fromisoformat(cfg['data_processos']))+'.')
 table(['Composição','Valor (R$)'],[['Principal',money(t['principal'])],['Multa',money(t['multa'])],['Correção e juros',money(t['correcao_juros'])],['TOTAL',money(t['total'])]],[360,155])
 table(['Faixa de vencimento','Unidades','Saldo atualizado (R$)'],[['Mais de 60 dias',a['idades']['mais_60_dias']['unidades'],money(a['idades']['mais_60_dias']['total'])],['Mais de 5 anos',a['idades']['mais_5_anos']['unidades'],money(a['idades']['mais_5_anos']['total'])]],[300,70,145])
 p('Os saldos acima são de recibos completos, incluindo taxa, consumos, fundos e encargos. As faixas são subconjuntos do saldo total. O vencimento mais antigo é '+dstr(min(x['vencimento'] for x in a['recibos']))+'; o mais recente é '+dstr(max(x['vencimento'] for x in a['recibos']))+'.')
 p('Conferência e separação por natureza','Heading2')
 p('Resumo e recibos conferem. Principal identificado: taxa condominial R$ '+money(a['naturezas'].get('Taxa condominial',{}).get('principal_identificado',ZERO))+'; demais débitos líquidos R$ '+money(t['principal']-a['naturezas'].get('Taxa condominial',{}).get('principal_identificado',ZERO))+'. Os encargos não estão discriminados por natureza na origem e não foram rateados.')
 page('Processos e prioridades de conferência')
 older=[u for u in a['unidades'] if u['mais_60_dias']>0]
 grouped=defaultdict(list)
 for u in older:
  rs=links[u['unidade']]
  label='Sem correspondência na relação enviada' if not rs else 'Processo histórico / encerrado informado' if all(process_state(r)=='Histórico / encerrado informado' for r in rs) else 'Processo com movimentação recente' if any(process_state(r)=='Movimentação recente' for r in rs) else 'Outro vínculo processual'
  grouped[label].append(u)
 table(['Vínculo entre unidades acima de 60 dias','Unidades','Saldo > 60 dias (R$)'],[[k,len(us),money(sumfield(us,'mais_60_dias'))] for k,us in grouped.items()]+[['TOTAL',len(older),money(sumfield(older,'mais_60_dias'))]],[300,65,150])
 p('As associações por nome não confirmam a unidade no processo nem quais vencimentos foram cobrados. “Sem correspondência” significa ausência na lista fornecida, não inexistência de processo.')
 for r in own:
  us=[u for u in a['unidades'] if r in links[u['unidade']]]
  p(escape(r['M'])+' - '+r['C'],'Heading2')
  p(escape(r['I'])+'. '+('Possível vínculo com '+', '.join(u['unidade'] for u in us)+'.' if us else 'Sem correspondência por nome com as unidades do relatório de inadimplência.'))
  if 'QUITACAO' in normalizar(r['I']+' '+r.get('S','')):p('<b>Conferir quitação:</b> há menção a manifestação sobre quitação, mas o relatório financeiro ainda apresenta saldo. A publicação não foi tratada como prova de pagamento nem como autorização para baixa.')
 p('Escritório patrocinador','Heading2')
 p('Nos três registros fornecidos consta João Pereira dos Santos Junior (OAB SP261044), com escritório não identificado na fonte. Não foi atribuída a atuação à Genske nem a outro escritório sem identificação. A regra Lidiane = Genske continua disponível, mas não se aplica a estes registros.')
 p('Pré-jurídico','Heading2');p('Nenhum caso do condomínio foi identificado na planilha CASOS PRÉ-JURIDICO 07-2026.._.xlsx, por nome ou CNPJ. Isso não prova ausência de pré-distribuição em outras fontes.')
 page('Legenda e critérios')
 table(['Marcação','Significado'],[['N-NI','Possível vínculo por nome, com escritório não identificado.'],['[H]','Processo extinto, cancelado ou arquivado informado; não significa ação ativa.'],['S','Sem correspondência com a relação de cobranças enviada.'],['Verde','Movimentação recente informada, sem encerramento indicado. Publicação recente isoladamente não confirma andamento atual.'],['Amarelo','Processo expressamente suspenso. Não há esse estado nos registros recebidos.']],[100,415],[None,None,None,'#E3F2E8','#FFF1D2'])
 p('Base financeira: '+dstr(a['data_base'])+', data extraída do nome do arquivo e adotada explicitamente. O campo “Período de / até” está sem datas na exportação. Base processual: '+dstr(date.fromisoformat(cfg['data_processos']))+'. Não houve nova consulta aos autos ou atualização de valores.')
 p('Mais de 60 dias: vencimento anterior a '+dstr(a['corte_60_dias'])+'. Mais de 5 anos: anterior a '+dstr(a['corte_5_anos'])+'. O intervalo acima de 60 dias e abaixo de 5 anos usa limites estritos. Não há débitos de mais de 5 anos neste arquivo.')
 p('Valores por natureza são o principal identificado nos detalhes. Embora o cabeçalho do detalhamento esteja escrito “Correção/Juros”, a soma desses valores fecha com o principal dos recibos, após tratar o desconto explícito. Encargos permanecem somente nos totais dos recibos.')
 p('No formato Hubert, a conta 1002 também usa históricos abreviados “COTA” e “C.” para despesas comuns. Esses lançamentos foram incluídos nas taxas condominiais, junto com os históricos “CONDOMINIO”. Fundos, consumos, IPTU e obras permanecem separados.')
 p('Na unidade 0R0306, recibo de 07/08/2026, o desconto de IPTU de R$ 73,36 aparece positivo na exportação. Foi tratado como abatimento na composição analítica: R$ 480,00 de soma positiva menos duas vezes R$ 73,36 = R$ 333,28 de principal informado. O arquivo original foi preservado.')
 p('Há 67 linhas “LOCACAO AREA COMUM” sem valor, além de linhas com zero explícito. Não foram transformadas em cobranças nem tratadas como prova de saldo zero. Os valores conhecidos já reconciliam com o principal total. Não foi identificado valor de cessão ou locação a quantificar.')
 p('Nas tabelas, as cores se referem ao processo associado ao cadastro, não à confirmação de que todos os vencimentos ou naturezas estejam nos autos.')
 def unit_table(us,title):
  page(title);p('Valores atualizados dos recibos completos. Verde = movimentação recente; [H] = processo extinto informado; N-NI = vínculo por nome/escritório não identificado; S = sem correspondência.')
  rows=[];fills=[]
  for u in us:
   rows.append([u['unidade'],' / '.join(u['nomes']),money(u['total']),money(u['mais_60_dias']),dstr(u['primeiro_vencimento']),mark(links[u['unidade']])]);fills.append(color(links[u['unidade']]))
  rows.append(['TOTAL','',money(sumfield(us,'total')),money(sumfield(us,'mais_60_dias')),'',''])
  table(['Unidade','Responsável','Saldo total','> 60 dias','Mais antigo','Vínculo'],rows,[55,153,83,83,73,68],fills)
 unit_table(sorted(older,key=lambda u:u['mais_60_dias'],reverse=True),'Unidades com débitos acima de 60 dias')
 unit_table(a['unidades'],'Relação completa de unidades')
 for cat in ['Taxa condominial','Outros débitos']:
  page(cat+' - principal por unidade');p('Somente principal, sem rateio de multas, correção ou juros. Valores com mais de 60 dias e 5 anos são subconjuntos do principal total. Débitos sem valor no detalhamento não entram na soma.')
  sub=[x for x in a['itens'] if x['natureza']==cat and x['principal'] not in [None,ZERO]];groups=defaultdict(list)
  for x in sub:groups[x['unidade']].append(x)
  rows=[];fills=[]
  for unit,its in sorted(groups.items(),key=lambda kv:somar(kv[1],'principal'),reverse=True):
   v60=sum((x['principal'] for x in its if x['vencimento']<a['corte_60_dias']),ZERO)
   rows.append([unit,' / '.join(sorted(set(x['nome'] for x in its))),money(somar(its,'principal')),money(v60),mark(links[unit])]);fills.append(color(links[unit]))
  rows.append(['TOTAL','',money(somar(sub,'principal')),money(sum((x['principal'] for x in sub if x['vencimento']<a['corte_60_dias']),ZERO)),''])
  table(['Unidade','Responsável','Principal total','Principal > 60 dias','Vínculo'],rows,[60,190,95,95,75],fills)
  if cat=='Outros débitos':
   p('Composição dos demais débitos','Heading2');gs=defaultdict(list)
   for x in sub:gs[x['historico']].append(x)
   table(['Histórico','Principal líquido (R$)'],[[k,money(somar(v,'principal'))] for k,v in sorted(gs.items(),key=lambda kv:somar(kv[1],'principal'),reverse=True)],[365,150])
 page('Cadastro de processos de cobrança e execução')
 for r in own:
  start=len(story);p(r['C'],'Heading2');p('<b>Parte contrária:</b> '+escape(r['M'])+'. <b>Classe:</b> '+escape(r['G'])+'. <b>Assunto:</b> '+escape(r['H'])+'.')
  p('<b>Situação informada:</b> '+escape(r['I'])+'. <b>Advogado:</b> '+escape(r['O'])+'. <b>Escritório:</b> '+escape(office(r))+'.')
  p('<b>Unidade na fonte:</b> '+escape(r['N'])+'. <b>Observação:</b> '+escape(r.get('S','')))
  p('Fonte: processos_co_next_liberdade.xlsx, aba Processos, linha '+str(r['linha'])+'. <link href="'+escape(r['Q'],{'"':'&quot;'})+'" color="#245A81">Publicações indicadas</link>; <link href="'+escape(r['R'],{'"':'&quot;'})+'" color="#245A81">fonte da parte contrária</link>.')
  block=story[start:];del story[start:];story.append(KeepTogether(block))
 page('Informações adicionais e fontes')
 p('Demais processos','Heading2')
 if not others:p('A planilha recebida contém somente três execuções ajuizadas pelo condomínio. Não foram fornecidos outros processos para relacionar nesta seção. O processo de Kenneth Bernard Fox permanece no cadastro de cobranças, mesmo sem débito correspondente identificado.')
 else:
  for r in others:p(escape(r['C']+' - '+r.get('G','')+' - '+r.get('M','')))
 p('Fontes','Heading2')
 p('1. '+escape(Path(cfg['inadimplencia']).name)+', aba Inadimplentes, linhas 1737 a 1740 para o resumo. Conferidos '+str(a['contagem']['recibos'])+' recibos e '+str(a['contagem']['itens'])+' detalhes.')
 p('2. '+escape(Path(cfg['processos']).name)+', abas Processos e Fontes; dados processuais consolidados em '+dstr(date.fromisoformat(cfg['data_processos']))+'.')
 p('3. '+escape(Path(cfg['pre_juridico']).name)+', aba PRÉ-JURIDICO, 60 registros, sem correspondência para este condomínio.')
 p('4. Papel timbrado “Cópia de Cartão-1.pdf” e critérios de apresentação aprovados pelo solicitante.')
 p('Limites da conferência','Heading2')
 p('Não foi verificada a inclusão de vencimentos em processos, quitação, reajuizamento ou mudança de patrono. A existência de processo extinto não elimina nem confirma a exigibilidade do saldo financeiro. Valores de ação não foram somados aos débitos. A taxa de inadimplência depende do faturamento e da base completa de unidades, não disponíveis neste arquivo.')
 out=Path(cfg['saida']);out.parent.mkdir(parents=True,exist_ok=True);tmp=out.parent/'tmp_co_next';tmp.mkdir(exist_ok=True);content=tmp/'conteudo.pdf'
 def footer(canvas,doc):
  canvas.setFont('Arial',8);canvas.setFillColor(colors.HexColor('#3B2049'));canvas.drawString(40,111,a['condominio']+' | Posição: '+dstr(a['data_base']));canvas.drawRightString(555,111,'Página '+str(doc.page))
 SimpleDocTemplate(str(content),pagesize=(595.28,841.89),rightMargin=40,leftMargin=40,topMargin=173,bottomMargin=123).build(story,onFirstPage=footer,onLaterPages=footer)
 template=PdfReader(cfg['template']).pages[0];tr=Transformation().translate(-float(template.mediabox.left),-float(template.mediabox.bottom)).scale(595.28/float(template.mediabox.width),841.89/float(template.mediabox.height));w=PdfWriter()
 for pg in PdfReader(str(content)).pages:
  dest=w.add_blank_page(width=595.28,height=841.89);dest.merge_transformed_page(template,tr);dest.merge_page(pg)
 w.add_metadata({'/Title':cfg['nome']+' - Inadimplência','/Author':'Genske Advogados'})
 with out.open('wb') as f:w.write(f)
 read=PdfReader(str(out));text='\n'.join(pg.extract_text() for pg in read.pages)
 assert all(r['C'] in text for r in proc)
 assert money(a['totais']['total']) in text
 assert all(u['unidade'] in text for u in a['unidades'])
 audit={'arquivo':str(out),'paginas':len(read.pages),'processos':len(proc),'vinculos_por_nome':{k:[r['C'] for r in rs] for k,rs in links.items() if rs},'faixa_60_dias':{k:{'unidades':len(us),'saldo':money(sumfield(us,'mais_60_dias'))} for k,us in grouped.items()}}
 out.with_suffix('.audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps(audit,ensure_ascii=True,indent=2));print('page lengths',[len(pg.extract_text()) for pg in read.pages])
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('--config',required=True);args=ap.parse_args();build(json.loads(Path(args.config).read_text(encoding='utf-8')))
