import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, ok } from '../lib/supabase'
import { ejecutar, leerConCache } from '../lib/offline'
import { useSesion } from '../lib/sesion'
import type { Equipo, Kit, Muestra, PuntoMuestreo } from '../lib/tipos'
import { COMPONENTES, NOMBRE_ESTADO_MUESTRA, TIPOS_EQUIPO, etiqueta } from '../lib/catalogos'
import { codigoMuestra, fecha, numero } from '../lib/formato'
import { AvisoCache, Campo, Cargando, ErrorMsg, PillSemaforo, mensajeError, useCarga } from '../components/ui'
import { subirDocumento } from '../components/proyecto/Documentos'

interface Datos {
  punto: PuntoMuestreo
  equipo: Equipo
  proyecto: { id: string; razon_social: string; nombre_comercial: string | null }
  abierta: Muestra | null
  ultimas: Muestra[]
  kits: Kit[]
}

/** Lo que se abre al escanear la etiqueta QR pegada en el equipo. */
export default function QrPunto() {
  const { token } = useParams()
  const { yo } = useSesion()
  const [f, setF] = useState({ horas_equipo: '', km_equipo: '', horas_aceite: '', km_aceite: '', relleno_litros: '', lubricante: '', kit_id: '', notas: '' })
  const [fotos, setFotos] = useState<File[]>([])
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const { datos, error: errCarga, cargando } = useCarga(
    () =>
      leerConCache('qr:' + token, async (): Promise<Datos> => {
        const punto = ok(await supabase.from('b2b_puntos_muestreo').select('*').eq('qr_token', token!).maybeSingle()) as PuntoMuestreo | null
        if (!punto) throw new Error('Esta etiqueta no corresponde a ningún punto de muestreo al que tengas acceso.')
        const [eq, pr, ms, ks] = await Promise.all([
          supabase.from('b2b_equipos').select('*').eq('id', punto.equipo_id).single(),
          supabase.from('b2b_proyectos').select('id, razon_social, nombre_comercial').eq('id', punto.proyecto_id).single(),
          supabase.from('b2b_muestras').select('*').eq('punto_id', punto.id).neq('estado', 'anulada').order('created_at', { ascending: false }).limit(5),
          supabase.from('b2b_kits').select('*').in('estado', ['disponible', 'entregado']).order('codigo').limit(200),
        ])
        const muestras = ok(ms) as Muestra[]
        return {
          punto,
          equipo: ok(eq) as Equipo,
          proyecto: ok(pr) as Datos['proyecto'],
          abierta: muestras.find((m) => m.estado === 'programada' || m.estado === 'kit_entregado') ?? null,
          ultimas: muestras,
          kits: ok(ks) as Kit[],
        }
      }),
    [token],
  )

  if (cargando) return <Cargando />
  if (errCarga || !datos) return <ErrorMsg error={errCarga} />
  const d = datos.datos
  const n = (v: string) => (v === '' ? null : Number(v))

  const tomarGps = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => setGps({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setError('No se pudo leer la ubicación.'),
      { enableHighAccuracy: true, timeout: 15000 },
    )

  const registrar = async () => {
    setError(null)
    setGuardando(true)
    const kit = f.kit_id || d.abierta?.kit_id || null
    const cambios = {
      estado: 'tomada',
      fecha_toma: new Date().toISOString(),
      tomada_por: yo?.id,
      horas_equipo: n(f.horas_equipo),
      km_equipo: n(f.km_equipo),
      horas_aceite: n(f.horas_aceite),
      km_aceite: n(f.km_aceite),
      relleno_litros: n(f.relleno_litros),
      lubricante: f.lubricante || d.punto.lubricante_actual,
      kit_id: kit,
      notas: f.notas || null,
      lat: gps?.lat ?? null,
      lng: gps?.lng ?? null,
    }
    try {
      const muestraId = d.abierta?.id ?? crypto.randomUUID()
      const r = d.abierta
        ? await ejecutar({ tipo: 'update', tabla: 'b2b_muestras', id: muestraId, cambios }, 'Toma de muestra')
        : await ejecutar({ tipo: 'insert', tabla: 'b2b_muestras', fila: { id: muestraId, punto_id: d.punto.id, ...cambios } }, 'Toma de muestra')
      // Horómetro/odómetro del equipo al día
      if (cambios.horas_equipo != null || cambios.km_equipo != null) {
        await ejecutar(
          {
            tipo: 'update',
            tabla: 'b2b_equipos',
            id: d.equipo.id,
            cambios: {
              ...(cambios.horas_equipo != null ? { horometro: cambios.horas_equipo } : {}),
              ...(cambios.km_equipo != null ? { odometro: cambios.km_equipo } : {}),
            },
          },
          'Horómetro del equipo',
        )
      }
      let aviso = r.encolada ? 'Sin señal: la toma quedó guardada en el teléfono y se enviará sola.' : 'Muestra registrada.'
      if (fotos.length) {
        if (r.encolada) aviso += ' Las fotos necesitan señal: súbelas luego desde la muestra.'
        else {
          for (const foto of fotos)
            await subirDocumento({ proyectoId: d.proyecto.id, archivo: foto, categoria: 'foto', muestraId, equipoId: d.equipo.id })
        }
      }
      setHecho(aviso)
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }} className="pila">
      <AvisoCache desdeCache={datos.desdeCache} />
      <section className="tarjeta pila">
        <span className="sec chico">Toma de muestra</span>
        <h1>{d.proyecto.nombre_comercial || d.proyecto.razon_social}</h1>
        <div>
          <b>{[d.equipo.codigo_cliente, etiqueta(TIPOS_EQUIPO, d.equipo.tipo), d.equipo.marca, d.equipo.modelo].filter(Boolean).join(' · ')}</b>
          <div className="sec chico">
            {etiqueta(COMPONENTES, d.punto.componente)} · {d.punto.lubricante_actual ?? 'lubricante sin indicar'} · último horómetro {numero(d.equipo.horometro)} h · {numero(d.equipo.odometro)} km
          </div>
        </div>
        {d.abierta ? (
          <div className="aviso chico">Hay una muestra programada ({codigoMuestra(d.abierta.numero)}, {fecha(d.abierta.fecha_programada)}): esta toma la completa.</div>
        ) : (
          <div className="aviso chico">No había muestra programada: se crea una nueva.</div>
        )}
      </section>

      {hecho ? (
        <section className="tarjeta pila">
          <div className="aviso ok">{hecho}</div>
          <div className="fila">
            <Link className="boton primario" to={`/proyecto/${d.proyecto.id}?p=equipos`}>Ir a los equipos del cliente</Link>
            <Link className="boton" to="/muestras">Ver muestras</Link>
          </div>
        </section>
      ) : (
        <section className="tarjeta pila">
          <div className="grid grid-2">
            <Campo etiqueta="Horas del equipo"><input inputMode="decimal" type="number" value={f.horas_equipo} onChange={(e) => setF({ ...f, horas_equipo: e.target.value })} /></Campo>
            <Campo etiqueta="Km del equipo"><input inputMode="decimal" type="number" value={f.km_equipo} onChange={(e) => setF({ ...f, km_equipo: e.target.value })} /></Campo>
            <Campo etiqueta="Horas del aceite"><input inputMode="decimal" type="number" value={f.horas_aceite} onChange={(e) => setF({ ...f, horas_aceite: e.target.value })} /></Campo>
            <Campo etiqueta="Km del aceite"><input inputMode="decimal" type="number" value={f.km_aceite} onChange={(e) => setF({ ...f, km_aceite: e.target.value })} /></Campo>
            <Campo etiqueta="Se rellenó (litros)"><input inputMode="decimal" type="number" value={f.relleno_litros} onChange={(e) => setF({ ...f, relleno_litros: e.target.value })} /></Campo>
            <Campo etiqueta="Kit / etiqueta del laboratorio">
              <select value={f.kit_id || d.abierta?.kit_id || ''} onChange={(e) => setF({ ...f, kit_id: e.target.value })}>
                <option value="">—</option>
                {d.kits.map((k) => (
                  <option key={k.id} value={k.id}>{k.codigo}{k.estado === 'entregado' ? ' (entregado)' : ''}</option>
                ))}
              </select>
            </Campo>
          </div>
          <Campo etiqueta="Lubricante (si cambió)"><input placeholder={d.punto.lubricante_actual ?? ''} value={f.lubricante} onChange={(e) => setF({ ...f, lubricante: e.target.value })} /></Campo>
          <Campo etiqueta="Observaciones"><textarea value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} placeholder="Aceite oscuro, fuga en el retén, se tomó con el motor caliente…" /></Campo>
          <Campo etiqueta="Fotos">
            <input type="file" accept="image/*" capture="environment" multiple onChange={(e) => setFotos([...(e.target.files ?? [])])} />
          </Campo>
          <div className="fila">
            <button onClick={tomarGps}>📍 Ubicación</button>
            {gps && <span className="mono chico">{gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}</span>}
          </div>
          <ErrorMsg error={error} />
          <button className="primario" disabled={guardando} onClick={() => void registrar()} style={{ justifyContent: 'center', padding: 12 }}>
            {guardando ? 'Guardando…' : 'Registrar toma de muestra'}
          </button>
        </section>
      )}

      {d.ultimas.length > 0 && (
        <section className="tarjeta pila chico">
          <h2>Muestras anteriores de este punto</h2>
          {d.ultimas.map((m) => (
            <Link key={m.id} to={'/muestra/' + m.id} className="fila-entre" style={{ color: 'inherit', textDecoration: 'none' }}>
              <span className="mono">{codigoMuestra(m.numero)}</span>
              <span>{NOMBRE_ESTADO_MUESTRA[m.estado]}</span>
              <span className="num">{fecha(m.fecha_toma ?? m.fecha_programada)}</span>
              <PillSemaforo s={m.semaforo_final ?? m.semaforo_lab} />
            </Link>
          ))}
        </section>
      )}
    </div>
  )
}
