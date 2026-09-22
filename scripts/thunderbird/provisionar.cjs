// node --env-file=.env.local scripts/thunderbird/provisionar.cjs <carteira-uuid> <email> <test-recipient>
const { createClient } = require('@supabase/supabase-js');
const { randomBytes, createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
async function main() {
  const [carteiraId, email, to] = process.argv.slice(2);
  if (!/^[a-f0-9-]{36}$/.test(carteiraId || '') || !email?.includes('@') || !to?.includes('@')) throw Error('Informe carteira, remetente e destinatário de teste.');
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const token = randomBytes(32).toString('base64url');
  const { data, error } = await db.from('thunderbird_dispositivos').insert({ carteira_id: carteiraId, email, token_hash: createHash('sha256').update(token).digest('hex') }).select('id').single();
  if (error) throw error;
  const file = path.resolve('output/thunderbird/conexao-azevedo.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ endpoint: 'https://gkli-cob.vercel.app/api/integracoes/thunderbird', token, email }, null, 2), { flag: 'wx' });
  const { error: testError } = await db.from('thunderbird_envios').insert({ dispositivo_id: data.id, tipo: 'teste', destinatario: to, assunto: 'Teste GKLI — envio automático pelo Thunderbird', corpo: 'Teste da integração GKLI com o Thunderbird local da carteira Azevedo Araújo. Esta mensagem valida o envio automático pela conta já conectada. Nenhuma cobrança foi enviada neste teste.' });
  if (testError) throw testError;
  console.log(JSON.stringify({ deviceId: data.id, pairingFile: file, testRecipient: to, automatic: false }));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
