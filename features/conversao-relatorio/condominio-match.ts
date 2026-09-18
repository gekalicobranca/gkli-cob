function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const CONDOMINIO_NAME_STOP_WORDS = new Set([
  "condominio",
  "cond",
  "edificio",
  "casa",
]);

function condominioNameTokens(value: string) {
  return normalizeSearchText(value)
    .split(" ")
    .filter(
      (token) => token.length > 2 && !CONDOMINIO_NAME_STOP_WORDS.has(token),
    );
}

function similarityScore(source: string, target: string) {
  const a = normalizeSearchText(source);
  const b = normalizeSearchText(target);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 88;

  const sourceTokens = new Set(condominioNameTokens(a));
  const targetTokens = condominioNameTokens(b);
  if (!sourceTokens.size || !targetTokens.length) return 0;

  const hits = targetTokens.filter((token) => sourceTokens.has(token)).length;
  return Math.round((hits / targetTokens.length) * 80);
}

export function rankedCondominios(
  condominios: CondominioOption[],
  detected?: string | null,
) {
  const term = detected ?? "";
  return condominios
    .map((condominio) => ({
      condominio,
      score: Math.max(
        similarityScore(condominio.nome, term),
        similarityScore(condominio.nomeOperacional ?? "", term),
      ),
    }))
    .filter((item) => !term || item.score >= 25)
    .sort(
      (a, b) =>
        b.score - a.score || a.condominio.nome.localeCompare(b.condominio.nome),
    )
    .slice(0, 8);
}

export function autoMatchCondominio(
  condominios: CondominioOption[],
  detected?: string | null,
) {
  const [best, second] = rankedCondominios(condominios, detected);
  if (!best || best.score < 80) return null;
  if (second && best.score - second.score < 12) return null;
  return best.condominio;
}

export type CondominioOption = {
  id: string;
  nome: string;
  nomeOperacional?: string;
  cnpj: string;
};

