import { forwardRef } from 'react'
import { Input, type InputProps } from './Input'

function formatCRPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 4) return digits
  return `${digits.slice(0, 4)}-${digits.slice(4)}`
}

export const PhoneInput = forwardRef<HTMLInputElement, InputProps>(
  ({ onChange, ...props }, ref) => {
    return (
      <Input
        {...props}
        ref={ref}
        type="tel"
        maxLength={9}
        placeholder="8888-0000"
        onChange={(e) => {
          e.target.value = formatCRPhone(e.target.value)
          onChange?.(e)
        }}
      />
    )
  }
)

PhoneInput.displayName = 'PhoneInput'

export const crPhoneSchema =
  /^\d{4}-\d{4}$/
