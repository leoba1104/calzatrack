import { useState, useRef, useEffect } from 'react'
import {
  format, parse, isValid, isToday, isSameDay,
  startOfMonth, endOfMonth, eachDayOfInterval,
  addMonths, subMonths, getDay,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// Week starts Monday: (getDay() + 6) % 7 → Mon=0 … Sun=6
const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export interface DatePickerProps {
  value: string                     // YYYY-MM-DD
  onChange: (date: string) => void
  error?: boolean
  disabled?: boolean
  placeholder?: string
  className?: string
}

export function DatePicker({
  value,
  onChange,
  error,
  disabled,
  placeholder = 'Seleccionar fecha',
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState<Date>(() => {
    if (value) {
      const d = parse(value, 'yyyy-MM-dd', new Date())
      if (isValid(d)) return d
    }
    return new Date()
  })
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined
  const hasSelection = selected && isValid(selected)

  // Sync view month when value changes externally
  useEffect(() => {
    if (value) {
      const d = parse(value, 'yyyy-MM-dd', new Date())
      if (isValid(d)) setViewDate(d)
    }
  }, [value])

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const days = eachDayOfInterval({
    start: startOfMonth(viewDate),
    end: endOfMonth(viewDate),
  })
  const startPad = (getDay(startOfMonth(viewDate)) + 6) % 7

  function handleDayClick(day: Date) {
    onChange(format(day, 'yyyy-MM-dd'))
    setOpen(false)
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger button — styled like Input */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          'w-full px-3.5 py-2.5 text-sm rounded-xl border outline-none transition-all',
          'flex items-center gap-2.5 text-left',
          'disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed',
          error
            ? 'border-red-300 bg-red-50/50'
            : open
            ? 'border-brand-500 ring-2 ring-brand-500/20 bg-white'
            : 'border-gray-200 bg-white hover:border-gray-300',
        )}
      >
        <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
        <span className={hasSelection ? 'text-gray-900' : 'text-gray-400'}>
          {hasSelection
            ? format(selected!, "d 'de' MMMM 'de' yyyy", { locale: es })
            : placeholder}
        </span>
      </button>

      {/* Dropdown calendar */}
      {open && (
        <div className="absolute z-50 mt-1.5 bg-white rounded-xl border border-gray-200 shadow-xl p-4 w-72">

          {/* Month navigation */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setViewDate((d) => subMonths(d, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-gray-800 capitalize">
              {format(viewDate, 'MMMM yyyy', { locale: es })}
            </span>
            <button
              type="button"
              onClick={() => setViewDate((d) => addMonths(d, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {Array.from({ length: startPad }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {days.map((day) => {
              const isSelected = hasSelection && isSameDay(day, selected!)
              const todayDay  = isToday(day)
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => handleDayClick(day)}
                  className={cn(
                    'w-9 h-9 mx-auto flex items-center justify-center rounded-lg text-sm transition-colors',
                    isSelected
                      ? 'bg-brand-600 text-white font-semibold hover:bg-brand-700'
                      : todayDay
                      ? 'bg-brand-50 text-brand-700 font-semibold hover:bg-brand-100'
                      : 'text-gray-700 hover:bg-gray-100',
                  )}
                >
                  {format(day, 'd')}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
