// Trabajo sin señal (plantas, minas, patios).
//
//  * Lecturas: cada consulta que pasa por leerConCache guarda su último
//    resultado en IndexedDB. Sin señal se muestra esa copia, marcada como
//    "sin conexión".
//  * Escrituras: ejecutar() intenta escribir en Supabase; si no hay red,
//    la operación queda en una cola en IndexedDB y se envía sola cuando
//    vuelve la señal (evento 'online' y al abrir la app). Los ids se
//    generan en el teléfono (crypto.randomUUID) para que una muestra
//    creada sin señal pueda referirse a un equipo también creado sin señal.
//
// Los archivos (fotos, PDF) NO se encolan: necesitan señal en el momento.
import { openDB, type IDBPDatabase } from 'idb'
import { supabase } from './supabase'

export type Operacion =
  | { tipo: 'insert'; tabla: string; fila: Record<string, unknown> }
  | { tipo: 'update'; tabla: string; id: string; cambios: Record<string, unknown> }
  | { tipo: 'upsert'; tabla: string; fila: Record<string, unknown>; onConflict: string }
  | { tipo: 'rpc'; fn: string; args: Record<string, unknown> }

interface EnCola {
  id?: number
  op: Operacion
  descripcion: string
  creado: string
  intentos: number
  ultimoError?: string
}

let dbPromise: Promise<IDBPDatabase> | null = null
function db() {
  dbPromise ??= openDB('sarego-b2b', 1, {
    upgrade(d) {
      d.createObjectStore('cache')
      d.createObjectStore('cola', { keyPath: 'id', autoIncrement: true })
    },
  })
  return dbPromise
}

export function esErrorDeRed(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(m) || !navigator.onLine
}

const oyentes = new Set<() => void>()
export function alCambiarCola(fn: () => void) {
  oyentes.add(fn)
  return () => oyentes.delete(fn)
}
function avisar() {
  oyentes.forEach((f) => f())
}

export async function pendientes(): Promise<EnCola[]> {
  try {
    return (await (await db()).getAll('cola')) as EnCola[]
  } catch {
    return []
  }
}

async function enviar(op: Operacion) {
  let r: { error: { message: string } | null }
  if (op.tipo === 'insert') r = await supabase.from(op.tabla).insert(op.fila)
  else if (op.tipo === 'update') r = await supabase.from(op.tabla).update(op.cambios).eq('id', op.id)
  else if (op.tipo === 'upsert') r = await supabase.from(op.tabla).upsert(op.fila, { onConflict: op.onConflict })
  else r = await supabase.rpc(op.fn, op.args)
  if (r.error) throw new Error(r.error.message)
}

/** Escribe ya, o deja la escritura en cola si no hay señal. */
export async function ejecutar(op: Operacion, descripcion: string): Promise<{ encolada: boolean }> {
  if (navigator.onLine) {
    try {
      await enviar(op)
      return { encolada: false }
    } catch (e) {
      if (!esErrorDeRed(e)) throw e
    }
  }
  await (await db()).add('cola', { op, descripcion, creado: new Date().toISOString(), intentos: 0 } satisfies EnCola)
  avisar()
  return { encolada: true }
}

let procesando = false
/** Envía la cola en orden. Se detiene al primer error de red. */
export async function procesarCola(): Promise<{ enviadas: number; errores: string[] }> {
  if (procesando || !navigator.onLine) return { enviadas: 0, errores: [] }
  procesando = true
  const errores: string[] = []
  let enviadas = 0
  try {
    const d = await db()
    const items = (await d.getAll('cola')) as EnCola[]
    for (const it of items) {
      try {
        await enviar(it.op)
        await d.delete('cola', it.id!)
        enviadas++
      } catch (e) {
        if (esErrorDeRed(e)) break
        // Error de la base (permiso, dato inválido): se guarda para que
        // la persona lo vea y decida; no se reintenta en bucle.
        it.intentos++
        it.ultimoError = e instanceof Error ? e.message : String(e)
        await d.put('cola', it)
        errores.push(`${it.descripcion}: ${it.ultimoError}`)
      }
    }
  } finally {
    procesando = false
    avisar()
  }
  return { enviadas, errores }
}

export async function descartarDeCola(id: number) {
  await (await db()).delete('cola', id)
  avisar()
}

/** Ejecuta la consulta; sin señal devuelve la última copia guardada. */
export async function leerConCache<T>(clave: string, consulta: () => Promise<T>): Promise<{ datos: T; desdeCache: boolean }> {
  try {
    const datos = await consulta()
    try {
      await (await db()).put('cache', { datos, ts: Date.now() }, clave)
    } catch {
      /* sin IndexedDB: seguimos sin copia */
    }
    return { datos, desdeCache: false }
  } catch (e) {
    if (!esErrorDeRed(e)) throw e
    const guardado = (await (await db()).get('cache', clave)) as { datos: T } | undefined
    if (!guardado) throw new Error('Sin conexión y sin una copia guardada de esta pantalla. Ábrela una vez con señal.')
    return { datos: guardado.datos, desdeCache: true }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void procesarCola())
}
