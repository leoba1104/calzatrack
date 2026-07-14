// WebUSB API — not yet in standard TypeScript DOM lib
interface USBDeviceFilter {
  vendorId?: number
  productId?: number
  classCode?: number
  subclassCode?: number
  protocolCode?: number
}

interface USBEndpoint {
  endpointNumber: number
  direction: 'in' | 'out'
  type: 'bulk' | 'interrupt' | 'isochronous'
}

interface USBAlternateInterface {
  alternateSetting: number
  interfaceClass: number
  endpoints: USBEndpoint[]
}

interface USBInterface {
  interfaceNumber: number
  alternate: USBAlternateInterface
  alternates: USBAlternateInterface[]
  claimed: boolean
}

interface USBConfiguration {
  configurationValue: number
  interfaces: USBInterface[]
}

interface USBOutTransferResult {
  status: 'ok' | 'stall' | 'babble'
  bytesWritten: number
}

interface USBDevice {
  readonly vendorId: number
  readonly productId: number
  readonly productName?: string
  readonly configuration: USBConfiguration | null
  readonly configurations: USBConfiguration[]
  readonly opened: boolean
  open(): Promise<void>
  close(): Promise<void>
  selectConfiguration(configurationValue: number): Promise<void>
  claimInterface(interfaceNumber: number): Promise<void>
  releaseInterface(interfaceNumber: number): Promise<void>
  transferOut(endpointNumber: number, data: BufferSource): Promise<USBOutTransferResult>
}

interface USBConnectionEvent extends Event {
  readonly device: USBDevice
}

interface USBEventMap {
  connect: USBConnectionEvent
  disconnect: USBConnectionEvent
}

interface USB extends EventTarget {
  requestDevice(options: { filters: USBDeviceFilter[] }): Promise<USBDevice>
  getDevices(): Promise<USBDevice[]>
  addEventListener<K extends keyof USBEventMap>(
    type: K,
    listener: (event: USBEventMap[K]) => void,
  ): void
}

interface Navigator {
  readonly usb: USB
}