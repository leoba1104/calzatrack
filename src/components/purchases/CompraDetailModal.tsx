import { useState } from 'react'
import jsPDF from 'jspdf'
import { Loader2, Printer } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { formatCRC, formatDate, cn } from '@/lib/utils'
import type { Compra, DetalleCompra } from '@/types'

// jsPDF uses WinAnsi encoding (Helvetica) — ₡ (U+20A1) is not supported.
// Use ASCII-safe "CRC" prefix with en-US comma separators for the PDF only.
function pdfCRC(n: number) {
  return 'CRC ' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

// ── PDF generation ────────────────────────────────────────────────────────────

async function fetchImageAsBase64(url: string): Promise<{ data: string; format: string } | null> {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    if (blob.type === 'application/pdf') return null // can't embed PDF-in-PDF
    const format = blob.type.includes('png') ? 'PNG' : 'JPEG'
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload  = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    return { data, format }
  } catch {
    return null
  }
}

function getImageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => resolve({ w: 1, h: 1 })
    img.src = dataUrl
  })
}

async function downloadPDF(compra: Compra) {
  const proveedor = (compra.proveedor as { nombre_empresa: string } | undefined)?.nombre_empresa ?? '—'
  const items = (compra.items ?? []) as unknown as (DetalleCompra & {
    variante?: { sku: string; talla: string | null; color: string | null } | null
    producto?: { nombre: string } | null
  })[]

  const pdf  = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
  const PW   = 210   // page width mm
  const ML   = 20    // margin left
  const MR   = 20    // margin right
  const CW   = PW - ML - MR  // content width = 170mm
  let y = 18

  // ── Header ────────────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(18)
  pdf.setTextColor(30, 30, 30)
  pdf.text('Factura de compra', ML, y)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(130, 130, 130)
  y += 6
  pdf.text(
    `CalzaTrack · generado el ${new Date().toLocaleDateString('es-CR', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    ML, y
  )

  // divider
  y += 5
  pdf.setDrawColor(220, 220, 220)
  pdf.line(ML, y, ML + CW, y)
  y += 8

  // ── Summary grid ─────────────────────────────────────────────────────────
  const col1 = ML
  const col2 = ML + CW / 2

  function field(label: string, value: string, x: number, yPos: number) {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(150, 150, 150)
    pdf.text(label.toUpperCase(), x, yPos)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.setTextColor(30, 30, 30)
    pdf.text(value, x, yPos + 5)
  }

  field('Proveedor',         proveedor,                                 col1, y)
  field('N.° factura',       compra.numero_factura_proveedor ?? '—',    col2, y)
  y += 14
  field('Fecha',             formatDate(compra.fecha),                  col1, y)
  field('Estado',            compra.estado.charAt(0).toUpperCase() + compra.estado.slice(1), col2, y)
  y += 14

  pdf.setDrawColor(220, 220, 220)
  pdf.line(ML, y, ML + CW, y)
  y += 8

  // ── Invoice image ─────────────────────────────────────────────────────────
  if (compra.factura_imagen_url) {
    const img = await fetchImageAsBase64(compra.factura_imagen_url)
    if (img) {
      const { w, h } = await getImageSize(img.data)
      const MAX_W = CW
      const MAX_H = 80
      const ratio  = w / h
      let imgW = MAX_W
      let imgH = imgW / ratio
      if (imgH > MAX_H) { imgH = MAX_H; imgW = imgH * ratio }

      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.setTextColor(150, 150, 150)
      pdf.text('IMAGEN DE LA FACTURA ORIGINAL', ML, y)
      y += 4
      pdf.addImage(img.data, img.format, ML, y, imgW, imgH)
      y += imgH + 8
      pdf.setDrawColor(220, 220, 220)
      pdf.line(ML, y, ML + CW, y)
      y += 8
    }
  }

  // ── Products table ────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(150, 150, 150)
  pdf.text('PRODUCTOS', ML, y)
  y += 5

  // Table columns (all mm from left page edge)
  const colDesc = ML        // 20 — left-aligned text start
  const colQty  = ML + 95   // 115 — center anchor for quantity
  const colUnit = ML + 135  // 155 — right anchor for unit cost
  const colSub  = ML + CW   // 190 — right anchor for subtotal

  pdf.setFillColor(245, 243, 255)
  pdf.rect(ML, y, CW, 7, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.setTextColor(107, 33, 168)
  pdf.text('DESCRIPCION',  colDesc + 2, y + 5)
  pdf.text('CANT.',        colQty,      y + 5, { align: 'center' })
  pdf.text('COSTO UNIT.',  colUnit,     y + 5, { align: 'right' })
  pdf.text('SUBTOTAL',     colSub,      y + 5, { align: 'right' })
  y += 9

  // Table rows
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  for (const it of items) {
    const desc = it.descripcion ?? it.variante?.sku ?? it.producto?.nombre ?? '—'
    const lines = pdf.splitTextToSize(desc, colQty - colDesc - 4)

    // check page break
    const rowH = Math.max(7, lines.length * 5)
    if (y + rowH > 270) {
      pdf.addPage()
      y = 20
    }

    pdf.setTextColor(40, 40, 40)
    pdf.text(lines,                     colDesc + 2, y + 5)
    pdf.setTextColor(100, 100, 100)
    pdf.text(String(it.cantidad),       colQty,      y + 5, { align: 'center' })
    pdf.text(pdfCRC(it.costo_unitario), colUnit,     y + 5, { align: 'right' })
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(40, 40, 40)
    pdf.text(pdfCRC(it.subtotal),                    colSub,       y + 5, { align: 'right' })
    pdf.setFont('helvetica', 'normal')

    y += rowH
    pdf.setDrawColor(240, 240, 240)
    pdf.line(ML, y, ML + CW, y)
  }

  // ── Total ─────────────────────────────────────────────────────────────────
  y += 5
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(12)
  pdf.setTextColor(30, 30, 30)
  pdf.text(`Total: ${pdfCRC(compra.total_pagado)}`, ML + CW, y, { align: 'right' })

  // ── Notes ─────────────────────────────────────────────────────────────────
  if (compra.notas) {
    y += 10
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(100, 100, 100)
    pdf.text(`Notas: ${compra.notas}`, ML, y)
  }

  const filename = `compra-${compra.numero_factura_proveedor ?? compra.id.slice(0, 8)}.pdf`
  pdf.save(filename)
}

// ── Component ─────────────────────────────────────────────────────────────────

interface CompraDetailModalProps {
  compra: Compra | null
  isOpen: boolean
  onClose: () => void
}

const estadoBadge: Record<Compra['estado'], string> = {
  pendiente: 'bg-amber-100 text-amber-700',
  recibida:  'bg-green-100 text-green-700',
  anulada:   'bg-red-100 text-red-600',
}
const estadoLabel: Record<Compra['estado'], string> = {
  pendiente: 'Pendiente',
  recibida:  'Recibida',
  anulada:   'Anulada',
}

export function CompraDetailModal({ compra, isOpen, onClose }: CompraDetailModalProps) {
  const [downloading, setDownloading] = useState(false)

  if (!compra) return null

  const proveedor = (compra.proveedor as { nombre_empresa: string } | undefined)?.nombre_empresa
  const items = (compra.items ?? []) as unknown as (DetalleCompra & {
    variante?: { sku: string; talla: string | null; color: string | null } | null
    producto?: { nombre: string } | null
  })[]

  async function handleDownload() {
    setDownloading(true)
    try {
      await downloadPDF(compra!)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Detalle de compra" size="xl">
      <div className="flex flex-col max-h-[80vh]">

        {/* Header summary */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 grid grid-cols-2 gap-x-8 gap-y-3">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Proveedor</p>
            <p className="text-sm font-semibold text-gray-900 mt-0.5">{proveedor ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">N.° factura</p>
            <p className="text-sm font-mono text-gray-700 mt-0.5">{compra.numero_factura_proveedor ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Fecha</p>
            <p className="text-sm text-gray-700 mt-0.5">{formatDate(compra.fecha)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Estado</p>
            <span className={cn('inline-flex mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium', estadoBadge[compra.estado])}>
              {estadoLabel[compra.estado]}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Invoice image — view only */}
          {compra.factura_imagen_url && (
            <div className="px-6 py-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Factura original</p>
              <a href={compra.factura_imagen_url} target="_blank" rel="noreferrer">
                <img
                  src={compra.factura_imagen_url}
                  alt="Factura original"
                  className="max-h-52 rounded-xl border border-gray-200 object-contain hover:opacity-90 transition-opacity cursor-zoom-in"
                />
              </a>
            </div>
          )}

          {/* Line items */}
          <div className="px-6 py-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Productos</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400">
                  <th className="text-left pb-2 font-medium">Descripción</th>
                  <th className="text-center pb-2 font-medium w-20">Cant.</th>
                  <th className="text-right pb-2 font-medium w-28">Costo unit.</th>
                  <th className="text-right pb-2 font-medium w-28">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((it) => {
                  const desc = it.descripcion ?? it.variante?.sku ?? it.producto?.nombre ?? '—'
                  return (
                    <tr key={it.id}>
                      <td className="py-2.5 pr-4">
                        <p className="font-medium text-gray-800">{desc}</p>
                        {it.variante && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono text-xs text-brand-700 bg-brand-50 px-1 rounded">{it.variante.sku}</span>
                            {it.variante.talla && <span className="text-xs text-gray-400">T.{it.variante.talla}</span>}
                            {it.variante.color && <span className="text-xs text-gray-400">· {it.variante.color}</span>}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 text-center text-gray-600">{it.cantidad}</td>
                      <td className="py-2.5 text-right text-gray-600">{formatCRC(it.costo_unitario)}</td>
                      <td className="py-2.5 text-right font-semibold text-gray-800">{formatCRC(it.subtotal)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="flex justify-end mt-3 pt-3 border-t border-gray-100">
              <div className="text-right">
                <p className="text-xs text-gray-400">Total pagado</p>
                <p className="text-xl font-bold text-gray-900">{formatCRC(compra.total_pagado)}</p>
              </div>
            </div>
            {compra.notas && (
              <div className="mt-3 p-3 bg-gray-50 rounded-xl text-xs text-gray-600 italic">
                &ldquo;{compra.notas}&rdquo;
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors bg-white disabled:opacity-60"
          >
            {downloading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando PDF...</>
              : <><Printer className="w-4 h-4" /> Descargar PDF</>
            }
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </Modal>
  )
}
