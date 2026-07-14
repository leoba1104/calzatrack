import { useEffect } from 'react'
import { create } from 'zustand'
import toast from 'react-hot-toast'

// USBDevice is a live DOM object — cannot be stored in Zustand (not serializable).
// Keep it at module level; Zustand only manages the UI-visible state.
// Most thermal receipt printers expose themselves over USB as a raw printer-class
// device (no virtual COM port), so WebUSB is used instead of Web Serial.
let _device: USBDevice | null = null
let _interfaceNumber = -1
let _endpointNumber = -1

// Chrome/Edge remember USB permissions granted via requestDevice() across page loads,
// so navigator.usb.getDevices() can silently re-open a previously authorized printer
// on startup without showing the picker again. These guards make sure the app-wide
// auto-connect attempt and disconnect listener are only wired up once.
let _autoConnectAttempted = false
let _disconnectListenerAttached = false

function findOutEndpoint(device: USBDevice): { interfaceNumber: number; endpointNumber: number } | null {
  for (const iface of device.configuration?.interfaces ?? []) {
    const endpoint = iface.alternate.endpoints.find((e) => e.direction === 'out' && e.type === 'bulk')
    if (endpoint) return { interfaceNumber: iface.interfaceNumber, endpointNumber: endpoint.endpointNumber }
  }
  return null
}

// Opens a granted USBDevice and claims its printer interface. Shared by the manual
// "Conectar impresora" flow and the silent startup auto-reconnect.
async function openAndClaim(device: USBDevice): Promise<boolean> {
  await device.open()
  if (!device.configuration) await device.selectConfiguration(1)

  const endpoint = findOutEndpoint(device)
  if (!endpoint) {
    await device.close()
    return false
  }

  await device.claimInterface(endpoint.interfaceNumber)
  _device = device
  _interfaceNumber = endpoint.interfaceNumber
  _endpointNumber = endpoint.endpointNumber
  return true
}

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

  // Silently re-open a previously authorized printer on startup, and listen for the
  // OS reporting the device was physically unplugged. Guarded to run app-wide once,
  // even though usePrinter() is called from multiple components.
  useEffect(() => {
    if (!('usb' in navigator)) return

    if (!_autoConnectAttempted) {
      _autoConnectAttempted = true
      void (async () => {
        const devices = await navigator.usb.getDevices()
        const device = devices[0]
        if (!device) return
        const ok = await openAndClaim(device).catch(() => false)
        if (ok) {
          setConnected(true)
          toast.success('Impresora conectada')
        }
      })()
    }

    if (!_disconnectListenerAttached) {
      _disconnectListenerAttached = true
      navigator.usb.addEventListener('disconnect', (event) => {
        if (_device && event.device === _device) {
          _device = null
          _interfaceNumber = -1
          _endpointNumber = -1
          usePrinterUIState.getState().setConnected(false)
          toast('Impresora desconectada')
        }
      })
    }
  }, [setConnected])

  async function connect() {
    if (!('usb' in navigator)) {
      toast.error('Este navegador no soporta impresión directa. Usa Chrome o Edge.')
      return
    }
    setConnecting(true)
    try {
      const device = await navigator.usb.requestDevice({ filters: [{}] })
      const ok = await openAndClaim(device)
      if (!ok) {
        toast.error('La impresora no expone un endpoint USB compatible')
        return
      }
      setConnected(true)
      toast.success('Impresora conectada')
    } catch (e) {
      const err = e as DOMException
      if (err.name === 'NotFoundError') return // user cancelled picker
      toast.error(`Error al conectar: ${err.message || err.name}`)
    } finally {
      setConnecting(false)
    }
  }

  async function disconnect() {
    if (!_device) return
    try {
      await _device.releaseInterface(_interfaceNumber)
      await _device.close()
    } catch { /* ignore if already closed */ }
    _device = null
    _interfaceNumber = -1
    _endpointNumber = -1
    setConnected(false)
    toast('Impresora desconectada')
  }

  async function print(data: Uint8Array): Promise<boolean> {
    if (!_device) {
      toast.error('Impresora no conectada')
      return false
    }
    setPrinting(true)
    try {
      const result = await _device.transferOut(_endpointNumber, data)
      if (result.status !== 'ok') throw new Error(`USB transfer status: ${result.status}`)
      return true
    } catch (e) {
      const err = e as Error
      toast.error(`Error al imprimir: ${err.message || err.name}`)
      _device = null
      _interfaceNumber = -1
      _endpointNumber = -1
      setConnected(false)
      return false
    } finally {
      setPrinting(false)
    }
  }

  return { isConnected, isConnecting, isPrinting, connect, disconnect, print }
}
