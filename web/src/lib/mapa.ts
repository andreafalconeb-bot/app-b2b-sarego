import L from 'leaflet'

// Tiles de OpenStreetMap: gratis y sin clave (los mismos de la app retail;
// CARTO empezó a pedir API key, ver web/src/lib/mapaTiles.ts allá).
export function capaBase(): L.TileLayer {
  return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    subdomains: ['a', 'b', 'c'],
    maxZoom: 19,
    detectRetina: true,
  })
}

/** Pin en forma de gota (el ícono por defecto de Leaflet no carga con Vite). */
export function iconoPin(relleno: string, borde = '#123a4a', tam = 22): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:${tam}px;height:${tam}px;border-radius:50% 50% 50% 0;background:${relleno};border:2px solid ${borde};transform:rotate(-45deg);box-shadow:0 1px 3px rgba(0,0,0,.45)"></span>`,
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam],
  })
}

export function iconoPunto(color: string, tam = 14): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:${tam}px;height:${tam}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.45)"></span>`,
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam / 2],
  })
}

/** Cuadrado verde: cliente ya registrado en el ERP (Profit). */
export function iconoErp(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: '<span style="display:block;width:16px;height:16px;background:#1f7a4d;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.45)"></span>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}

export const COLORES = { nueva: '#0c5a7a', cliente: '#1f7a4d', duplicada: '#a86400', elegida: '#e8a23a', prospecto: '#e8a23a' }

export function enlaceGoogleMaps(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}

/** Distancia en metros entre dos puntos (para "el cliente ERP está a 120 m"). */
export function distanciaMetros(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000
  const r = (g: number) => (g * Math.PI) / 180
  const dLat = r(b.lat - a.lat)
  const dLng = r(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function textoDistancia(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`
}
