// ESC/POS receipt builder for 58mm thermal printers (32 chars/line at standard font)

const COLS = 32

export interface ReceiptData {
  storeName:      string
  storeAddress?:  string
  ventaNumero:    string
  fecha:          Date
  tipo:           string
  vendedorNombre?: string
  items: Array<{
    display:         string
    cantidad:        number
    precioUnitario:  number
  }>
  subtotal:     number
  descuento:    number
  descuentoPct: number
  total:        number
  metodoPago?:  string
}

// Business WhatsApp contact — printed as a scannable QR on every invoice
const WHATSAPP_NUMBER = '85474606'
const WHATSAPP_URL    = `https://wa.me/506${WHATSAPP_NUMBER}`

// ── ESC/POS constants ─────────────────────────────────────────────────────────
const ESC = 0x1B
const GS  = 0x1D
const LF  = 0x0A

const CMD_INIT     = [ESC, 0x40]
// Selects codepage 2 (PC850 Multilingual) — thermal printers render each byte per
// their active codepage table, not UTF-8, so raw UTF-8 bytes garble accented chars.
// PC850 is part of the base ESC/POS spec and supported by virtually every printer.
const CMD_CODEPAGE = [ESC, 0x74, 0x02]
const CMD_ALIGN_L  = [ESC, 0x61, 0x00]
const CMD_ALIGN_C  = [ESC, 0x61, 0x01]
const CMD_BOLD_ON  = [ESC, 0x45, 0x01]
const CMD_BOLD_OFF = [ESC, 0x45, 0x00]
const CMD_CUT      = [LF, LF, LF, GS, 0x56, 0x41, 0x03]

// ── Helpers ───────────────────────────────────────────────────────────────────

// Spanish accented characters + punctuation mapped to their PC850 byte value
// (PC850 does not share Unicode code points, unlike Latin-1/CP1252).
const CP850_MAP: Record<string, number> = {
  á: 0xA0, é: 0x82, í: 0xA1, ó: 0xA2, ú: 0xA3, ñ: 0xA4, ü: 0x81,
  Á: 0xB5, É: 0x90, Í: 0xD6, Ó: 0xE0, Ú: 0xE9, Ñ: 0xA5, Ü: 0x9A,
  '¿': 0xA8, '¡': 0xAD, ª: 0xA6, º: 0xA7,
}

function enc(s: string): number[] {
  const out: number[] = []
  for (const ch of s) {
    out.push(ch.charCodeAt(0) <= 0x7F ? ch.charCodeAt(0) : (CP850_MAP[ch] ?? 0x3F))
  }
  return out
}

function row(s: string): number[] { return [...enc(s), LF] }

function divider(char = '-'): number[] { return row(char.repeat(COLS)) }

// Pads left and right content to fill COLS with spaces between them
function split(left: string, right: string): number[] {
  const spaces = Math.max(1, COLS - left.length - right.length)
  return row(left + ' '.repeat(spaces) + right)
}

// Centers a string within COLS
function centered(s: string): number[] {
  const pad = Math.max(0, Math.floor((COLS - s.length) / 2))
  return row(' '.repeat(pad) + s)
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 2) + '..' : s
}

// Uses dot as thousands separator (es-CR convention), no decimals
function money(n: number): string {
  return 'CR ' + Math.round(n).toLocaleString('es-CR', { maximumFractionDigits: 0 })
}

// GS ( k — 2D symbol (QR code) commands, standard on ESC/POS-compatible printers
const QR_CN = 0x31 // '1', fixed function-type byte for all QR sub-commands

function qrSetModel(): number[] {
  return [GS, 0x28, 0x6B, 0x04, 0x00, QR_CN, 0x41, 0x32, 0x00] // model 2
}

function qrSetModuleSize(size: number): number[] {
  return [GS, 0x28, 0x6B, 0x03, 0x00, QR_CN, 0x43, size]
}

function qrSetErrorCorrection(): number[] {
  return [GS, 0x28, 0x6B, 0x03, 0x00, QR_CN, 0x45, 0x31] // level M (~15%)
}

function qrStoreData(data: string): number[] {
  const payload = enc(data)
  const len = payload.length + 3 // cn + fn + m
  return [GS, 0x28, 0x6B, len & 0xFF, (len >> 8) & 0xFF, QR_CN, 0x50, 0x30, ...payload]
}

function qrPrint(): number[] {
  return [GS, 0x28, 0x6B, 0x03, 0x00, QR_CN, 0x51, 0x30]
}

function qrCode(data: string, moduleSize = 5): number[] {
  return [
    ...qrSetModel(),
    ...qrSetModuleSize(moduleSize),
    ...qrSetErrorCorrection(),
    ...qrStoreData(data),
    ...qrPrint(),
  ]
}

const PAGO_LABELS: Record<string, string> = {
  efectivo:      'Efectivo',
  tarjeta:       'Tarjeta',
  sinpe:         'SINPE Movil',
  transferencia: 'Transferencia',
  otro:          'Otro',
}

const TIPO_LABELS: Record<string, string> = {
  contado:  'Venta normal',
  apartado: 'Apartado',
  credito:  'Credito',
}

export interface CierreReceiptData {
  storeName:          string
  fechaLabel:         string
  esPrimerCierre:     boolean
  desdeHora:          string | null
  efectivo:           number
  tarjeta:            number
  sinpe:              number
  transferencia:      number
  otro:               number
  totalContado:       number
  totalApartados:     number
  totalCreditos:      number
  totalDia:           number
  categorias:         Array<{ nombre: string; total: number }>
  empleados:          Array<{ nombre: string; total: number }>
  paresVendidos:      number
  apartadosAbiertos:  number
  creditosAbiertos:   number
  notas?:             string
}

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildReceipt(data: ReceiptData): Uint8Array {
  const bytes: number[] = []
  const p = (...chunks: number[][]) => chunks.forEach(c => bytes.push(...c))

  const dateStr = data.fecha.toLocaleDateString('es-CR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
  const timeStr = data.fecha.toLocaleTimeString('es-CR', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  })

  // Init
  p(CMD_INIT)
  p(CMD_CODEPAGE)

  // Store name (centered, bold) + address
  p(CMD_ALIGN_C)
  p(CMD_BOLD_ON)
  for (const line of data.storeName.split('\n')) p(centered(line))
  p(CMD_BOLD_OFF)
  if (data.storeAddress) p(centered(data.storeAddress))
  p(divider('='))

  // Meta
  p(CMD_ALIGN_L)
  p(row(`N: ${data.ventaNumero}`))
  p(split(dateStr, timeStr))
  p(row(TIPO_LABELS[data.tipo] ?? data.tipo))
  if (data.vendedorNombre) p(row(`Atiende: ${truncate(data.vendedorNombre, COLS - 9)}`))
  p(divider())

  // Line items
  for (const item of data.items) {
    const name    = truncate(item.display, COLS)
    const qtyLine = `  ${item.cantidad} x ${money(item.precioUnitario)}`
    const total   = money(item.cantidad * item.precioUnitario)
    p(row(name))
    p(split(qtyLine, total))
  }

  p(divider())

  // Totals
  if (data.descuento > 0) {
    p(split('Subtotal:', money(data.subtotal)))
    p(split(`Desc (${data.descuentoPct}%):`, `-${money(data.descuento)}`))
    p(divider())
  }

  p(CMD_BOLD_ON)
  p(split('TOTAL:', money(data.total)))
  p(CMD_BOLD_OFF)
  p(divider('='))

  // Payment method
  if (data.metodoPago) {
    const label = PAGO_LABELS[data.metodoPago] ?? data.metodoPago
    p(row(`Pago: ${label}`))
    p(divider('='))
  }

  // Footer
  p(CMD_ALIGN_C)
  p(centered('Gracias por su compra!'))
  p(row(''))
  p(centered('Escribenos por WhatsApp'))
  p(qrCode(WHATSAPP_URL))
  p(row(''))
  p(centered(WHATSAPP_NUMBER.replace(/(\d{4})(\d{4})/, '$1-$2')))
  p(divider('='))
  p(CMD_ALIGN_L)

  // Feed + cut
  p(CMD_CUT)

  return new Uint8Array(bytes)
}

export function buildCierreReceipt(data: CierreReceiptData): Uint8Array {
  const bytes: number[] = []
  const p = (...chunks: number[][]) => chunks.forEach(c => bytes.push(...c))

  // Init
  p(CMD_INIT)
  p(CMD_CODEPAGE)

  // Store name (centered, bold)
  p(CMD_ALIGN_C)
  p(CMD_BOLD_ON)
  for (const line of data.storeName.split('\n')) p(centered(line))
  p(centered('CIERRE DE CAJA'))
  p(CMD_BOLD_OFF)
  p(divider('='))

  // Meta
  p(CMD_ALIGN_L)
  p(row(data.fechaLabel))
  p(row(data.esPrimerCierre ? 'Periodo: dia completo' : `Periodo: desde ${data.desdeHora}`))
  p(divider())

  // By payment method
  const metodos: Array<[string, number]> = [
    ['Efectivo',      data.efectivo],
    ['Tarjeta',       data.tarjeta],
    ['SINPE Movil',   data.sinpe],
    ['Transferencia', data.transferencia],
    ['Otro',          data.otro],
  ]
  const metodosConValor = metodos.filter(([, v]) => v > 0)
  if (metodosConValor.length) {
    p(row('Por metodo de pago:'))
    for (const [label, value] of metodosConValor) p(split(`  ${label}`, money(value)))
    p(divider())
  }

  // Contado by category
  if (data.categorias.length) {
    p(row(`Ventas normales: ${money(data.totalContado)}`))
    for (const cat of data.categorias) p(split(`  ${cat.nombre}`, money(cat.total)))
    p(divider())
  }

  // Apartados / creditos
  if (data.totalApartados > 0 || data.totalCreditos > 0) {
    p(row('Abonos recibidos:'))
    if (data.totalApartados > 0) p(split('  Apartados', money(data.totalApartados)))
    if (data.totalCreditos > 0)  p(split('  Creditos',  money(data.totalCreditos)))
    p(divider())
  }

  // By employee
  if (data.empleados.length) {
    p(row('Por empleado:'))
    for (const emp of data.empleados) p(split(`  ${truncate(emp.nombre, COLS - 2)}`, money(emp.total)))
    p(divider())
  }

  // Counters
  p(split('Pares vendidos:', String(data.paresVendidos)))
  p(split('Apartados abiertos:', String(data.apartadosAbiertos)))
  p(split('Creditos abiertos:', String(data.creditosAbiertos)))
  p(divider())

  // Total
  p(CMD_BOLD_ON)
  p(split('TOTAL:', money(data.totalDia)))
  p(CMD_BOLD_OFF)
  p(divider('='))

  // Notes
  if (data.notas) {
    p(row('Notas:'))
    p(row(data.notas))
    p(divider('='))
  }

  // Feed + cut
  p(CMD_CUT)

  return new Uint8Array(bytes)
}
