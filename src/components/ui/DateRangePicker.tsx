import { useState, useRef, useEffect } from 'react'
import {
  format, parse, isValid, isToday, isSameDay, isWithinInterval,
  startOfMonth, endOfMonth, eachDayOfInterval, isBefore, isAfter,
  addMonths, subMonths, getDay,
  startOfWeek, endOfWeek, startOfDay, endOfDay, subDays,
  startOfMonth as soM, endOfMonth as eoM,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DateRange {
  from: string | null  // YYYY-MM-DD
  to:   string | null  // YYYY-MM-DD
}

interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
  placeholder?: string
  className?: string
}

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

function parseDate(s: string | null): Date | null {
  if (!s) return null
  const d = parse(s, 'yyyy-MM-dd', new Date())
  return isValid(d) ? d : null
}

type Preset = { label: string; range: DateRange }

function getPresets(): Preset[] {
  const today = new Date()
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
  return [
    { label: 'Hoy',        range: { from: fmt(today),         to: fmt(today) } },
    { label: '7 días',     range: { from: fmt(subDays(today, 6)), to: fmt(today) } },
    { label: '30 días',    range: { from: fmt(subDays(today, 29)), to: fmt(today) } },
    { label: 'Este mes',   range: { from: fmt(soM(today)),    to: fmt(eoM(today)) } },
    { label: 'Mes pasado', range: { from: fmt(soM(subMonths(today, 1))), to: fmt(eoM(subMonths(today, 1))) } },
  ]
}

export function DateRangePicker({ value, onChange, placeholder = 'Filtrar por fecha', className }: DateRangePickerProps) {
  const [open, setOpen]         = useState(false)
  const [hovered, setHovered]   = useState<Date | null>(null)
  const [viewDate, setViewDate] = useState<Date>(new Date())
  const [selecting, setSelecting] = useState<'from' | 'to'>('from')
  const containerRef = useRef<HTMLDivElement>(null)

  const fromDate = parseDate(value.from)
  const toDate   = parseDate(value.to)

  const hasRange = fromDate && toDate
  const hasFrom  = !!fromDate

  // Label for the trigger button
  const triggerLabel = (() => {
    if (fromDate && toDate && isSameDay(fromDate, toDate)) {
      return format(fromDate, "d 'de' MMMM yyyy", { locale: es })
    }
    if (fromDate && toDate) {
      return `${format(fromDate, 'd MMM', { locale: es })} → ${format(toDate, 'd MMM yyyy', { locale: es })}`
    }
    if (fromDate) {
      return `${format(fromDate, "d 'de' MMMM yyyy", { locale: es })} → ...`
    }
    return null
  })()

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        // If only from is set, clear it
        if (value.from && !value.to) onChange({ from: null, to: null })
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [value, onChange])

  // Reset selecting state when opening
  function handleOpen() {
    if (value.from && value.to) {
      setSelecting('from')
    } else {
      setSelecting('from')
    }
    setOpen((o) => !o)
  }

  function handleDayClick(day: Date) {
    if (selecting === 'from' || !hasFrom) {
      onChange({ from: format(day, 'yyyy-MM-dd'), to: null })
      setSelecting('to')
    } else {
      // Ensure from <= to
      if (fromDate && isBefore(day, fromDate)) {
        onChange({ from: format(day, 'yyyy-MM-dd'), to: value.from })
      } else {
        onChange({ from: value.from, to: format(day, 'yyyy-MM-dd') })
      }
      setSelecting('from')
      setOpen(false)
    }
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange({ from: null, to: null })
    setSelecting('from')
  }

  function applyPreset(preset: Preset) {
    onChange(preset.range)
    setSelecting('from')
    setOpen(false)
  }

  // Calendar days
  const days     = eachDayOfInterval({ start: startOfMonth(viewDate), end: endOfMonth(viewDate) })
  const startPad = (getDay(startOfMonth(viewDate)) + 6) % 7

  function getDayState(day: Date) {
    const isFrom = fromDate && isSameDay(day, fromDate)
    const isTo   = toDate   && isSameDay(day, toDate)

    const inRange = (() => {
      if (fromDate && toDate) {
        return isWithinInterval(day, { start: fromDate, end: toDate }) && !isFrom && !isTo
      }
      if (fromDate && hovered && !toDate) {
        const [lo, hi] = isBefore(hovered, fromDate) ? [hovered, fromDate] : [fromDate, hovered]
        return isWithinInterval(day, { start: lo, end: hi }) && !isSameDay(day, fromDate) && !isSameDay(day, hovered)
      }
      return false
    })()

    const isHoverEnd = !toDate && hovered && isSameDay(day, hovered) && fromDate && !isSameDay(day, fromDate)

    return { isFrom, isTo, inRange, isHoverEnd, isToday: isToday(day) }
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          'flex items-center gap-2 px-3 py-2 text-sm border rounded-xl transition-all outline-none',
          'bg-white hover:border-gray-300',
          open ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-gray-200',
          triggerLabel ? 'text-gray-900 pr-2' : 'text-gray-400',
        )}
      >
        <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
        <span>{triggerLabel ?? placeholder}</span>
        {triggerLabel && (
          <button
            type="button"
            onClick={handleClear}
            className="ml-1 p-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1.5 bg-white rounded-2xl border border-gray-200 shadow-xl p-4 w-80">

          {/* Presets */}
          <div className="flex flex-wrap gap-1.5 mb-4 pb-3 border-b border-gray-100">
            {getPresets().map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset)}
                className="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Hint */}
          <p className="text-xs text-gray-400 mb-3">
            {selecting === 'from' ? 'Selecciona fecha de inicio' : 'Selecciona fecha de fin'}
          </p>

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
              <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} />)}
            {days.map((day) => {
              const { isFrom, isTo, inRange, isHoverEnd, isToday: todayDay } = getDayState(day)
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => handleDayClick(day)}
                  onMouseEnter={() => setHovered(day)}
                  onMouseLeave={() => setHovered(null)}
                  className={cn(
                    'w-9 h-9 mx-auto flex items-center justify-center text-sm transition-colors',
                    isFrom || isTo
                      ? 'bg-brand-600 text-white font-semibold rounded-lg hover:bg-brand-700'
                      : isHoverEnd
                      ? 'bg-brand-200 text-brand-800 font-semibold rounded-lg'
                      : inRange
                      ? 'bg-brand-50 text-brand-700 rounded-none'
                      : todayDay
                      ? 'bg-gray-100 text-gray-900 font-semibold rounded-lg hover:bg-gray-200'
                      : 'text-gray-700 rounded-lg hover:bg-gray-100',
                  )}
                >
                  {format(day, 'd')}
                </button>
              )
            })}
          </div>

          {/* Selected range summary */}
          {(fromDate || toDate) && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {fromDate && toDate
                  ? `${format(fromDate, 'd MMM', { locale: es })} → ${format(toDate, 'd MMM yyyy', { locale: es })}`
                  : fromDate
                  ? `Desde ${format(fromDate, "d 'de' MMMM", { locale: es })}`
                  : ''}
              </span>
              <button
                type="button"
                onClick={handleClear}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                Limpiar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
