import { useState, useRef } from 'react'
import { Upload, Download, AlertCircle, CheckCircle2, Loader2, FileText } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'

// ── CSV parsing ──────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/['"]/g, ''))
  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line)
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']))
  })
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ParsedRow {
  nombre: string
  descripcion: string
  marca: string
  categoria: string
  precio_base: number
  sku: string
  talla: string
  color: string
  precio: number
  stock_inicial: number
  errors: string[]
}

interface ImportResult {
  inserted: number
  skipped: number
  errors: string[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function validateRow(raw: Record<string, string>): ParsedRow {
  const errors: string[] = []

  const nombre = raw['nombre']?.trim() ?? ''
  const sku = raw['sku']?.trim() ?? ''
  const precioRaw = parseFloat(raw['precio'] ?? '')
  const precioBaseRaw = parseFloat(raw['precio_base'] ?? '')
  const stockRaw = parseInt(raw['stock_inicial'] ?? '0', 10)

  if (!nombre) errors.push('nombre requerido')
  if (!sku) errors.push('sku requerido')
  if (isNaN(precioRaw) || precioRaw <= 0) errors.push('precio inválido')

  return {
    nombre,
    descripcion: raw['descripcion']?.trim() ?? '',
    marca: raw['marca']?.trim() ?? '',
    categoria: raw['categoria']?.trim() ?? '',
    precio_base: isNaN(precioBaseRaw) || precioBaseRaw <= 0 ? precioRaw : precioBaseRaw,
    sku,
    talla: raw['talla']?.trim() ?? '',
    color: raw['color']?.trim() ?? '',
    precio: precioRaw,
    stock_inicial: isNaN(stockRaw) || stockRaw < 0 ? 0 : stockRaw,
    errors,
  }
}

const TEMPLATE_CSV = [
  'nombre,descripcion,marca,categoria,precio_base,sku,talla,color,precio,stock_inicial',
  'Nike Air Max,Zapatilla deportiva,Nike,Tenis,45000,NIKE-AM-38-BLK,38,Negro,48000,5',
  'Nike Air Max,Zapatilla deportiva,Nike,Tenis,45000,NIKE-AM-39-BLK,39,Negro,48000,3',
  'Sandalia Casual,,Crocs,Sandalias,15000,CROCS-S-M-WHT,M,Blanco,18000,10',
].join('\n')

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'plantilla_inventario.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ── Main import logic ────────────────────────────────────────────────────────

async function runImport(rows: ParsedRow[], tiendaId: string): Promise<ImportResult> {
  const result: ImportResult = { inserted: 0, skipped: 0, errors: [] }

  // 1. Collect unique lookups
  const marcaNames = [...new Set(rows.map((r) => r.marca).filter(Boolean))]
  const catNames = [...new Set(rows.map((r) => r.categoria).filter(Boolean))]

  // 2. Upsert marcas
  const marcaMap = new Map<string, string>()
  if (marcaNames.length) {
    await supabase.from('marcas').upsert(marcaNames.map((nombre) => ({ nombre })), { onConflict: 'nombre', ignoreDuplicates: true })
    const { data } = await supabase.from('marcas').select('id, nombre').in('nombre', marcaNames)
    data?.forEach((m) => marcaMap.set(m.nombre, m.id))
  }

  // 3. Upsert categorias
  const catMap = new Map<string, string>()
  if (catNames.length) {
    await supabase.from('categorias').upsert(catNames.map((nombre) => ({ nombre })), { onConflict: 'nombre', ignoreDuplicates: true })
    const { data } = await supabase.from('categorias').select('id, nombre').in('nombre', catNames)
    data?.forEach((c) => catMap.set(c.nombre, c.id))
  }

  // 4. Group rows by product name
  const groups = new Map<string, ParsedRow[]>()
  for (const row of rows) {
    if (!groups.has(row.nombre)) groups.set(row.nombre, [])
    groups.get(row.nombre)!.push(row)
  }

  // 5. Process each product group
  for (const [nombre, groupRows] of groups) {
    const first = groupRows[0]
    const marca_id = first.marca ? (marcaMap.get(first.marca) ?? null) : null
    const categoria_id = first.categoria ? (catMap.get(first.categoria) ?? null) : null

    // Find or create producto
    let productoId: string
    const { data: existing } = await supabase.from('productos').select('id').eq('nombre', nombre).maybeSingle()

    if (existing) {
      productoId = existing.id
    } else {
      const { data: newP, error } = await supabase
        .from('productos')
        .insert({ nombre, descripcion: first.descripcion || null, marca_id, categoria_id, precio_base: first.precio_base, activo: true })
        .select('id')
        .single()
      if (error || !newP) {
        result.errors.push(`No se pudo crear producto "${nombre}": ${error?.message ?? 'error desconocido'}`)
        continue
      }
      productoId = newP.id
    }

    // Insert each variant
    for (const row of groupRows) {
      const { data: newVar, error: varErr } = await supabase
        .from('variantes_producto')
        .insert({ producto_id: productoId, sku: row.sku, talla: row.talla || null, color: row.color || null, precio: row.precio, activo: true })
        .select('id')
        .single()

      if (varErr) {
        const isDuplicate = varErr.message.includes('unique') || varErr.message.includes('duplicate') || varErr.code === '23505'
        if (isDuplicate) {
          result.skipped++
          result.errors.push(`SKU "${row.sku}" ya existe — omitido`)
        } else {
          result.errors.push(`Error en SKU "${row.sku}": ${varErr.message}`)
        }
        continue
      }

      if (row.stock_inicial > 0 && newVar) {
        await supabase.from('inventario_tienda').upsert(
          { tienda_id: tiendaId, variante_id: newVar.id, stock: row.stock_inicial },
          { onConflict: 'tienda_id,variante_id', ignoreDuplicates: false }
        )
      }

      result.inserted++
    }
  }

  return result
}

// ── Component ────────────────────────────────────────────────────────────────

interface BulkImportModalProps {
  isOpen: boolean
  onClose: () => void
}

type Step = 'upload' | 'preview' | 'result'

export function BulkImportModal({ isOpen, onClose }: BulkImportModalProps) {
  const qc = useQueryClient()
  const { activeTienda } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [dragOver, setDragOver] = useState(false)

  function handleClose() {
    if (importing) return
    setStep('upload')
    setRows([])
    setImportResult(null)
    onClose()
  }

  function processFile(file: File) {
    if (!file.name.endsWith('.csv')) {
      toast.error('Solo se aceptan archivos .csv')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const raw = parseCSV(text)
      if (!raw.length) {
        toast.error('El archivo está vacío o no tiene el formato correcto')
        return
      }
      const parsed = raw.map(validateRow)
      setRows(parsed)
      setStep('preview')
    }
    reader.readAsText(file, 'utf-8')
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  async function handleImport() {
    if (!activeTienda) return
    const validRows = rows.filter((r) => r.errors.length === 0)
    if (!validRows.length) return

    setImporting(true)
    try {
      const result = await runImport(validRows, activeTienda.id)
      setImportResult(result)
      setStep('result')
      if (result.inserted > 0) {
        qc.invalidateQueries({ queryKey: ['inventario'] })
        toast.success(`${result.inserted} variante${result.inserted !== 1 ? 's' : ''} importada${result.inserted !== 1 ? 's' : ''}`)
      }
    } catch {
      toast.error('Error inesperado durante la importación')
    } finally {
      setImporting(false)
    }
  }

  const validCount = rows.filter((r) => r.errors.length === 0).length
  const invalidCount = rows.length - validCount

  const stepTitle = step === 'upload' ? 'Importar inventario desde CSV'
    : step === 'preview' ? `Vista previa — ${rows.length} fila${rows.length !== 1 ? 's' : ''} detectada${rows.length !== 1 ? 's' : ''}`
    : 'Resultado de importación'

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={stepTitle} size="xl">
      {step === 'upload' && (
        <div className="p-6 space-y-6">
          {/* Template download */}
          <div className="flex items-start gap-3 p-4 bg-brand-50 rounded-xl border border-brand-100">
            <FileText className="w-5 h-5 text-brand-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-brand-900">Formato esperado</p>
              <p className="text-xs text-brand-700 mt-0.5">
                Una fila por variante. Si un producto tiene varias tallas/colores, repite el nombre en cada fila.
                Los campos <span className="font-semibold">nombre, sku y precio</span> son obligatorios.
              </p>
              <p className="text-xs text-brand-600 mt-2 font-mono">
                nombre, descripcion, marca, categoria, precio_base, sku, talla, color, precio, stock_inicial
              </p>
            </div>
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-700 border border-brand-200 rounded-lg hover:bg-brand-100 transition-colors shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Descargar plantilla
            </button>
          </div>

          {/* Drop zone */}
          <div
            ref={dropRef}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-xl p-12 flex flex-col items-center gap-3 cursor-pointer transition-colors',
              dragOver ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-300 hover:bg-gray-50'
            )}
          >
            <div className={cn(
              'w-12 h-12 rounded-full flex items-center justify-center transition-colors',
              dragOver ? 'bg-brand-100' : 'bg-gray-100'
            )}>
              <Upload className={cn('w-6 h-6', dragOver ? 'text-brand-600' : 'text-gray-400')} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700">Arrastra tu archivo CSV aquí</p>
              <p className="text-xs text-gray-400 mt-1">o haz clic para seleccionarlo</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="flex flex-col">
          {/* Summary bar */}
          <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-4 text-sm bg-gray-50/50 shrink-0">
            <span className="flex items-center gap-1.5 text-green-700">
              <CheckCircle2 className="w-4 h-4" />
              {validCount} válida{validCount !== 1 ? 's' : ''}
            </span>
            {invalidCount > 0 && (
              <span className="flex items-center gap-1.5 text-red-600">
                <AlertCircle className="w-4 h-4" />
                {invalidCount} con error{invalidCount !== 1 ? 'es' : ''}
              </span>
            )}
            <span className="text-gray-400">Las filas con errores serán omitidas</span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto max-h-[50vh]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr className="border-b border-gray-100">
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wider">#</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wider">Nombre</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wider">SKU</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wider">Marca</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wider">Categoría</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wider">Talla</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wider">Color</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wider">Precio</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wider">Stock</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className={cn(
                      row.errors.length > 0 ? 'bg-red-50' : 'hover:bg-gray-50/50'
                    )}
                  >
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-gray-900 max-w-[140px] truncate">{row.nombre || <span className="text-red-400 italic">vacío</span>}</td>
                    <td className="px-3 py-2 font-mono text-brand-700">{row.sku || <span className="text-red-400 italic">vacío</span>}</td>
                    <td className="px-3 py-2 text-gray-600">{row.marca || '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{row.categoria || '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{row.talla || '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{row.color || '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-800">{row.precio > 0 ? `₡${row.precio.toLocaleString('es-CR')}` : <span className="text-red-400">?</span>}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{row.stock_inicial}</td>
                    <td className="px-3 py-2">
                      {row.errors.length > 0 ? (
                        <span className="text-red-600 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          {row.errors.join(', ')}
                        </span>
                      ) : (
                        <span className="text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          OK
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer actions */}
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between shrink-0 bg-white">
            <button
              onClick={() => { setRows([]); setStep('upload') }}
              className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              ← Cambiar archivo
            </button>
            <button
              onClick={handleImport}
              disabled={validCount === 0 || importing}
              className="flex items-center gap-2 px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {importing && <Loader2 className="w-4 h-4 animate-spin" />}
              {importing ? 'Importando...' : `Importar ${validCount} variante${validCount !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {step === 'result' && importResult && (
        <div className="p-6 space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-green-50 border border-green-100">
              <p className="text-2xl font-bold text-green-700">{importResult.inserted}</p>
              <p className="text-sm text-green-600 mt-0.5">Variante{importResult.inserted !== 1 ? 's' : ''} importada{importResult.inserted !== 1 ? 's' : ''}</p>
            </div>
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-100">
              <p className="text-2xl font-bold text-amber-700">{importResult.skipped}</p>
              <p className="text-sm text-amber-600 mt-0.5">SKU{importResult.skipped !== 1 ? 's' : ''} omitido{importResult.skipped !== 1 ? 's' : ''} (ya existen)</p>
            </div>
          </div>

          {/* Errors list */}
          {importResult.errors.length > 0 && (
            <div className="rounded-xl border border-red-100 bg-red-50 p-4 space-y-1.5 max-h-48 overflow-y-auto">
              <p className="text-xs font-semibold text-red-700 uppercase tracking-wider mb-2">Advertencias / errores</p>
              {importResult.errors.map((err, i) => (
                <p key={i} className="text-xs text-red-600 flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {err}
                </p>
              ))}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              onClick={handleClose}
              className="px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
