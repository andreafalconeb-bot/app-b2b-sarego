import { supabase } from './supabase'
import type { Investigacion } from './tipos'

// Costos aproximados por empresa con Claude Haiku 5.5 (ver la Edge
// Function b2b-investigar). El costo real de cada una queda guardado.
export const COSTO_APROX = { preliminar: 0.02, completa: 0.06 } as const

export const PRIORIDAD_IA: Record<string, string> = {
  alta: 'Prioridad alta',
  media: 'Prioridad media',
  baja: 'Prioridad baja',
  descartar: 'Descartar',
}

export const SENALES: Record<string, string> = {
  vacantes: 'Busca choferes, mecánicos o jefe de flota',
  sede_nueva: 'Sede o centro de distribución nuevo',
  flota_nueva: 'Flota nueva',
  gerente_nuevo: 'Gerente nuevo',
  queja_proveedor: 'Quejas de un proveedor',
  equipos_parados: 'Equipos parados',
  licitacion: 'Licitación',
  otra: 'Otra señal',
}

/** Llama a la Edge Function; devuelve la investigación o lanza un error legible. */
export async function investigar(proyectoId: string, tipo: 'preliminar' | 'completa'): Promise<Investigacion> {
  if (!navigator.onLine) throw new Error('La investigación con IA necesita señal.')
  const { data, error } = await supabase.functions.invoke('b2b-investigar', { body: { proyecto_id: proyectoId, tipo } })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const cuerpo = ctx ? await ctx.json().catch(() => null) : null
    throw new Error(cuerpo?.error ?? error.message)
  }
  return (data as { investigacion: Investigacion }).investigacion
}

export async function gastoDelMes(): Promise<{ gasto: number; tope: number }> {
  const [g, c] = await Promise.all([
    supabase.rpc('b2b_ia_gasto_mes'),
    supabase.from('b2b_config').select('ia_presupuesto_mensual_usd').single(),
  ])
  return { gasto: Number(g.data ?? 0), tope: Number(c.data?.ia_presupuesto_mensual_usd ?? 10) }
}

export function usd(v: number): string {
  return 'US$ ' + v.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
}
