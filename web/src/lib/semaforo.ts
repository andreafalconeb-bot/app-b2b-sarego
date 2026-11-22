import type { Semaforo } from './tipos'

export interface Limite {
  parametro_codigo: string
  componente: string | null
  tipo_equipo: string | null
  precaucion_min: number | null
  precaucion_max: number | null
  critico_min: number | null
  critico_max: number | null
}

const ORDEN: Record<Semaforo, number> = { normal: 0, precaucion: 1, critico: 2 }

/** El más grave de varios semáforos (null si no hay ninguno). */
export function peor(...s: (Semaforo | null | undefined)[]): Semaforo | null {
  let r: Semaforo | null = null
  for (const x of s) if (x && (r === null || ORDEN[x] > ORDEN[r])) r = x
  return r
}

/**
 * Semáforo de un valor según los límites configurados (tabla b2b_limites).
 * Gana el límite más específico: componente + tipo de equipo, luego solo
 * componente, luego solo tipo, luego el general. Sin límite: null.
 */
export function semaforoPorLimites(
  limites: Limite[],
  parametro: string,
  valor: number,
  componente: string | null,
  tipoEquipo: string | null,
): Semaforo | null {
  if (!Number.isFinite(valor)) return null
  const candidatos = limites
    .filter((l) => l.parametro_codigo === parametro)
    .filter((l) => (l.componente === null || l.componente === componente) && (l.tipo_equipo === null || l.tipo_equipo === tipoEquipo))
    .sort((a, b) => especificidad(b) - especificidad(a))
  const l = candidatos[0]
  if (!l) return null
  if ((l.critico_max != null && valor >= l.critico_max) || (l.critico_min != null && valor <= l.critico_min)) return 'critico'
  if ((l.precaucion_max != null && valor >= l.precaucion_max) || (l.precaucion_min != null && valor <= l.precaucion_min)) return 'precaucion'
  return 'normal'
}

function especificidad(l: Limite) {
  return (l.componente ? 2 : 0) + (l.tipo_equipo ? 1 : 0)
}
