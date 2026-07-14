import { describe, it, expect } from 'vitest'
import { buildReceipt, buildCierreReceipt, type ReceiptData, type CierreReceiptData } from './escpos'

const ESC = 0x1b
const GS = 0x1d

function bytesIncludeAscii(bytes: Uint8Array, text: string): boolean {
  const needle = Array.from(text, (ch) => ch.charCodeAt(0))
  outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle[j]) continue outer
    }
    return true
  }
  return false
}

const receiptBase: ReceiptData = {
  storeName: 'Zapateria Mariana',
  ventaNumero: 'MAR-00042',
  fecha: new Date('2026-07-13T14:30:00'),
  tipo: 'contado',
  items: [
    { display: 'Tenis Clasico Blanco T38', cantidad: 2, precioUnitario: 35000 },
  ],
  subtotal: 70000,
  descuento: 7000,
  descuentoPct: 10,
  total: 63000,
  metodoPago: 'efectivo',
}

describe('buildReceipt', () => {
  it('inicia con ESC @ (init) y termina con corte de papel', () => {
    const bytes = buildReceipt(receiptBase)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect([bytes[0], bytes[1]]).toEqual([ESC, 0x40])
    // GS V A 3 al final = corte de papel
    expect(bytes[bytes.length - 4]).toBe(GS)
    expect(bytes[bytes.length - 3]).toBe(0x56)
  })

  it('incluye el número de venta y el nombre de la tienda', () => {
    const bytes = buildReceipt(receiptBase)
    expect(bytesIncludeAscii(bytes, 'MAR-00042')).toBe(true)
    expect(bytesIncludeAscii(bytes, 'Zapateria Mariana')).toBe(true)
  })

  it('codifica caracteres acentuados como PC850, no UTF-8', () => {
    const bytes = buildReceipt({ ...receiptBase, storeName: 'Peña' })
    // ñ → 0xA4 en PC850; en UTF-8 serían dos bytes (0xC3 0xB1)
    expect(bytesIncludeAscii(bytes, 'Pe')).toBe(true)
    expect(Array.from(bytes)).toContain(0xa4)
    expect(bytesIncludeAscii(bytes, 'PeÃ')).toBe(false)
  })

  it('nunca emite bytes fuera de rango 0-255', () => {
    const bytes = buildReceipt({ ...receiptBase, storeName: 'Tienda 日本 ✓' })
    for (const b of bytes) {
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThanOrEqual(255)
    }
  })
})

const cierreBase: CierreReceiptData = {
  storeName: 'Zapateria Dali',
  fechaLabel: 'lunes 13 de julio de 2026',
  esPrimerCierre: true,
  desdeHora: null,
  efectivo: 100000,
  tarjeta: 50000,
  sinpe: 25000,
  transferencia: 0,
  otro: 0,
  totalContado: 150000,
  totalApartados: 15000,
  totalCreditos: 10000,
  totalDia: 175000,
  categorias: [{ nombre: 'Hombre', total: 80000 }],
  empleados: [{ nombre: 'Mariana Gonzalez', total: 175000 }],
  paresVendidos: 12,
  apartadosAbiertos: 3,
  creditosAbiertos: 1,
}

describe('buildCierreReceipt', () => {
  it('genera un tiquete válido con los totales', () => {
    const bytes = buildCierreReceipt(cierreBase)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect([bytes[0], bytes[1]]).toEqual([ESC, 0x40])
    expect(bytesIncludeAscii(bytes, 'Zapateria Dali')).toBe(true)
  })

  it('incluye el breakdown de empleados', () => {
    const bytes = buildCierreReceipt(cierreBase)
    expect(bytesIncludeAscii(bytes, 'Mariana Gonzalez')).toBe(true)
  })
})
