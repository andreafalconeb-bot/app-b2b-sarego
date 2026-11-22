import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, ok } from '../lib/supabase'
import { ejecutar, leerConCache } from '../lib/offline'
import { nombreDe, usePermisos, useSesion } from '../lib/sesion'
import type { Contacto, Documento, Equipo, Kit, Muestra, Parametro, PuntoMuestreo, Resultado, Semaforo } from '../lib/tipos'
import { COMPONENTES, ESTADOS_MUESTRA, GRUPOS_PARAMETRO, NOMBRE_ESTADO_MUESTRA, SEMAFORO, TIPOS_EQUIPO, etiqueta } from '../lib/catalogos'
import { codigoMuestra, fecha, fechaHora, hoyISO, numero } from '../lib/formato'
import { AvisoCache, Campo, Cargando, ErrorMsg, Pill, PillSemaforo, PuntoSemaforo, Selector, mensajeError, useCarga } from '../components/ui'
import { abrirDocumento, subirDocumento } from '../components/proyecto/Documentos'
import { semaforoPorLimites, peor, type Limite } from '../lib/semaforo'

interface Datos {
  muestra: Muestra
  punto: PuntoMuestreo
  equipo: Equipo
  proyecto: { id: string; razon_social: string; nombre_comercial: string | null; responsable_id: string | null }
  resultados: Resultado[]
  historial: { estado_anterior: string | null; estado_nuevo: string; por: string | null; ts: string }[]
  docs: Documento[]
  previas: (Muestra & { b2b_resultados: Resultado[] })[]
  parametros: Parametro[]
  limites: Limite[]
  contactos: Contacto[]
}

export default function MuestraPagina() {
  const { id } = useParams()
  const { usuarios, yo } = useSesion()
  const p = usePermisos()
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const { datos, error: errCarga, cargando, recargar } = useCarga(
    () =>
      leerConCache('muestra:' + id, async (): Promise<Datos> => {
        const m = ok(await supabase.from('b2b_muestras').select('*').eq('id', id!).single()) as Muestra
        const [pt, eq, pr, rs, hi, dc, pv, pa, li, ct] = await Promise.all([
          supabase.from('b2b_puntos_muestreo').select('*').eq('id', m.punto_id).single(),
          supabase.from('b2b_equipos').select('*').eq('id', m.equipo_id).single(),
          supabase.from('b2b_proyectos').select('id, razon_social, nombre_comercial, responsable_id').eq('id', m.proyecto_id).single(),
          supabase.from('b2b_resultados').select('*').eq('muestra_id', m.id),
          supabase.from('b2b_muestra_historial').select('estado_anterior, estado_nuevo, por, ts').eq('muestra_id', m.id).order('ts'),
          supabase.from('b2b_documentos').select('*').eq('muestra_id', m.id).order('created_at'),
          supabase
            .from('b2b_muestras')
            .select('*, b2b_resultados(*)')
            .eq('punto_id', m.punto_id)
            .in('estado', ['resultado_cargado', 'interpretada', 'comunicada', 'cerrada'])
            .order('fecha_toma', { ascending: true })
            .limit(12),
          supabase.from('b2b_parametros').select('*').order('orden'),
          supabase.from('b2b_limites').select('*'),
          supabase.from('b2b_contactos').select('*').eq('proyecto_id', m.proyecto_id).order('nombre'),
        ])
        return {
          muestra: m,
          punto: ok(pt) as PuntoMuestreo,
          equipo: ok(eq) as Equipo,
          proyecto: ok(pr) as Datos['proyecto'],
          resultados: ok(rs) as Resultado[],
          historial: ok(hi) as Datos['historial'],
          docs: ok(dc) as Documento[],
          previas: ok(pv) as Datos['previas'],
          parametros: ok(pa) as Parametro[],
          limites: ok(li) as Limite[],
          contactos: ok(ct) as Contacto[],
        }
      }),
    [id],
  )

  if (cargando) return <Cargando />
  if (errCarga || !datos) return <ErrorMsg error={errCarga ?? 'No se encontró la muestra.'} />
  const d = datos.datos
  const m = d.muestra
  const puedeEditar = !p.soloLectura
  const idx = ESTADOS_MUESTRA.findIndex((e) => e.codigo === m.estado)

  const guardar = async (cambios: Partial<Muestra>, texto: string) => {
    setError(null)
    setMsg(null)
    try {
      const r = await ejecutar({ tipo: 'update', tabla: 'b2b_muestras', id: m.id, cambios }, `${codigoMuestra(m.numero)}: ${texto}`)
      setMsg(r.encolada ? 'Sin señal: el cambio se guardó en el teléfono y se enviará solo.' : texto + '.')
      if (!r.encolada) await recargar()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  return (
    <>
      <AvisoCache desdeCache={datos.desdeCache} />
      <div className="tarjeta" style={{ marginBottom: 12 }}>
        <div className="fila-entre">
          <div className="min0">
            <div className="fila">
              <span className="mono">{codigoMuestra(m.numero)}</span>
              <Pill tono={m.estado === 'anulada' ? 'critico' : 'acento'}>{NOMBRE_ESTADO_MUESTRA[m.estado]}</Pill>
              <PillSemaforo s={m.semaforo_final ?? m.semaforo_lab} />
              {m.facturable && <Pill tono="ambar">Facturable</Pill>}
            </div>
            <h1 style={{ marginTop: 4 }}>
              <Link to={`/proyecto/${d.proyecto.id}?p=equipos`}>{d.proyecto.nombre_comercial || d.proyecto.razon_social}</Link>
            </h1>
            <div className="sec chico">
              {[d.equipo.codigo_cliente, etiqueta(TIPOS_EQUIPO, d.equipo.tipo), d.equipo.marca, d.equipo.modelo].filter(Boolean).join(' · ')} ·{' '}
              <b>{etiqueta(COMPONENTES, d.punto.componente)}</b>
              {d.punto.descripcion ? ' (' + d.punto.descripcion + ')' : ''} · {m.lubricante ?? d.punto.lubricante_actual ?? 'lubricante sin indicar'}
            </div>
          </div>
          <div className="chico sec">Responsable: {nombreDe(usuarios, d.proyecto.responsable_id)}</div>
        </div>
        <div className="avance" style={{ marginTop: 12 }}>
          {ESTADOS_MUESTRA.map((e, i) => (
            <span key={e.codigo} title={e.nombre} className={i < idx ? 'hecha' : i === idx ? 'actual' : ''} />
          ))}
        </div>
      </div>
      <ErrorMsg error={error} />
      {msg && <div className="aviso ok" style={{ marginBottom: 12 }}>{msg}</div>}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(280px, 2fr)', alignItems: 'start' }}>
        <div className="pila min0">
          {puedeEditar && m.estado !== 'anulada' && m.estado !== 'cerrada' && (
            <PasoActual d={d} guardar={guardar} recargar={recargar} yo={yo?.id ?? ''} setError={setError} />
          )}
          <Resultados d={d} puedeEditar={puedeEditar && ['enviada', 'recibida_lab', 'resultado_cargado', 'interpretada'].includes(m.estado)} recargar={recargar} guardar={guardar} />
          <Tendencia d={d} />
        </div>

        <aside className="pila">
          <section className="tarjeta pila chico">
            <h2>Datos de la muestra</h2>
            <Dato t="Programada" v={fecha(m.fecha_programada)} />
            <Dato t="Tomada" v={fechaHora(m.fecha_toma)} extra={m.tomada_por ? nombreDe(usuarios, m.tomada_por) : undefined} />
            <Dato t="Horas / km del equipo" v={`${numero(m.horas_equipo)} h · ${numero(m.km_equipo)} km`} />
            <Dato t="Horas / km del aceite" v={`${numero(m.horas_aceite)} h · ${numero(m.km_aceite)} km`} />
            <Dato t="Relleno" v={m.relleno_litros != null ? `${m.relleno_litros} L` : '—'} />
            <Dato t="Kit" v={m.kit_id ? 'Asignado' : '—'} />
            <Dato t="Nº del laboratorio" v={m.numero_lab ?? '—'} />
            <Dato t="Guía de envío" v={m.guia_envio ?? '—'} />
            <Dato t="Enviada" v={fecha(m.fecha_envio)} />
            <Dato t="Recibida por el laboratorio" v={fecha(m.fecha_recepcion_lab)} />
            <Dato t="Resultado" v={fecha(m.fecha_resultado)} />
            <Dato t="Comunicada al cliente" v={fechaHora(m.comunicada_at)} />
            {m.interpretacion && <p style={{ margin: 0 }}><b>Interpretación:</b> {m.interpretacion}</p>}
            {m.recomendacion && <p style={{ margin: 0 }}><b>Recomendación:</b> {m.recomendacion}</p>}
            {m.notas && <p style={{ margin: 0 }}><b>Notas:</b> {m.notas}</p>}
            {puedeEditar && (
              <label className="check">
                <input type="checkbox" checked={m.facturable} onChange={(e) => void guardar({ facturable: e.target.checked }, 'Facturación actualizada')} /> Se le cobra al cliente
              </label>
            )}
          </section>

          <ArchivosMuestra d={d} puedeEditar={puedeEditar} recargar={recargar} setError={setError} />

          <section className="tarjeta chico">
            <h2 style={{ marginBottom: 6 }}>Historial</h2>
            {d.historial.map((h, i) => (
              <div key={i} className="fila-entre">
                <span>{NOMBRE_ESTADO_MUESTRA[h.estado_nuevo] ?? h.estado_nuevo}</span>
                <span className="sec">{fechaHora(h.ts)} · {nombreDe(usuarios, h.por)}</span>
              </div>
            ))}
            {puedeEditar && m.estado !== 'anulada' && (
              <div style={{ marginTop: 8 }}>
                <button className="chico peligro" onClick={() => void guardar({ estado: 'anulada' }, 'Muestra anulada')}>Anular muestra</button>
              </div>
            )}
          </section>
        </aside>
      </div>
    </>
  )
}

function Dato({ t, v, extra }: { t: string; v: string; extra?: string }) {
  return (
    <div className="fila-entre">
      <span className="sec">{t}</span>
      <span className="num" style={{ textAlign: 'right' }}>
        {v}
        {extra && <span className="sec"> · {extra}</span>}
      </span>
    </div>
  )
}

/** El formulario del paso en que está la muestra. */
function PasoActual({ d, guardar, recargar, yo, setError }: {
  d: Datos
  guardar: (c: Partial<Muestra>, t: string) => Promise<void>
  recargar: () => Promise<void>
  yo: string
  setError: (e: string | null) => void
}) {
  const m = d.muestra
  const [f, setF] = useState<Partial<Muestra>>({})
  const [kits, setKits] = useState<Kit[]>([])
  useEffect(() => {
    setF({})
  }, [m.estado])
  useEffect(() => {
    if (m.estado === 'programada')
      void supabase.from('b2b_kits').select('*').eq('estado', 'disponible').order('codigo').limit(200).then(({ data }) => setKits((data as Kit[]) ?? []))
  }, [m.estado])
  const v = <K extends keyof Muestra>(k: K) => (f[k] !== undefined ? f[k] : m[k]) as Muestra[K]
  const set = (k: keyof Muestra, val: unknown) => setF((x) => ({ ...x, [k]: val }))
  const num = (k: keyof Muestra, t: string) => (
    <Campo etiqueta={t}>
      <input type="number" step="any" value={(v(k) as number | null) ?? ''} onChange={(e) => set(k, e.target.value === '' ? null : Number(e.target.value))} />
    </Campo>
  )
  const peorSemaforo = peor(m.semaforo_lab, m.semaforo_limites)

  const entregarKit = async (kitId: string) => {
    try {
      ok(await supabase.from('b2b_kits').update({ estado: 'entregado', entregado_a: yo, entregado_at: new Date().toISOString() }).eq('id', kitId))
      await guardar({ kit_id: kitId, estado: 'kit_entregado' }, 'Kit entregado')
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  let cuerpo: React.ReactNode = null
  if (m.estado === 'programada' || m.estado === 'kit_entregado') {
    cuerpo = (
      <>
        {m.estado === 'programada' && kits.length > 0 && (
          <Campo etiqueta="Entregar kit (opcional)">
            <select defaultValue="" onChange={(e) => e.target.value && void entregarKit(e.target.value)}>
              <option value="">Elegir kit disponible…</option>
              {kits.map((k) => (
                <option key={k.id} value={k.id}>{k.codigo}{k.lote ? ' · lote ' + k.lote : ''}</option>
              ))}
            </select>
          </Campo>
        )}
        <p className="sec chico" style={{ margin: 0 }}>En la planta es más rápido escanear la etiqueta QR del punto.</p>
        <div className="grid grid-3">
          {num('horas_equipo', 'Horas del equipo')}
          {num('km_equipo', 'Km del equipo')}
          {num('horas_aceite', 'Horas del aceite')}
          {num('km_aceite', 'Km del aceite')}
          {num('relleno_litros', 'Relleno (L)')}
          <Campo etiqueta="Lubricante"><input value={(v('lubricante') as string) ?? ''} onChange={(e) => set('lubricante', e.target.value)} /></Campo>
        </div>
        <div>
          <button className="primario" onClick={() => void guardar({ ...f, estado: 'tomada', fecha_toma: new Date().toISOString(), tomada_por: yo }, 'Muestra tomada')}>Registrar toma</button>
        </div>
      </>
    )
  } else if (m.estado === 'tomada') {
    cuerpo = (
      <>
        <div className="grid grid-3">
          <Campo etiqueta="Nº de muestra del laboratorio"><input value={(v('numero_lab') as string) ?? ''} onChange={(e) => set('numero_lab', e.target.value)} /></Campo>
          <Campo etiqueta="Guía de envío"><input value={(v('guia_envio') as string) ?? ''} onChange={(e) => set('guia_envio', e.target.value)} /></Campo>
          <Campo etiqueta="Fecha de envío"><input type="date" value={(v('fecha_envio') as string) ?? hoyISO()} onChange={(e) => set('fecha_envio', e.target.value)} /></Campo>
        </div>
        <div>
          <button className="primario" onClick={() => void guardar({ fecha_envio: hoyISO(), ...f, estado: 'enviada' }, 'Enviada al laboratorio')}>Marcar como enviada</button>
        </div>
      </>
    )
  } else if (m.estado === 'enviada') {
    cuerpo = (
      <div className="fila">
        <input type="date" defaultValue={hoyISO()} onChange={(e) => set('fecha_recepcion_lab', e.target.value)} style={{ maxWidth: 180 }} />
        <button className="primario" onClick={() => void guardar({ fecha_recepcion_lab: hoyISO(), ...f, estado: 'recibida_lab' }, 'Recibida por el laboratorio')}>El laboratorio la recibió</button>
        <span className="sec chico">o carga directamente los resultados abajo</span>
      </div>
    )
  } else if (m.estado === 'recibida_lab') {
    cuerpo = <p className="chico" style={{ margin: 0 }}>Carga los resultados abajo cuando llegue el informe del laboratorio (PDF por correo).</p>
  } else if (m.estado === 'resultado_cargado') {
    cuerpo = (
      <>
        <div className="grid grid-2">
          <Campo etiqueta="Semáforo final (lo confirma el ingeniero)">
            <Selector valor={(v('semaforo_final') as string) ?? peorSemaforo ?? ''} onCambio={(x) => set('semaforo_final', x)} opciones={SEMAFORO} vacio="—" />
          </Campo>
          <div className="chico sec" style={{ alignSelf: 'end' }}>
            Laboratorio: {etiqueta(SEMAFORO, m.semaforo_lab)} · Límites: {etiqueta(SEMAFORO, m.semaforo_limites)}
          </div>
        </div>
        <Campo etiqueta="Interpretación"><textarea value={(v('interpretacion') as string) ?? ''} onChange={(e) => set('interpretacion', e.target.value)} placeholder="Hierro alto con silicio alto: ingreso de polvo por el filtro de aire…" /></Campo>
        <Campo etiqueta="Recomendación al cliente"><textarea value={(v('recomendacion') as string) ?? ''} onChange={(e) => set('recomendacion', e.target.value)} /></Campo>
        <div className="aviso chico">Si queda en <b>Crítico</b>, la app crea sola 3 compromisos: avisar al cliente en 24 h, cambio de aceite y repetir la muestra.</div>
        <div>
          <button
            className="primario"
            onClick={() => {
              const sf = (v('semaforo_final') as Semaforo | null) ?? peorSemaforo
              if (!sf) return setError('Elige el semáforo final.')
              void guardar({ ...f, semaforo_final: sf, estado: 'interpretada', interpretada_at: new Date().toISOString(), interpretada_por: yo } as Partial<Muestra>, 'Muestra interpretada')
            }}
          >
            Guardar interpretación
          </button>
        </div>
      </>
    )
  } else if (m.estado === 'interpretada') {
    cuerpo = (
      <>
        <Campo etiqueta="A quién se le comunicó">
          <Selector valor={(f as { comunicada_a?: string }).comunicada_a ?? ''} onCambio={(x) => set('comunicada_a' as keyof Muestra, x)} opciones={Object.fromEntries(d.contactos.map((c) => [c.id, c.nombre + (c.cargo ? ' · ' + c.cargo : '')]))} vacio="—" />
        </Campo>
        <div className="fila">
          <button className="primario" onClick={() => void guardar({ ...f, estado: 'comunicada', comunicada_at: new Date().toISOString() }, 'Comunicada al cliente')}>Marcar como comunicada</button>
          <button
            onClick={async () => {
              for (const doc of d.docs) await supabase.from('b2b_documentos').update({ visible_cliente: true }).eq('id', doc.id)
              await recargar()
            }}
          >
            Publicar informes en el portal del cliente
          </button>
        </div>
      </>
    )
  } else if (m.estado === 'comunicada') {
    cuerpo = (
      <div>
        <button className="primario" onClick={() => void guardar({ estado: 'cerrada' }, 'Muestra cerrada')}>Cerrar muestra</button>
      </div>
    )
  }

  return (
    <section className="tarjeta pila">
      <h2>Siguiente paso: {NOMBRE_ESTADO_MUESTRA[m.estado]}</h2>
      {cuerpo}
    </section>
  )
}

function Resultados({ d, puedeEditar, recargar, guardar }: {
  d: Datos
  puedeEditar: boolean
  recargar: () => Promise<void>
  guardar: (c: Partial<Muestra>, t: string) => Promise<void>
}) {
  const m = d.muestra
  const [valores, setValores] = useState<Record<string, { valor: string; texto: string; semaforo: string }>>({})
  const [semLab, setSemLab] = useState<string>(m.semaforo_lab ?? '')
  const [fechaRes, setFechaRes] = useState(m.fecha_resultado ?? hoyISO())
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    const ini: typeof valores = {}
    for (const r of d.resultados) ini[r.parametro_codigo] = { valor: r.valor?.toString() ?? '', texto: r.valor_texto ?? '', semaforo: r.semaforo ?? '' }
    setValores(ini)
  }, [d.resultados])

  const grupos = useMemo(() => {
    const g = new Map<string, Parametro[]>()
    for (const p of d.parametros) g.set(p.grupo, [...(g.get(p.grupo) ?? []), p])
    return [...g.entries()]
  }, [d.parametros])

  const hayResultados = d.resultados.length > 0
  if (!puedeEditar && !hayResultados) return null

  const semPorLimite = (p: Parametro, val: string) =>
    val === '' ? null : semaforoPorLimites(d.limites, p.codigo, Number(val), d.punto.componente, d.equipo.tipo)

  const guardarTodo = async () => {
    setError(null)
    setGuardando(true)
    try {
      const filas = Object.entries(valores)
        .filter(([, x]) => x.valor !== '' || x.texto !== '')
        .map(([codigo, x]) => {
          const par = d.parametros.find((p) => p.codigo === codigo)!
          return {
            muestra_id: m.id,
            parametro_codigo: codigo,
            valor: x.valor === '' ? null : Number(x.valor),
            valor_texto: x.texto || null,
            unidad: par.unidad,
            semaforo: (x.semaforo || semPorLimite(par, x.valor) || null) as Semaforo | null,
            origen: 'manual',
          }
        })
      if (filas.length) ok(await supabase.from('b2b_resultados').upsert(filas, { onConflict: 'muestra_id,parametro_codigo' }))
      const semLimites = peor(...filas.map((f) => f.semaforo))
      await guardar(
        {
          semaforo_lab: (semLab || null) as Semaforo | null,
          semaforo_limites: semLimites,
          fecha_resultado: fechaRes,
          ...(['enviada', 'recibida_lab'].includes(m.estado) ? { estado: 'resultado_cargado' as const } : {}),
        },
        'Resultados guardados',
      )
      await recargar()
    } catch (e) {
      setError(navigator.onLine ? mensajeError(e) : 'Los resultados necesitan señal para guardarse.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="tarjeta pila">
      <div className="fila-entre">
        <h2>Resultados del laboratorio</h2>
        {puedeEditar && <span className="sec chico">Sube el PDF en "Archivos" y copia aquí los valores</span>}
      </div>
      {puedeEditar && (
        <div className="grid grid-3">
          <Campo etiqueta="Semáforo del laboratorio">
            <Selector valor={semLab} onCambio={setSemLab} opciones={SEMAFORO} vacio="Sin indicar" />
          </Campo>
          <Campo etiqueta="Fecha del informe"><input type="date" value={fechaRes} onChange={(e) => setFechaRes(e.target.value)} /></Campo>
        </div>
      )}
      <div className="tabla-wrap">
        <table>
          <thead><tr><th>Parámetro</th><th>Valor</th><th>Unidad</th><th>Semáforo</th></tr></thead>
          <tbody>
            {grupos.map(([grupo, pars]) => (
              <Fragment key={grupo}>
                <tr><td colSpan={4} className="sec chico" style={{ background: 'var(--superficie-2)', fontWeight: 600 }}>{GRUPOS_PARAMETRO[grupo] ?? grupo}</td></tr>
                {pars.map((p) => {
                  const x = valores[p.codigo] ?? { valor: '', texto: '', semaforo: '' }
                  const auto = semPorLimite(p, x.valor)
                  if (!puedeEditar && x.valor === '' && x.texto === '') return null
                  return (
                    <tr key={p.codigo}>
                      <td>{p.nombre}</td>
                      <td style={{ width: 130 }}>
                        {puedeEditar ? (
                          p.codigo === 'iso4406' ? (
                            <input value={x.texto} placeholder="18/16/13" onChange={(e) => setValores({ ...valores, [p.codigo]: { ...x, texto: e.target.value } })} />
                          ) : (
                            <input type="number" step="any" value={x.valor} onChange={(e) => setValores({ ...valores, [p.codigo]: { ...x, valor: e.target.value } })} />
                          )
                        ) : (
                          <span className="num">{x.texto || x.valor}</span>
                        )}
                      </td>
                      <td className="sec chico">{p.unidad ?? ''}</td>
                      <td style={{ width: 160 }}>
                        {puedeEditar ? (
                          <Selector valor={x.semaforo} onCambio={(s) => setValores({ ...valores, [p.codigo]: { ...x, semaforo: s } })} opciones={SEMAFORO} vacio={auto ? `Auto: ${SEMAFORO[auto]}` : '—'} />
                        ) : (
                          <span className="fila"><PuntoSemaforo s={(x.semaforo || null) as Semaforo | null} /> {etiqueta(SEMAFORO, x.semaforo)}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {puedeEditar && (
        <div className="fila">
          <button className="primario" disabled={guardando} onClick={() => void guardarTodo()}>{guardando ? 'Guardando…' : 'Guardar resultados'}</button>
          <span className="sec chico">La lectura automática del PDF llega en la fase 2; los valores quedan marcados como "manual".</span>
        </div>
      )}
      <ErrorMsg error={error} />
    </section>
  )
}

/** Tendencia por parámetro en las últimas muestras del mismo punto. */
function Tendencia({ d }: { d: Datos }) {
  const previas = d.previas
  if (previas.length < 2) return null
  const codigos = d.parametros.filter((p) => previas.some((m) => m.b2b_resultados.some((r) => r.parametro_codigo === p.codigo && r.valor != null)))
  return (
    <section className="tarjeta pila">
      <h2>Tendencia de este punto ({previas.length} muestras)</h2>
      <div className="tabla-wrap">
        <table>
          <thead>
            <tr>
              <th>Parámetro</th>
              <th>Tendencia</th>
              {previas.map((m) => (
                <th key={m.id} className="num">
                  <Link to={'/muestra/' + m.id}>{fecha(m.fecha_toma)}</Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {codigos.map((p) => {
              const serie = previas.map((m) => m.b2b_resultados.find((r) => r.parametro_codigo === p.codigo))
              return (
                <tr key={p.codigo}>
                  <td className="chico">{p.nombre}</td>
                  <td><Sparkline valores={serie.map((r) => r?.valor ?? null)} /></td>
                  {serie.map((r, i) => (
                    <td key={i} className="num chico">
                      <span className="fila" style={{ gap: 4, flexWrap: 'nowrap' }}>
                        {r?.semaforo && <PuntoSemaforo s={r.semaforo} />}
                        {r?.valor != null ? numero(r.valor, 2) : '—'}
                      </span>
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Sparkline({ valores }: { valores: (number | null)[] }) {
  const pts = valores.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v != null)
  if (pts.length < 2) return <span className="sec">—</span>
  const w = 90
  const h = 24
  const min = Math.min(...pts.map((p) => p.v))
  const max = Math.max(...pts.map((p) => p.v))
  const x = (i: number) => (i / (valores.length - 1)) * (w - 4) + 2
  const y = (v: number) => (max === min ? h / 2 : h - 3 - ((v - min) / (max - min)) * (h - 6))
  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const ult = pts[pts.length - 1]
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Tendencia">
      <path d={d} fill="none" stroke="var(--acento)" strokeWidth={1.5} />
      <circle cx={x(ult.i)} cy={y(ult.v)} r={2.5} fill="var(--ambar)" />
    </svg>
  )
}

function ArchivosMuestra({ d, puedeEditar, recargar, setError }: { d: Datos; puedeEditar: boolean; recargar: () => Promise<void>; setError: (e: string | null) => void }) {
  const [categoria, setCategoria] = useState('analisis_aceite')
  const subir = async (files: FileList | null) => {
    if (!files?.length) return
    try {
      for (const f of Array.from(files))
        await subirDocumento({ proyectoId: d.proyecto.id, archivo: f, categoria, muestraId: d.muestra.id, equipoId: d.equipo.id, descripcion: codigoMuestra(d.muestra.numero) })
      await recargar()
    } catch (e) {
      setError(navigator.onLine ? mensajeError(e) : 'Los archivos necesitan señal para subirse.')
    }
  }
  return (
    <section className="tarjeta pila chico">
      <h2>Archivos</h2>
      {d.docs.length === 0 && <span className="sec">Sin archivos. Sube el informe PDF del laboratorio y las fotos de la toma.</span>}
      {d.docs.map((doc) => (
        <div key={doc.id} className="fila-entre">
          <button className="chico" onClick={() => void abrirDocumento(doc.storage_path).catch((e) => setError(mensajeError(e)))}>{doc.nombre}</button>
          {doc.visible_cliente && <Pill tono="acento">En el portal</Pill>}
        </div>
      ))}
      {puedeEditar && (
        <>
          <div className="fila">
            <label className="check"><input type="radio" name="catm" checked={categoria === 'analisis_aceite'} onChange={() => setCategoria('analisis_aceite')} /> Informe del laboratorio</label>
            <label className="check"><input type="radio" name="catm" checked={categoria === 'foto'} onChange={() => setCategoria('foto')} /> Foto</label>
          </div>
          <input type="file" multiple accept=".pdf,image/*,.xlsx,.csv" capture={categoria === 'foto' ? 'environment' : undefined} onChange={(e) => void subir(e.target.files)} />
        </>
      )}
    </section>
  )
}
