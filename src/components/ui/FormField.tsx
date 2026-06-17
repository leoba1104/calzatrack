import { cn } from '@/lib/utils'

interface FormFieldProps {
  label: string
  error?: string
  required?: boolean
  children: React.ReactNode
  className?: string
}

export function FormField({ label, error, required, children, className }: FormFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

export const inputClass = (hasError?: boolean) =>
  cn(
    'w-full px-3 py-2 text-sm rounded-lg border outline-none transition-colors',
    'focus:ring-2 focus:ring-brand-500 focus:border-brand-500',
    hasError ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'
  )
