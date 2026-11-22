import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Semaforo } from '../lib/tipos'
import { SEMAFORO } from '../lib/catalogos'

export function Pill({ tono, children }: { tono?: 'acento' | 'ok' | 'alerta' | 'critico' | 'ambar'; children: ReactNode }) {
  return <span className={'pill' + (tono ? ' ' + tono : '')}>{children}</span>
}

export function PuntoSemaforo({ s }: { s: Semaforo | null | undefined }) {
  return <span className={'punto ' + (s ?? 'nada')} title={s ? SEMAFORO[s] : 'Sin resultado'} />
}

export function PillSemaforo({ s }: { s: Semaforo | null | undefined }) {
  if (!s) return <Pill>Sin resultado</Pill>
  return <Pill tono={s === 'normal' ? 'ok' : s === 'precaucion' ? 'alerta' : 'critico'}>{SEMAFORO[s]}</Pill>
}

export function Cargando() {
  return <div className="vacio">Cargando…</div>
}

export function Vacio({ children }: { children: ReactNode }) {
  return <div className="vacio">{children}</div>
}

export function ErrorMsg({ error }: { error: string | null | undefined }) {
  if (!error) return null
  return <div className="aviso error" role="alert">{error}</div>
}

export function AvisoCache({ desdeCache }: { desdeCache: boolean }) {
  if (!desdeCache) return null
  return <div className="aviso alerta">Sin conexión: estás viendo la última copia guardada de esta pantalla.</div>
}

export function Modal({ abierto, titulo, onCerrar, children, pie }: {
  abierto: boolean
  titulo: string
  onCerrar: () => void
  children: ReactNode
  pie?: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (abierto && !d.open) d.showModal()
    if (!abierto && d.open) d.close()
  }, [abierto])
  return (
    <dialog ref={ref} className="modal" onClose={onCerrar} onCancel={onCerrar}>
      {abierto && (
        <>
          <div className="modal-cab">
            <h2>{titulo}</h2>
            <button className="chico" onClick={onCerrar} aria-label="Cerrar">✕</button>
          </div>
          <div className="modal-cuerpo">{children}</div>
          {pie && <div className="modal-pie">{pie}</div>}
        </>
      )}
    </dialog>
  )
}

export function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <label className="campo">
      <span>{etiqueta}</span>
      {children}
    </label>
  )
}

export function Selector({ valor, onCambio, opciones, vacio }: {
  valor: string | null | undefined
  onCambio: (v: string) => void
  opciones: Record<string, string>
  vacio?: string
}) {
  return (
    <select value={valor ?? ''} onChange={(e) => onCambio(e.target.value)}>
      {vacio !== undefined && <option value="">{vacio}</option>}
      {Object.entries(opciones).map(([k, v]) => (
        <option key={k} value={k}>{v}</option>
      ))}
    </select>
  )
}

/** Carga asíncrona con estado de error/cargando y recarga manual. */
export function useCarga<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [datos, setDatos] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const f = useCallback(fn, deps)
  const recargar = useCallback(async () => {
    setError(null)
    try {
      setDatos(await f())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCargando(false)
    }
  }, [f])
  useEffect(() => {
    setCargando(true)
    void recargar()
  }, [recargar])
  return { datos, error, cargando, recargar, setDatos }
}

export function mensajeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
