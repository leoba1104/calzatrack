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
    'w-full px-3.5 py-2.5 text-sm rounded-xl border outline-none transition-all',
    'placeholder:text-gray-400',
    'focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500',
    'disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed',
    hasError
      ? 'border-red-300 bg-red-50/50 focus:border-red-400 focus:ring-red-200/50'
      : 'border-gray-200 bg-white hover:border-gray-300'
  )
