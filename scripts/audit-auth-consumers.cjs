/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')

function inventory() {
  const records = []
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) { walk(file); continue }
      if (!/\.tsx?$/.test(entry.name)) continue
      const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
      for (const node of source.statements) {
        if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue
        const name = node.moduleSpecifier.text
        if (!name.includes('/auth/') && name !== '@/app/api/_lib/auth') continue
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
        records.push({ arquivo: path.relative(root, file).replaceAll('\\', '/'), linha: line + 1, origem: name,
          importacao: node.importClause?.getText(source) ?? '', revisao: 'Dependência identificada estaticamente; contrato central testado. Não representa teste E2E individual.' })
      }
    }
  }
  for (const dir of ['app', 'features', 'utils']) walk(path.join(root, dir))
  return records.sort((a, b) => a.arquivo.localeCompare(b.arquivo) || a.linha - b.linha)
}
module.exports = { inventory }
if (require.main === module) {
  const records = inventory()
  const output = process.argv[2] || 'outputs/auditoria-item1-20261102/consumidores.json'
  fs.mkdirSync(path.dirname(path.resolve(root, output)), { recursive: true })
  fs.writeFileSync(path.resolve(root, output), JSON.stringify({ arquivos: new Set(records.map(r => r.arquivo)).size, dependencias: records.length, consumidores: records }, null, 2))
  console.log(`Inventário: ${new Set(records.map(r => r.arquivo)).size} arquivos; ${records.length} dependências.`)
}
