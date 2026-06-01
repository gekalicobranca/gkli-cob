export function onlyDigits(value: unknown) {
  return String(value ?? '').replace(/\D/g, '')
}
