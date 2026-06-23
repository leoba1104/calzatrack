// ESC/POS receipt builder for 58mm thermal printers (32 chars/line at standard font)

const COLS = 32

export interface ReceiptData {
  storeName:    string
  ventaNumero:  string
  fecha:        Date
  tipo:         string
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

// ── ESC/POS constants ─────────────────────────────────────────────────────────
const ESC = 0x1B
const GS  = 0x1D
const LF  = 0x0A

const CMD_INIT     = [ESC, 0x40]
const CMD_ALIGN_L  = [ESC, 0x61, 0x00]
const CMD_ALIGN_C  = [ESC, 0x61, 0x01]
const CMD_BOLD_ON  = [ESC, 0x45, 0x01]
const CMD_BOLD_OFF = [ESC, 0x45, 0x00]
const CMD_CUT      = [LF, LF, LF, GS, 0x56, 0x41, 0x03]

// ── Helpers ───────────────────────────────────────────────────────────────────

function enc(s: string): number[] {
  return Array.from(new TextEncoder().encode(s))
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

  // Store name (centered, bold)
  p(CMD_ALIGN_C)
  p(CMD_BOLD_ON)
  for (const line of data.storeName.split('\n')) p(centered(line))
  p(CMD_BOLD_OFF)
  p(divider('='))

  // Meta
  p(CMD_ALIGN_L)
  p(row(`N: ${data.ventaNumero}`))
  p(split(dateStr, timeStr))
  p(row(TIPO_LABELS[data.tipo] ?? data.tipo))
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
  p(divider('='))
  p(CMD_ALIGN_L)

  // Feed + cut
  p(CMD_CUT)

  return new Uint8Array(bytes)
}
