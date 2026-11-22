import QRCode from 'qrcode'

export function urlPunto(token: string) {
  return `${window.location.origin}/qr/${token}`
}

export function qrDataUrl(token: string): Promise<string> {
  return QRCode.toDataURL(urlPunto(token), { margin: 1, width: 240, errorCorrectionLevel: 'M' })
}

export interface EtiquetaQR {
  token: string
  titulo: string // empresa
  linea1: string // equipo
  linea2: string // componente
}

/** Abre una hoja con las etiquetas para imprimir y pegar en el equipo. */
export async function imprimirEtiquetas(etiquetas: EtiquetaQR[]) {
  const imgs = await Promise.all(etiquetas.map((e) => qrDataUrl(e.token)))
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas de muestreo</title>
<style>body{font-family:Arial,sans-serif;margin:12px}.e{display:inline-flex;gap:8px;align-items:center;border:1px dashed #999;padding:6px;margin:4px;width:300px;vertical-align:top;page-break-inside:avoid}
.e img{width:100px;height:100px}.e b{font-size:12px}.e div{font-size:11px;line-height:1.3}.e small{color:#555}</style></head><body>
${etiquetas
  .map(
    (e, i) =>
      `<div class="e"><img src="${imgs[i]}" alt=""><div><b>${esc(e.titulo)}</b><br>${esc(e.linea1)}<br>${esc(e.linea2)}<br><small>Escanea para registrar la muestra · SAREGO B2B</small></div></div>`,
  )
  .join('')}
<script>window.onload=()=>window.print()</script></body></html>`
  const w = window.open('', '_blank')
  if (!w) throw new Error('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para esta página.')
  w.document.write(html)
  w.document.close()
}
