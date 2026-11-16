const formatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })
const MAX_DIGITS = 10

/** Deja solo dígitos y limita a 10 enteros para que quepa en numeric(12,2). */
export function sanitizeAmount(value: string | number | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '').slice(0, MAX_DIGITS)
}

/** Formatea para mostrar mientras se escribe: 150000 -> 150.000. */
export function formatAmountInput(value: string | number | null | undefined): string {
  const digits = sanitizeAmount(value)
  return digits ? formatter.format(Number(digits)) : ''
}
