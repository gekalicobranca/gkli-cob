import assert from 'node:assert/strict'

const base = process.argv[2] ?? 'http://127.0.0.1:3107'
const request = (path, options = {}) => fetch(new URL(path, base), {
  ...options, redirect: 'manual', signal: AbortSignal.timeout(30000),
})

const login = await request('/sindico/login')
assert.equal(login.status, 200, 'O formulário de login deve abrir sem sessão')
assert.equal(login.headers.get('location'), null)
const html = await login.text()
assert.match(html, /action="\/auth\/sindico-login"/)
assert.match(html, /name="email"/)
assert.match(html, /name="password"/)

for (const path of ['/sindico', '/sindico/visao-v2']) {
  const response = await request(path)
  assert.equal(response.status, 307, `${path} deve exigir autenticação`)
  assert.equal(new URL(response.headers.get('location'), base).pathname, '/sindico/login')
  const destination = await request(response.headers.get('location'))
  assert.equal(destination.status, 200, 'O redirecionamento deve terminar no formulário')
}

const missingCredentials = await request('/auth/sindico-login', {
  method: 'POST', body: new URLSearchParams({ email: '', password: '' }),
})
assert.equal(missingCredentials.status, 303)
const errorUrl = new URL(missingCredentials.headers.get('location'), base)
assert.equal(errorUrl.pathname, '/sindico/login')
assert.equal(errorUrl.searchParams.get('erro'), 'Informe e-mail e senha para entrar.')
const errorPage = await request(errorUrl)
assert.equal(errorPage.status, 200)
assert.match(await errorPage.text(), /Informe e-mail e senha para entrar\./)
console.log('Login do síndico validado: formulário público, páginas internas protegidas e erros sem loop.')
