import { useMemo, useState } from 'react'
import { supabase, ok } from '../lib/supabase'
import { leerConCache } from '../lib/offline'
import { nombreDe, usePermisos, useSesion } from '../lib/sesion'
import type { Kit } from '../lib/tipos'
import { fecha } from '../lib/formato'
import { AvisoCache, Campo, Cargando, ErrorMsg, Pill, Vacio, mensajeError, useCarga } from '../components/ui'

const ESTADOS: Record<Kit['estado'], string> = { disponible: 'Disponible', entregado: 'Entregado', usado: 'Usado', anulado: 'Anulado' }

export default function Kits() {
  const { usuarios } = useSesion()
  const p = usePermisos()
  const [codigos, setCodigos] = useState('')
  const [lote, setLote] = useState('')
  const [filtro, setFiltro] = useState<Kit['estado'] | ''>('disponible')
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const puedeEscribir = p.gestion || p.laboratorio || p.ingeniero

  const { datos, error: errCarga, cargando, recargar } = useCarga(
    () => leerConCache('kits', async () => ok(await supabase.from('b2b_kits').select('*').order('codigo').limit(2000)) as Kit[]),
    [],
  )
  const kits = datos?.datos ?? []
  const conteo = useMemo(() => {
    const c: Record<string, number> = {}
    for (const k of kits) c[k.estado] = (c[k.estado] ?? 0) + 1
    return c
  }, [kits])

  const agregar = async () => {
    setError(null)
    setMsg(null)
    const lista = codigos
      .split(/[\s,;]+/)
      .map((c) => c.trim())
      .filter(Boolean)
    if (!lista.length) return setError('Escribe al menos un código.')
    try {
      ok(await supabase.from('b2b_kits').upsert(lista.map((codigo) => ({ codigo, lote: lote || null })), { onConflict: 'codigo', ignoreDuplicates: true }))
      setCodigos('')
      setMsg(`${lista.length} kit(s) cargados.`)
      await recargar()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  const cambiar = async (k: Kit, cambios: Partial<Kit>) => {
    try {
      ok(await supabase.from('b2b_kits').update(cambios).eq('id', k.id))
      await recargar()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  const ingenieros = usuarios.filter((u) => u.activo && ['ingeniero', 'laboratorio', 'gerente'].includes(u.rol))
  const lista = kits.filter((k) => !filtro || k.estado === filtro)

  return (
    <>
      <div className="titulo-pagina">
        <div>
          <h1>Kits de muestreo</h1>
          <div className="sec chico">Inventario de kits y etiquetas del laboratorio</div>
        </div>
      </div>
      <AvisoCache desdeCache={datos?.desdeCache ?? false} />
      <div className="grid grid-4" style={{ marginBottom: 12 }}>
        {(Object.keys(ESTADOS) as Kit['estado'][]).map((e) => (
          <button key={e} className={'metrica' + (e === 'disponible' && (conteo[e] ?? 0) < 10 ? ' alerta' : '')} style={{ textAlign: 'left', display: 'block', outline: filtro === e ? '2px solid var(--acento)' : undefined }} onClick={() => setFiltro(filtro === e ? '' : e)}>
            <div className="v">{conteo[e] ?? 0}</div>
            <div className="e">{ESTADOS[e]}</div>
          </button>
        ))}
      </div>
      {(conteo.disponible ?? 0) < 10 && <div className="aviso alerta" style={{ marginBottom: 12 }}>Quedan pocos kits disponibles. Pide más al laboratorio.</div>}
      <ErrorMsg error={errCarga ?? error} />
      {msg && <div className="aviso ok">{msg}</div>}
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(260px, 1fr)', alignItems: 'start' }}>
        <section className="tarjeta tabla-wrap min0">
          {cargando ? (
            <Cargando />
          ) : lista.length === 0 ? (
            <Vacio>No hay kits {filtro ? 'en este estado' : 'cargados'}.</Vacio>
          ) : (
            <table>
              <thead><tr><th>Código</th><th>Lote</th><th>Estado</th><th>Entregado a</th><th></th></tr></thead>
              <tbody>
                {lista.map((k) => (
                  <tr key={k.id}>
                    <td className="mono">{k.codigo}</td>
                    <td className="chico">{k.lote ?? '—'}</td>
                    <td><Pill tono={k.estado === 'disponible' ? 'ok' : k.estado === 'entregado' ? 'acento' : undefined}>{ESTADOS[k.estado]}</Pill></td>
                    <td className="chico">{k.entregado_a ? `${nombreDe(usuarios, k.entregado_a)} · ${fecha(k.entregado_at)}` : '—'}</td>
                    <td>
                      {puedeEscribir && k.estado === 'disponible' && (
                        <select value="" onChange={(e) => e.target.value && void cambiar(k, { estado: 'entregado', entregado_a: e.target.value, entregado_at: new Date().toISOString() })} style={{ width: 170 }}>
                          <option value="">Entregar a…</option>
                          {ingenieros.map((u) => <option key={u.user_id} value={u.user_id}>{u.nombre}</option>)}
                        </select>
                      )}
                      {puedeEscribir && k.estado === 'entregado' && <button className="chico" onClick={() => void cambiar(k, { estado: 'disponible', entregado_a: null, entregado_at: null })}>Devolver</button>}
                      {puedeEscribir && k.estado !== 'anulado' && k.estado !== 'usado' && <button className="chico" onClick={() => void cambiar(k, { estado: 'anulado' })}>Anular</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        {puedeEscribir && (
          <section className="tarjeta pila">
            <h2>Cargar kits</h2>
            <Campo etiqueta="Códigos (uno por línea o separados por coma)"><textarea value={codigos} onChange={(e) => setCodigos(e.target.value)} placeholder={'SA-10021\nSA-10022'} /></Campo>
            <Campo etiqueta="Lote"><input value={lote} onChange={(e) => setLote(e.target.value)} /></Campo>
            <div><button className="primario" onClick={() => void agregar()}>Cargar</button></div>
          </section>
        )}
      </div>
    </>
  )
}
