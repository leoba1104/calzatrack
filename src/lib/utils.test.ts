import { describe, it, expect } from 'vitest'
import { cn, formatCRC, formatDate, formatDateTime } from './utils'

describe('cn', () => {
  it('combina clases condicionales', () => {
    expect(cn('a', false && 'b', 'c')).toBe('a c')
  })

  it('resuelve conflictos de Tailwind dejando la última', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })
})

describe('formatCRC', () => {
  it('formatea colones sin decimales', () => {
    const result = formatCRC(35000)
    expect(result).toContain('₡')
    // Intl usa espacios no estándar como separador de miles — comparar solo dígitos
    expect(result.replace(/\D/g, '')).toBe('35000')
  })

  it('redondea a entero', () => {
    expect(formatCRC(4550.4).replace(/\D/g, '')).toBe('4550')
  })

  it('formatea cero', () => {
    expect(formatCRC(0).replace(/\D/g, '')).toBe('0')
  })
})

describe('formatDate', () => {
  it('formatea una fecha ISO en es-CR', () => {
    const result = formatDate('2026-07-13T12:00:00Z')
    expect(result).toContain('2026')
    expect(result.toLowerCase()).toContain('jul')
  })
})

describe('formatDateTime', () => {
  it('incluye la hora', () => {
    const result = formatDateTime('2026-07-13T18:30:00')
    expect(result).toContain('2026')
    expect(result).toMatch(/\d{1,2}:\d{2}/)
  })
})
