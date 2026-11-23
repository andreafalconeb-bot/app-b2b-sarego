// Zonas para agrupar prospectos por ubicación (Andrea, 23/nov/2026: "agrupa
// los prospectos por zona"). Casi ningún prospecto trae la ciudad, pero
// todos tienen coordenadas, así que la zona sale del punto más cercano.
// Los centros son aproximados; si una zona queda mal, se ajusta aquí.

export interface Zona {
  nombre: string
  lat: number
  lng: number
  /** Distancia máxima (km) para pertenecer a la zona. */
  radioKm: number
}

// Caracas va por sectores porque ahí está casi toda la prospección.
const CARACAS: Zona[] = [
  { nombre: 'Caracas · Catia y Propatria', lat: 10.512, lng: -66.948, radioKm: 3 },
  { nombre: 'Caracas · La Yaguara, Carapa y Antímano', lat: 10.474, lng: -66.965, radioKm: 3 },
  { nombre: 'Caracas · Montalbán y La Vega', lat: 10.468, lng: -66.943, radioKm: 2.5 },
  { nombre: 'Caracas · El Paraíso y San Martín', lat: 10.488, lng: -66.928, radioKm: 2.5 },
  { nombre: 'Caracas · Centro', lat: 10.506, lng: -66.914, radioKm: 2 },
  { nombre: 'Caracas · Quinta Crespo y El Cementerio', lat: 10.484, lng: -66.906, radioKm: 2 },
  { nombre: 'Caracas · Los Rosales y Av. Roosevelt', lat: 10.479, lng: -66.893, radioKm: 2 },
  { nombre: 'Caracas · El Valle, Coche y Fuerte Tiuna', lat: 10.458, lng: -66.905, radioKm: 3 },
  { nombre: 'Caracas · La Candelaria y San Bernardino', lat: 10.508, lng: -66.896, radioKm: 2 },
  { nombre: 'Caracas · Sabana Grande y Chacao', lat: 10.495, lng: -66.868, radioKm: 2.5 },
  { nombre: 'Caracas · Las Mercedes, Baruta y La Trinidad', lat: 10.46, lng: -66.86, radioKm: 4 },
  { nombre: 'Caracas · Los Cortijos, La Urbina y Petare', lat: 10.488, lng: -66.812, radioKm: 4 },
]

// El resto, con las mismas zonas industriales que usa Semillas.
const OTRAS: Zona[] = [
  { nombre: 'Guarenas y Guatire', lat: 10.4716, lng: -66.5383, radioKm: 12 },
  { nombre: 'Valles del Tuy', lat: 10.2283, lng: -66.8572, radioKm: 20 },
  { nombre: 'Valencia · Zona Industrial Sur', lat: 10.1306, lng: -68.0039, radioKm: 4 },
  { nombre: 'Valencia · Castillito y Flor Amarillo', lat: 10.1418, lng: -67.9504, radioKm: 4 },
  { nombre: 'Valencia · Norte y centro', lat: 10.19, lng: -68.0, radioKm: 8 },
  { nombre: 'Guacara y Los Guayos', lat: 10.2265, lng: -67.8833, radioKm: 8 },
  { nombre: 'Maracay', lat: 10.2203, lng: -67.5714, radioKm: 12 },
  { nombre: 'La Victoria', lat: 10.2275, lng: -67.3333, radioKm: 10 },
  { nombre: 'Puerto Cabello', lat: 10.4731, lng: -68.0125, radioKm: 12 },
  { nombre: 'Ciudad Bolívar', lat: 8.113, lng: -63.54, radioKm: 15 },
  { nombre: 'Puerto Ordaz', lat: 8.29, lng: -62.77, radioKm: 10 },
  { nombre: 'San Félix', lat: 8.3575, lng: -62.6453, radioKm: 8 },
  { nombre: 'Upata y El Callao', lat: 8.0128, lng: -62.4031, radioKm: 40 },
]

export const ZONAS_PROSPECTOS: Zona[] = [...CARACAS, ...OTRAS]
export const SIN_UBICACION = 'Sin ubicación'
export const OTRA_ZONA = 'Otra zona'

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = (g: number) => (g * Math.PI) / 180
  const dLat = r(b.lat - a.lat)
  const dLng = r(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/** Nombre de la zona del punto: la más cercana dentro de su radio. */
export function zonaDe(lat: number | null | undefined, lng: number | null | undefined): string {
  if (lat == null || lng == null) return SIN_UBICACION
  const p = { lat, lng }
  let mejor: string | null = null
  let dMejor = Infinity
  for (const z of ZONAS_PROSPECTOS) {
    const d = km(p, z)
    if (d <= z.radioKm && d < dMejor) {
      mejor = z.nombre
      dMejor = d
    }
  }
  if (mejor) return mejor
  // Fuera de los sectores de Caracas pero cerca: no lo mandes a "Otra zona".
  return km(p, { lat: 10.49, lng: -66.9 }) <= 15 ? 'Caracas · Otros sectores' : OTRA_ZONA
}

/** Orden de las zonas: el del catálogo, y al final las genéricas. */
export function ordenZona(nombre: string): number {
  const i = ZONAS_PROSPECTOS.findIndex((z) => z.nombre === nombre)
  if (i >= 0) return i
  if (nombre === 'Caracas · Otros sectores') return CARACAS.length - 0.5
  return nombre === OTRA_ZONA ? 1000 : 1001
}
