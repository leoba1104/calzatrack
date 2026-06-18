import { Printer } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { formatCRC, formatDate, cn } from '@/lib/utils'
import type { Compra, DetalleCompra } from '@/types'

// ── PDF / Print ───────────────────────────────────────────────────────────────

function printCompra(compra: Compra) {
  const proveedor = (compra.proveedor as { nombre_empresa: string } | undefined)?.nombre_empresa ?? '—'
  const items     = (compra.items ?? []) as unknown as (DetalleCompra & {
    variante?: { sku: string; talla: string | null; color: string | null } | null
    producto?: { nombre: string } | null
  })[]

  const rows = items.map((it) => {
    const desc = it.descripcion ?? it.variante?.sku ?? it.producto?.nombre ?? '—'
    return `
      <tr>
        <td>${desc}</td>
        <td style="text-align:center">${it.cantidad}</td>
        <td style="text-align:right">₡${it.costo_unitario.toLocaleString('es-CR')}</td>
        <td style="text-align:right">₡${it.subtotal.toLocaleString('es-CR')}</td>
      </tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Compra ${compra.numero_factura_proveedor ?? compra.id.slice(0, 8)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', Arial, sans-serif; color: #111; padding: 40px; font-size: 13px; }
    h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
    .sub { color: #666; font-size: 12px; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    .field label { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #999; }
    .field p { font-size: 13px; font-weight: 600; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #f5f3ff; text-align: left; padding: 8px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #6b21a8; }
    td { padding: 8px 10px; border-bottom: 1px solid #f0f0f0; }
    .total { text-align: right; font-size: 15px; font-weight: 700; margin-top: 8px; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 11px; font-weight: 600;
             background: ${compra.estado === 'recibida' ? '#dcfce7' : compra.estado === 'anulada' ? '#fee2e2' : '#fef9c3'};
             color: ${compra.estado === 'recibida' ? '#166534' : compra.estado === 'anulada' ? '#991b1b' : '#854d0e'}; }
    .notes { margin-top: 16px; padding: 12px; background: #fafafa; border-radius: 8px; font-size: 12px; color: #555; }
  </style>
</head>
<body>
  <h1>Factura de compra</h1>
  <p class="sub">CalzaTrack — generado el ${new Date().toLocaleDateString('es-CR', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
  <div class="grid">
    <div class="field"><label>Proveedor</label><p>${proveedor}</p></div>
    <div class="field"><label>N.° factura proveedor</label><p>${compra.numero_factura_proveedor ?? '—'}</p></div>
    <div class="field"><label>Fecha</label><p>${formatDate(compra.fecha)}</p></div>
    <div class="field"><label>Estado</label><p><span class="badge">${compra.estado.charAt(0).toUpperCase() + compra.estado.slice(1)}</span></p></div>
  </div>
  <table>
    <thead><tr><th>Descripción</th><th style="text-align:center">Cant.</th><th style="text-align:right">Costo unit.</th><th style="text-align:right">Subtotal</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="total">Total: ₡${compra.total_pagado.toLocaleString('es-CR')}</p>
  ${compra.notas ? `<div class="notes"><strong>Notas:</strong> ${compra.notas}</div>` : ''}
</body>
</html>`

  const win = window.open('', '_blank')
  if (!win) { alert('Activa las ventanas emergentes para imprimir'); return }
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 400)
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
  if (!compra) return null

  const proveedor = (compra.proveedor as { nombre_empresa: string } | undefined)?.nombre_empresa
  const items = (compra.items ?? []) as unknown as (DetalleCompra & {
    variante?: { sku: string; talla: string | null; color: string | null } | null
    producto?: { nombre: string } | null
  })[]

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
            onClick={() => printCompra(compra)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors bg-white"
          >
            <Printer className="w-4 h-4" />
            Descargar PDF
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </Modal>
  )
}
