import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const root = "C:/Users/Gekali/gkli-cob";
const envText = await fs.readFile(`${root}/.env.local`, "utf8");
const env = Object.fromEntries(envText.split(/\r?\n/).map((line) => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  return match ? [match[1], match[2].replace(/^['\"]|['\"]$/g, "")] : null;
}).filter(Boolean));

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const requested = [
  { nome: "Condomínio Ayla Moema – Residencial", cnpj: "46936326000398", sourceRow: 39 },
  { nome: "Edifício The Imperial Hall", cnpj: "00756158000196", sourceRow: 48 },
  { nome: "Condomínio Co. Next Liberdade", cnpj: "55597288000115", sourceRow: 54 },
];

const { data: carteira, error: carteiraError } = await supabase
  .from("carteiras")
  .select("id,nome")
  .eq("nome", "Genske Advogados")
  .single();
if (carteiraError) throw carteiraError;

const { data: existing, error: existingError } = await supabase
  .from("condominios")
  .select("id,nome,cnpj,carteira_id")
  .in("cnpj", requested.map((item) => item.cnpj));
if (existingError) throw existingError;
if (existing.length) throw new Error(`Cadastro interrompido: CNPJ já existente: ${JSON.stringify(existing)}`);

const payload = requested.map((item) => ({
  carteira_id: carteira.id,
  nome: item.nome,
  nome_operacional: item.nome,
  cnpj: item.cnpj,
  administradora: null,
  vencimento_cota_dia: 10,
  valor_cota_condominial: 0,
  inicio_cobranca_dias: 30,
  dias_expiracao_regua_pre_juridico: null,
  parcelas_acordo_sem_aprovacao_sindico: 0,
  dias_reemissao_parcela_acordo_atrasada: 0,
  classificacao_operacional: "prata",
  operacao_virtual_habilitada: false,
  regua_cobranca_id: null,
  regua_acordo_id: null,
  status: "ativo",
  observacoes: `Cadastro criado a partir de financas_566011197239481.xlsx (linha ${item.sourceRow}) em 04/08/2026. Parâmetros operacionais iniciais aplicados pelo padrão do app.`,
}));

const { data: created, error: createError } = await supabase
  .from("condominios")
  .insert(payload)
  .select("id,nome,cnpj,carteira_id,status,vencimento_cota_dia,inicio_cobranca_dias,classificacao_operacional");
if (createError) throw createError;

const { data: verified, error: verifyError } = await supabase
  .from("condominios")
  .select("id,nome,cnpj,carteira_id,status,vencimento_cota_dia,inicio_cobranca_dias,classificacao_operacional")
  .in("cnpj", requested.map((item) => item.cnpj))
  .eq("carteira_id", carteira.id)
  .order("nome");
if (verifyError) throw verifyError;
if (verified.length !== requested.length) throw new Error(`Verificação falhou: esperados 3, encontrados ${verified.length}.`);

process.stdout.write(JSON.stringify({ carteira, created, verified }, null, 2));
