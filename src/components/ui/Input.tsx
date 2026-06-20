import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'w-full px-3.5 py-2.5 text-sm rounded-xl border outline-none transition-all',
          'placeholder:text-gray-400',
          'focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500',
          'disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed',
          error
            ? 'border-red-300 bg-red-50/50 focus:border-red-400 focus:ring-red-200/50'
            : 'border-gray-200 bg-white hover:border-gray-300',
          className
        )}
        {...props}
      />
    )
  }
)

Input.displayName = 'Input'
