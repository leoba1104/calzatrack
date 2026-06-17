import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const rootElement = document.getElementById('root')!

function showError(msg: string) {
  rootElement.innerHTML = `<div style="
    min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:#fff1f2;font-family:monospace;padding:2rem
  ">
    <div style="background:#fff;border:2px solid #fca5a5;border-radius:8px;padding:2rem;max-width:600px;word-break:break-word">
      <h2 style="color:#dc2626;margin-bottom:1rem">Error al cargar CalzaTrack</h2>
      <pre style="color:#7f1d1d;white-space:pre-wrap;font-size:13px">${msg}</pre>
      <p style="margin-top:1rem;color:#6b7280;font-size:12px">Revise la consola del navegador para más detalles.</p>
    </div>
  </div>`
}

window.addEventListener('error', (e) => showError(`${e.message}\n${e.filename}:${e.lineno}`))
window.addEventListener('unhandledrejection', (e) => showError(String(e.reason)))

try {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
} catch (e: unknown) {
  const err = e as Error
  showError(`${err?.name}: ${err?.message}\n\n${err?.stack ?? ''}`)
}
