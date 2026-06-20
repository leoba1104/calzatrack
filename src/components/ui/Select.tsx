import { forwardRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean
  wrapperClassName?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ error, wrapperClassName, className, children, ...props }, ref) => {
    return (
      <div className={cn('relative', wrapperClassName)}>
        <select
          ref={ref}
          className={cn(
            'w-full pl-3.5 pr-9 py-2.5 text-sm rounded-xl border outline-none transition-all appearance-none',
            'focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500',
            'disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed',
            error
              ? 'border-red-300 bg-red-50/50 focus:border-red-400 focus:ring-red-200/50'
              : 'border-gray-200 bg-white hover:border-gray-300',
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      </div>
    )
  }
)

Select.displayName = 'Select'
