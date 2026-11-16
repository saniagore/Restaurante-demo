import { formatAmountInput, sanitizeAmount } from '../lib/money'

export function MoneyInput({ value, onChange, ...props }) {
  return <input
    {...props}
    type="text"
    inputMode="numeric"
    autoComplete="off"
    maxLength={14}
    value={formatAmountInput(value)}
    onChange={(event) => onChange(sanitizeAmount(event.target.value))}
  />
}

export default MoneyInput
