"""Leitura e conferência de relatórios de inadimplência sem alterar a origem.

Uso: python analisar.py arquivo --data-base AAAA-MM-DD --saida analise.json
Detecta XLSX Hubert e HTML de recibos pela estrutura real, não pela extensão.
Não vincula processos automaticamente por semelhança de nomes.
"""
import argparse, html, json, re, unicodedata, zipfile
from pathlib import Path
from datetime import date, datetime, timedelta
from decimal import Decimal
from collections import defaultdict
import xml.etree.ElementTree as ET

ZERO=Decimal('0')
def normalizar(s):
 return ''.join(c for c in unicodedata.normalize('NFD',s.upper()) if unicodedata.category(c)!='Mn')
def natureza(texto):
 s=normalizar(texto)
 if re.search(r'\b(?:TX\s+)?CONDOMINIO\b|\bTAXA CONDOMINIAL\b',s):return 'Taxa condominial'
 if re.search(r'\bCESSAO\b',s):return 'Cessão de espaço'
 if re.search(r'\bLOCACAO\b',s):return 'Locação de espaço'
 if 'PANDEMI' in s:return 'Pandemia - natureza a confirmar'
 return 'Outros débitos'
def numero(s):
 s=str(s).strip()
 if not s:raise ValueError('Valor financeiro ausente')
 return Decimal(s.replace('.','').replace(',','.'))
def natureza_hubert(conta,historico):
 s=normalizar(historico)
 if conta=='1002' and (s.startswith('COTA ') or s.startswith('C. ') or s.startswith('CONDOMINIO')):return 'Taxa condominial'
 if conta=='1003' and s=='AL.SALAO FESTAS':return 'Locação de espaço'
 return natureza(historico)
def somar(rows,field):return sum((r[field] for r in rows),ZERO)
def data(s):return datetime.strptime(s,'%d/%m/%Y').date()
def xlsx_rows(path):
 ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
 with zipfile.ZipFile(path) as z:
  ss=[]
  if 'xl/sharedStrings.xml' in z.namelist():
   ss=[''.join(t.text or '' for t in si.findall('.//m:t',ns)) for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si',ns)]
  rows=[]
  for row in ET.fromstring(z.read('xl/worksheets/sheet1.xml')).findall('.//m:sheetData/m:row',ns):
   out={'linha':int(row.get('r'))}
   for c in row.findall('m:c',ns):
    value=c.find('m:v',ns);inline=c.find('m:is',ns)
    text=value.text if value is not None else ''
    if c.get('t')=='s' and text:text=ss[int(text)]
    elif inline is not None:text=''.join(t.text or '' for t in inline.findall('.//m:t',ns))
    if text:out[re.sub(r'\d','',c.get('r'))]=re.sub(r'\s+',' ',text).strip()
   rows.append(out)
 return rows
def hubert(path):
 rows=xlsx_rows(path);receipts=[];items=[];warnings=[];summary={};unit=name='';current=None;title='';reference=''
 for r in rows:
  if r.get('E')=='Referência':reference=r.get('K','');title=r.get('M','')
  if r.get('E')=='Unidade':unit=r['K'];name=r.get('M','')
  if re.fullmatch(r'\d{2}/\d{2}/\d{4}',r.get('I','')):
   if not unit:raise ValueError('Recibo sem unidade')
   current={'unidade':unit,'nome':name,'vencimento':data(r['I']),'principal':numero(r['O']),'multa':numero(r['Q']),'correcao_juros':numero(r['R']),'total':numero(r['V']),'linha':r['linha']}
   receipts.append(current)
  if re.fullmatch(r'\d+',r.get('J','')) and r.get('O'):
   if current is None:raise ValueError('Detalhe sem recibo')
   amount=numero(r['R']) if r.get('R') else None
   if amount is None:warnings.append(f"Linha {r['linha']}: detalhe sem valor ({r['O']}); não convertido em zero.")
   items.append({'unidade':unit,'nome':name,'vencimento':current['vencimento'],'conta':r['J'],'historico':r['O'],'natureza':natureza_hubert(r['J'],r['O']),'principal':amount,'valor_exibido':amount,'linha':r['linha'],'recibo_linha':current['linha']})
  labels={'VALOR TOTAL ORIGINAL':'principal','VALOR TOTAL MULTAS':'multa','VALOR TOTAL CORREÇÕES/JUROS':'correcao_juros','VALOR TOTAL COM MULTA/CORREÇÕES/JUROS':'total'}
  if r.get('B') in labels:summary[labels[r['B']]]=numero(r['U'])
 if not receipts or len(summary)!=4:raise ValueError('Formato Hubert não reconhecido ou resumo incompleto')
 checks=[]
 for field,value in summary.items():
  observed=somar(receipts,field);checks.append({'controle':field,'fonte':value,'calculado':observed,'diferenca':observed-value})
 for r in receipts:
  observed=r['principal']+r['multa']+r['correcao_juros']
  if observed!=r['total']:warnings.append(f"Linha {r['linha']}: composição do recibo diverge em {observed-r['total']}.")
  sub=[x for x in items if x['recibo_linha']==r['linha'] and x['principal'] is not None]
  diff=somar(sub,'principal')-r['principal']
  discounts=[x for x in sub if re.search(r'\bDESCONTO\b',normalizar(x['historico'])) and x['principal']>0]
  if diff and discounts and diff==2*somar(discounts,'principal'):
   for x in discounts:x['principal']=-x['principal'];x['tratamento']='Abatimento: desconto exibido positivo; sinal reconciliado com principal do recibo.'
   warnings.append(f"Linha {r['linha']}: desconto explícito tratado como abatimento; soma dos detalhes reconciliada com o principal.")
   diff=somar(sub,'principal')-r['principal']
  if diff:warnings.append(f"Linha {r['linha']}: soma dos detalhes conhecidos diverge do principal em {diff}.")
 if any(x['diferenca'] for x in checks):raise ValueError('Totais de recibos não reconciliam com o resumo: '+str(checks))
 return {'formato':'Hubert Cotas Atrasadas XLSX','condominio':title,'referencia':reference,'recibos':receipts,'itens':items,'totais':summary,'conferencias':checks,'observacoes':warnings,'encargos_por_natureza':'Não disponíveis. Encargos somente no recibo; não rateados entre naturezas.'}
def recibos_html(path):
 b=Path(path).read_bytes()
 try:s=b.decode('utf-8')
 except UnicodeDecodeError:s=b.decode('cp1252')
 rows=[[re.sub(r'\s+',' ',html.unescape(re.sub('<[^>]+>',' ',c))).strip() for c in re.findall(r'<t[dh]\b[^>]*>(.*?)</t[dh]>',r,re.S)] for r in re.findall(r'<tr\b[^>]*>(.*?)</tr>',s,re.S)]
 receipts=[];items=[];unit=name=title='';current=None;summary=None
 for i,r in enumerate(rows,1):
  if not r:continue
  if r[0].startswith('Condomínio:'):title=r[0].split(':',1)[1].strip()
  m=re.match(r'Bloco: (.*?) Unidade: (\S+) (.*)',r[0])
  if m:unit=m[1].upper()+'/'+m[2];name=m[3]
  if len(r)==12 and re.search(r'\d',r[0]) and r[5]=='R$':
   if r[1]:current={'unidade':unit,'nome':name,'vencimento':data(r[1]),'identificador':re.search(r'\d+',r[0])[0]}
   vals=[numero(v) for v in r[-6:]]
   items.append({**current,'conta':r[3],'historico':r[4],'natureza':natureza(r[4]),'principal':vals[1],'multa':vals[2],'correcao_juros':vals[3]+vals[4],'total':vals[5],'linha':i})
  elif r[0]=='Total do Recibo:':
   vals=[numero(v) for v in r[-6:]];receipts.append({**current,'principal':vals[1],'multa':vals[2],'correcao_juros':vals[3]+vals[4],'total':vals[5],'linha':i})
  elif r[0].startswith('Quantidade de unidade'):
   vals=[numero(v) for v in r[-6:]];summary=dict(zip(['principal','multa','correcao_juros','total'],[vals[1],vals[2],vals[3]+vals[4],vals[5]]))
 if summary is None:raise ValueError('Resumo HTML ausente')
 checks=[]
 for field,value in summary.items():
  for label,sub in [('recibos',receipts),('itens',items)]:
   observed=somar(sub,field);checks.append({'controle':label+' '+field,'fonte':value,'calculado':observed,'diferenca':observed-value})
 if any(x['diferenca'] for x in checks):raise ValueError('Totais HTML não reconciliam')
 return {'formato':'HTML Recibos','condominio':title,'recibos':receipts,'itens':items,'totais':summary,'conferencias':checks,'observacoes':[],'encargos_por_natureza':'Disponíveis nos itens.'}
def analisar(path,ref):
 result=hubert(path) if zipfile.is_zipfile(path) else recibos_html(path)
 try:five=ref.replace(year=ref.year-5)
 except ValueError:five=ref.replace(year=ref.year-5,day=28)
 receipts=result['recibos'];items=result['itens'];result['data_base']=ref;result['arquivo_fonte']=str(Path(path).resolve());result['corte_60_dias']=ref-timedelta(days=60);result['corte_5_anos']=five
 result['situacao_processual']='Não avaliada - aguarda relação específica do condomínio.'
 result['contagem']={'unidades':len(set(x['unidade'] for x in receipts)),'recibos':len(receipts),'itens':len(items)}
 groups=defaultdict(list)
 for x in receipts:groups[x['unidade']].append(x)
 result['unidades']=[]
 for unit,sub in sorted(groups.items(),key=lambda kv:somar(kv[1],'total'),reverse=True):
  result['unidades'].append({'unidade':unit,'nomes':sorted(set(x['nome'] for x in sub)),'total':somar(sub,'total'),'principal':somar(sub,'principal'),'mais_60_dias':sum((x['total'] for x in sub if (ref-x['vencimento']).days>60),ZERO),'mais_5_anos':sum((x['total'] for x in sub if x['vencimento']<five),ZERO),'entre_60_dias_5_anos':sum((x['total'] for x in sub if five<x['vencimento']<result['corte_60_dias']),ZERO),'primeiro_vencimento':min(x['vencimento'] for x in sub),'ultimo_vencimento':max(x['vencimento'] for x in sub)})
 groups=defaultdict(list)
 for x in items:groups[x['natureza']].append(x)
 result['naturezas']={c:{'principal_identificado':sum((x['principal'] for x in sub if x['principal'] is not None),ZERO),'itens_sem_valor':sum(x['principal'] is None for x in sub),'unidades_com_valor':len(set(x['unidade'] for x in sub if x['principal'] not in [None,ZERO]))} for c,sub in groups.items()}
 known=sum((x['principal'] for x in items if x['principal'] is not None),ZERO)
 result['conferencias'].append({'controle':'principal por natureza identificado','fonte':result['totais']['principal'],'calculado':known,'diferenca':known-result['totais']['principal']})
 result['idades']={label:{'recibos':len(sub),'unidades':len(set(x['unidade'] for x in sub)),'total':somar(sub,'total')} for label,sub in [('mais_60_dias',[x for x in receipts if (ref-x['vencimento']).days>60]),('mais_5_anos',[x for x in receipts if x['vencimento']<five]),('entre_60_dias_5_anos',[x for x in receipts if five<x['vencimento']<result['corte_60_dias']])]}
 return result
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('arquivo');ap.add_argument('--data-base',required=True,type=date.fromisoformat);ap.add_argument('--saida',required=True);args=ap.parse_args()
 result=analisar(args.arquivo,args.data_base);out=Path(args.saida);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(result,ensure_ascii=False,indent=2,default=str),encoding='utf-8')
 print(json.dumps({k:result[k] for k in ['condominio','contagem','totais','naturezas','idades','observacoes']},ensure_ascii=True,default=str,indent=2))
