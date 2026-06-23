import { create } from 'zustand'
import toast from 'react-hot-toast'

// SerialPort is a live DOM object — cannot be stored in Zustand (not serializable).
// Keep it at module level; Zustand only manages the UI-visible state.
let _port: SerialPort | null = null

interface PrinterUIState {
  isConnected:  boolean
  isConnecting: boolean
  isPrinting:   boolean
  setConnected:  (v: boolean) => void
  setConnecting: (v: boolean) => void
  setPrinting:   (v: boolean) => void
}

const usePrinterUIState = create<PrinterUIState>((set) => ({
  isConnected:  false,
  isConnecting: false,
  isPrinting:   false,
  setConnected:  (v) => set({ isConnected:  v }),
  setConnecting: (v) => set({ isConnecting: v }),
  setPrinting:   (v) => set({ isPrinting:   v }),
}))

export function usePrinter() {
  const {
    isConnected, isConnecting, isPrinting,
    setConnected, setConnecting, setPrinting,
  } = usePrinterUIState()

  async function connect() {
    if (!('serial' in navigator)) {
      toast.error('Este navegador no soporta impresión directa. Usa Chrome o Edge.')
      return
    }
    setConnecting(true)
    try {
      const port = await navigator.serial.requestPort()
      await port.open({ baudRate: 115200 })
      _port = port
      setConnected(true)
      toast.success('Impresora conectada')
    } catch (e) {
      const err = e as DOMException
      if (err.name === 'NotFoundError') return // user cancelled picker
      console.error('[Printer] connect error:', err.name, err.message)
      toast.error(`Error al conectar: ${err.message || err.name}`)
    } finally {
      setConnecting(false)
    }
  }

  async function disconnect() {
    if (!_port) return
    try { await _port.close() } catch { /* ignore if already closed */ }
    _port = null
    setConnected(false)
    toast('Impresora desconectada')
  }

  async function print(data: Uint8Array): Promise<boolean> {
    if (!_port) {
      toast.error('Impresora no conectada')
      return false
    }
    setPrinting(true)
    try {
      const writer = _port.writable.getWriter()
      await writer.write(data)
      writer.releaseLock()
      return true
    } catch {
      toast.error('Error al imprimir — reconecte la impresora')
      _port = null
      setConnected(false)
      return false
    } finally {
      setPrinting(false)
    }
  }

  async function testPrint(): Promise<void> {
    const ESC = 0x1B, LF = 0x0A, GS = 0x1D
    const enc = (s: string) => Array.from(new TextEncoder().encode(s))
    const bytes = new Uint8Array([
      ESC, 0x40,                          // init
      ESC, 0x61, 0x01,                    // center
      ESC, 0x45, 0x01,                    // bold on
      ...enc('CalzaTrack'), LF,
      ESC, 0x45, 0x00,                    // bold off
      ...enc('Prueba de impresion'), LF,
      ...enc('------------------------'), LF,
      ...enc('Si ves esto, funciona!'), LF,
      LF, LF, LF,
      GS, 0x56, 0x41, 0x03,              // cut
    ])
    await print(bytes)
  }

  return { isConnected, isConnecting, isPrinting, connect, disconnect, print, testPrint }
}
