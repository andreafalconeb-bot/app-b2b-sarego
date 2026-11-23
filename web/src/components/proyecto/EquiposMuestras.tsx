import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, ok } from '../../lib/supabase'
import { ejecutar, leerConCache } from '../../lib/offline'
import type { Equipo, Muestra, PuntoMuestreo } from '../../lib/tipos'
import { COMPONENTES, GRUPOS_EQUIPO, NOMBRE_ESTADO_MUESTRA, TIPOS_EQUIPO, etiqueta } from '../../lib/catalogos'
import { codigoMuestra, fecha, hoyISO, numero } from '../../lib/formato'
import { imprimirEtiquetas } from '../../lib/qr'
import { AvisoCache, Campo, Cargando, ErrorMsg, Modal, Pill, PillSemaforo, Selector, Vacio, mensajeError, useCarga } from '../ui'
import type { PropsPestana } from '../../pages/Proyecto'

export default function EquiposMuestras({ proyecto, puedeEditar }: PropsPestana) {
  const [equipoEdit, setEquipoEdit] = useState<Partial<Equipo> | null>(null)
  const [puntoEdit, setPuntoEdit] = useState<Partial<PuntoMuestreo> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const { datos, error: errCarga, cargando, recargar } = useCarga(
    () =>
      leerConCache('equipos:' + proyecto.id, async () => {
        const [e, p, m] = await Promise.all([
          supabase.from('b2b_equipos').select('*').eq('proyecto_id', proyecto.id).order('sede').order('codigo_cliente'),
          supabase.from('b2b_puntos_muestreo').select('*').eq('proyecto_id', proyecto.id).order('componente'),
          supabase.from('b2b_muestras').select('*').eq('proyecto_id', proyecto.id).order('created_at', { ascending: false }).limit(500),
        ])
        return { equipos: ok(e) as Equipo[], puntos: ok(p) as PuntoMuestreo[], muestras: ok(m) as Muestra[] }
      }),
    [proyecto.id],
  )
  const equipos = datos?.datos.equipos ?? []
  const puntos = datos?.datos.puntos ?? []
  const muestras = datos?.datos.muestras ?? []

  const programar = async (pt: PuntoMuestreo) => {
    setError(null)
    setMsg(null)
    try {
      const r = await ejecutar(
        { tipo: 'insert', tabla: 'b2b_muestras', fila: { id: crypto.randomUUID(), punto_id: pt.id, fecha_programada: hoyISO(), lubricante: pt.lubricante_actual } },
        'Muestra programada',
      )
      setMsg(r.encolada ? 'Sin señal: la muestra se programará al volver la conexión.' : 'Muestra programada.')
      if (!r.encolada) await recargar()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  const etiquetas = async (pts: PuntoMuestreo[]) => {
    try {
      await imprimirEtiquetas(
        pts.map((pt) => {
          const eq = equipos.find((e) => e.id === pt.equipo_id)
          return {
            token: pt.qr_token,
            titulo: proyecto.nombre_comercial || proyecto.razon_social,
            linea1: [eq?.codigo_cliente, etiqueta(TIPOS_EQUIPO, eq?.tipo), eq?.marca, eq?.modelo].filter(Boolean).join(' · '),
            linea2: etiqueta(COMPONENTES, pt.componente) + (pt.lubricante_actual ? ' · ' + pt.lubricante_actual : ''),
          }
        }),
      )
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  const ultimaDe = (puntoId: string) => muestras.find((m) => m.punto_id === puntoId)

  return (
    <div className="pila">
      <div className="fila-entre">
        <div className="sec chico">
          {equipos.length} equipos · {puntos.length} puntos de muestreo · {muestras.length} muestras
        </div>
        <div className="fila">
          {puntos.length > 0 && <button onClick={() => void etiquetas(puntos)}>Imprimir todas las etiquetas QR</button>}
          {puedeEditar && <button className="primario" onClick={() => setEquipoEdit({ tipo: 'camion', activo: true })}>+ Equipo</button>}
        </div>
      </div>
      <AvisoCache desdeCache={datos?.desdeCache ?? false} />
      <ErrorMsg error={errCarga ?? error} />
      {msg && <div className="aviso ok">{msg}</div>}
      {cargando ? (
        <Cargando />
      ) : equipos.length === 0 ? (
        <div className="tarjeta">
          <Vacio>Carga el inventario de equipos del cliente (marca, modelo, horas) y sus puntos de muestreo.</Vacio>
        </div>
      ) : (
        equipos.map((eq) => {
          const pts = puntos.filter((p) => p.equipo_id === eq.id)
          return (
            <section key={eq.id} className="tarjeta pila">
              <div className="fila-entre">
                <div>
                  <h3>
                    {eq.codigo_cliente ? eq.codigo_cliente + ' · ' : ''}
                    {etiqueta(TIPOS_EQUIPO, eq.tipo)} {eq.marca} {eq.modelo} {eq.anio ?? ''}
                  </h3>
                  <div className="sec chico">
                    {eq.sede ?? 'Sin sede'} · {eq.placa_serial ?? 'Sin placa/serial'} · {numero(eq.horometro)} h · {numero(eq.odometro)} km
                  </div>
                </div>
                {puedeEditar && (
                  <div className="fila">
                    <button className="chico" onClick={() => setEquipoEdit(eq)}>Editar</button>
                    <button className="chico" onClick={() => setPuntoEdit({ equipo_id: eq.id, componente: 'motor', activo: true })}>+ Punto de muestreo</button>
                  </div>
                )}
              </div>
              {pts.length === 0 ? (
                <span className="sec chico">Sin puntos de muestreo.</span>
              ) : (
                <div className="tabla-wrap">
                  <table>
                    <thead>
                      <tr><th>Componente</th><th>Lubricante</th><th>Frecuencia</th><th>Próxima</th><th>Última muestra</th><th></th></tr>
                    </thead>
                    <tbody>
                      {pts.map((pt) => {
                        const u = ultimaDe(pt.id)
                        const vencida = pt.proxima_muestra && pt.proxima_muestra <= hoyISO()
                        return (
                          <tr key={pt.id}>
                            <td><b>{etiqueta(COMPONENTES, pt.componente)}</b>{pt.descripcion && <div className="sec chico">{pt.descripcion}</div>}</td>
                            <td className="chico">{pt.lubricante_actual ?? '—'}{pt.capacidad_litros ? ` · ${pt.capacidad_litros} L` : ''}</td>
                            <td className="chico">
                              {pt.frecuencia_dias ? `cada ${pt.frecuencia_dias} días` : ''}
                              {pt.frecuencia_horas ? ` · ${pt.frecuencia_horas} h` : ''}
                              {!pt.frecuencia_dias && !pt.frecuencia_horas && 'Puntual'}
                            </td>
                            <td className="num">{fecha(pt.proxima_muestra)} {vencida && <Pill tono="alerta">Toca</Pill>}</td>
                            <td>
                              {u ? (
                                <Link to={'/muestra/' + u.id} className="fila chico">
                                  <span className="mono">{codigoMuestra(u.numero)}</span>
                                  <span>{NOMBRE_ESTADO_MUESTRA[u.estado]}</span>
                                  {u.semaforo_final && <PillSemaforo s={u.semaforo_final} />}
                                </Link>
                              ) : (
                                <span className="sec chico">Nunca</span>
                              )}
                            </td>
                            <td>
                              <div className="fila">
                                {puedeEditar && <button className="chico" onClick={() => void programar(pt)}>Programar muestra</button>}
                                <Link className="boton chico" to={'/qr/' + pt.qr_token}>Tomar</Link>
                                <button className="chico" onClick={() => void etiquetas([pt])}>QR</button>
                                {puedeEditar && <button className="chico" onClick={() => setPuntoEdit(pt)}>Editar</button>}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )
        })
      )}

      {muestras.length > 0 && (
        <section className="tarjeta">
          <h2 style={{ marginBottom: 8 }}>Muestras de esta cuenta</h2>
          <div className="tabla-wrap">
            <table>
              <thead><tr><th>Muestra</th><th>Equipo / punto</th><th>Estado</th><th>Toma</th><th>Resultado</th></tr></thead>
              <tbody>
                {muestras.map((m) => {
                  const pt = puntos.find((p) => p.id === m.punto_id)
                  const eq = equipos.find((e) => e.id === m.equipo_id)
                  return (
                    <tr key={m.id}>
                      <td><Link to={'/muestra/' + m.id} className="mono">{codigoMuestra(m.numero)}</Link></td>
                      <td className="chico">{eq?.codigo_cliente ?? eq?.marca} · {etiqueta(COMPONENTES, pt?.componente)}</td>
                      <td className="chico">{NOMBRE_ESTADO_MUESTRA[m.estado]}</td>
                      <td className="num">{fecha(m.fecha_toma ?? m.fecha_programada)}</td>
                      <td><PillSemaforo s={m.semaforo_final ?? m.semaforo_lab} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <EditarEquipo equipo={equipoEdit} proyectoId={proyecto.id} onCerrar={() => setEquipoEdit(null)} onHecho={recargar} />
      <EditarPunto punto={puntoEdit} onCerrar={() => setPuntoEdit(null)} onHecho={recargar} />
    </div>
  )
}

function EditarEquipo({ equipo, proyectoId, onCerrar, onHecho }: { equipo: Partial<Equipo> | null; proyectoId: string; onCerrar: () => void; onHecho: () => Promise<void> }) {
  const [f, setF] = useState<Partial<Equipo>>({})
  const [cargado, setCargado] = useState<Partial<Equipo> | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (equipo !== cargado) {
    setCargado(equipo)
    setF(equipo ?? {})
    setError(null)
  }
  const set = (k: keyof Equipo, v: string) => setF((x) => ({ ...x, [k]: v }))
  const n = (v: unknown) => (v === '' || v == null ? null : Number(v))

  const guardar = async () => {
    const fila = {
      proyecto_id: proyectoId,
      sede: f.sede || null,
      codigo_cliente: f.codigo_cliente || null,
      tipo: f.tipo ?? 'otro',
      marca: f.marca || null,
      modelo: f.modelo || null,
      anio: n(f.anio),
      placa_serial: f.placa_serial || null,
      horometro: n(f.horometro),
      odometro: n(f.odometro),
      notas: f.notas || null,
    }
    try {
      const r = f.id
        ? await ejecutar({ tipo: 'update', tabla: 'b2b_equipos', id: f.id, cambios: fila }, 'Equipo')
        : await ejecutar({ tipo: 'insert', tabla: 'b2b_equipos', fila: { id: crypto.randomUUID(), ...fila } }, 'Equipo nuevo')
      onCerrar()
      if (!r.encolada) await onHecho()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  return (
    <Modal abierto={equipo !== null} titulo={f.id ? 'Editar equipo' : 'Nuevo equipo'} onCerrar={onCerrar} pie={<><button onClick={onCerrar}>Cancelar</button><button className="primario" onClick={() => void guardar()}>Guardar</button></>}>
      <div className="grid grid-2">
        <Campo etiqueta="Tipo">
          <select id="eq-tipo" value={f.tipo ?? 'otro'} onChange={(e) => set('tipo', e.target.value)}>
            {f.tipo && !GRUPOS_EQUIPO.some((g) => f.tipo! in g.tipos) && (
              <option value={f.tipo}>{TIPOS_EQUIPO[f.tipo] ?? f.tipo}</option>
            )}
            {GRUPOS_EQUIPO.map((g) => (
              <optgroup key={g.grupo} label={g.grupo}>
                {Object.entries(g.tipos).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Código en el cliente"><input id="eq-cod" value={f.codigo_cliente ?? ''} onChange={(e) => set('codigo_cliente', e.target.value)} placeholder="Unidad 14" /></Campo>
        <Campo etiqueta="Marca"><input id="eq-marca" value={f.marca ?? ''} onChange={(e) => set('marca', e.target.value)} /></Campo>
        <Campo etiqueta="Modelo"><input id="eq-modelo" value={f.modelo ?? ''} onChange={(e) => set('modelo', e.target.value)} /></Campo>
        <Campo etiqueta="Año"><input id="eq-anio" type="number" value={f.anio ?? ''} onChange={(e) => set('anio', e.target.value)} /></Campo>
        <Campo etiqueta="Placa / serial"><input id="eq-placa" value={f.placa_serial ?? ''} onChange={(e) => set('placa_serial', e.target.value)} /></Campo>
        <Campo etiqueta="Horómetro (h)"><input id="eq-horas" type="number" value={f.horometro ?? ''} onChange={(e) => set('horometro', e.target.value)} /></Campo>
        <Campo etiqueta="Odómetro (km)"><input id="eq-km" type="number" value={f.odometro ?? ''} onChange={(e) => set('odometro', e.target.value)} /></Campo>
      </div>
      <Campo etiqueta="Sede / planta / patio"><input id="eq-sede" value={f.sede ?? ''} onChange={(e) => set('sede', e.target.value)} /></Campo>
      <Campo etiqueta="Notas"><textarea id="eq-notas" value={f.notas ?? ''} onChange={(e) => set('notas', e.target.value)} /></Campo>
      <ErrorMsg error={error} />
    </Modal>
  )
}

function EditarPunto({ punto, onCerrar, onHecho }: { punto: Partial<PuntoMuestreo> | null; onCerrar: () => void; onHecho: () => Promise<void> }) {
  const [f, setF] = useState<Partial<PuntoMuestreo>>({})
  const [cargado, setCargado] = useState<Partial<PuntoMuestreo> | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (punto !== cargado) {
    setCargado(punto)
    setF(punto ?? {})
    setError(null)
  }
  const set = (k: keyof PuntoMuestreo, v: string) => setF((x) => ({ ...x, [k]: v }))
  const n = (v: unknown) => (v === '' || v == null ? null : Number(v))

  const guardar = async () => {
    const fila = {
      equipo_id: f.equipo_id,
      componente: f.componente ?? 'otro',
      descripcion: f.descripcion || null,
      lubricante_actual: f.lubricante_actual || null,
      capacidad_litros: n(f.capacidad_litros),
      frecuencia_dias: n(f.frecuencia_dias),
      frecuencia_horas: n(f.frecuencia_horas),
      proxima_muestra: f.proxima_muestra || null,
    }
    try {
      if (f.id) ok(await supabase.from('b2b_puntos_muestreo').update(fila).eq('id', f.id))
      else ok(await supabase.from('b2b_puntos_muestreo').insert(fila))
      onCerrar()
      await onHecho()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  return (
    <Modal abierto={punto !== null} titulo={f.id ? 'Editar punto de muestreo' : 'Nuevo punto de muestreo'} onCerrar={onCerrar} pie={<><button onClick={onCerrar}>Cancelar</button><button className="primario" onClick={() => void guardar()}>Guardar</button></>}>
      <div className="grid grid-2">
        <Campo etiqueta="Componente"><Selector valor={f.componente} onCambio={(v) => set('componente', v)} opciones={COMPONENTES} /></Campo>
        <Campo etiqueta="Detalle"><input id="pt-desc" value={f.descripcion ?? ''} onChange={(e) => set('descripcion', e.target.value)} placeholder="Diferencial trasero" /></Campo>
        <Campo etiqueta="Lubricante en uso"><input id="pt-lub" value={f.lubricante_actual ?? ''} onChange={(e) => set('lubricante_actual', e.target.value)} placeholder="Mobil Delvac 1300 Super 15W-40" /></Campo>
        <Campo etiqueta="Capacidad (L)"><input id="pt-cap" type="number" value={f.capacidad_litros ?? ''} onChange={(e) => set('capacidad_litros', e.target.value)} /></Campo>
        <Campo etiqueta="Muestrear cada (días)"><input id="pt-dias" type="number" value={f.frecuencia_dias ?? ''} onChange={(e) => set('frecuencia_dias', e.target.value)} /></Campo>
        <Campo etiqueta="o cada (horas de operación)"><input id="pt-horas" type="number" value={f.frecuencia_horas ?? ''} onChange={(e) => set('frecuencia_horas', e.target.value)} /></Campo>
        <Campo etiqueta="Próxima muestra"><input id="pt-prox" type="date" value={f.proxima_muestra ?? ''} onChange={(e) => set('proxima_muestra', e.target.value)} /></Campo>
      </div>
      <p className="sec chico" style={{ margin: 0 }}>Con una frecuencia en días, la próxima muestra se recalcula sola cada vez que se toma una.</p>
      <ErrorMsg error={error} />
    </Modal>
  )
}
