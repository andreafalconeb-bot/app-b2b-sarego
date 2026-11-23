import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'
import { usePermisos, useSesion } from '../lib/sesion'
import { COLORES, capaBase, distanciaMetros, enlaceGoogleMaps, iconoErp, iconoPin, iconoPunto, textoDistancia } from '../lib/mapa'
import type { Semilla } from '../lib/tipos'
import { SEGMENTOS, SUCURSALES } from '../lib/catalogos'
import { Campo, ErrorMsg, Pill, Selector, Vacio, mensajeError } from '../components/ui'

interface ResultadoPlaces {
  googlePlaceId: string
  nombre: string
  direccion: string | null
  lat: number | null
  lng: number | null
  telefono: string | null
  rating: number | null
  mapsUri: string | null
  clienteErp: {
    codigoSarego: string
    nombreErp: string
    clasificacion: string
    similitud: number
    direccionErp: string | null
    latErp: number | null
    lngErp: number | null
  } | null
  // Palabras de búsqueda con las que apareció (puede ser más de una)
  terminos?: string[]
}
interface Duplicado {
  codigo: string
  razon_social: string
  responsable: string | null
}
interface Punto {
  lat: number
  lng: number
}


// Atajos a zonas industriales (curso 06, módulo 2: Caracas, Valencia,
// Maracay y las rutas que ya se despachan). Mueven el mapa y marcan el punto.
const ZONAS: Record<string, Punto & { zoom: number }> = {
  'Caracas · La Yaguara / Catia': { lat: 10.4806, lng: -66.9555, zoom: 13 },
  'Caracas · Los Cortijos / La Urbina': { lat: 10.4925, lng: -66.8167, zoom: 13 },
  'Guarenas · Guatire': { lat: 10.4716, lng: -66.5383, zoom: 13 },
  'Valles del Tuy': { lat: 10.2283, lng: -66.8572, zoom: 12 },
  'Valencia · Zona Industrial Sur': { lat: 10.1306, lng: -68.0039, zoom: 13 },
  'Valencia · Castillito / Flor Amarillo': { lat: 10.1418, lng: -67.9504, zoom: 13 },
  'Guacara · Zona industrial': { lat: 10.2265, lng: -67.8833, zoom: 13 },
  'Maracay · Zona industrial San Vicente': { lat: 10.2203, lng: -67.5714, zoom: 13 },
  'La Victoria · Aragua': { lat: 10.2275, lng: -67.3333, zoom: 13 },
  'Puerto Cabello': { lat: 10.4731, lng: -68.0125, zoom: 13 },
  'Ciudad Bolívar · Zona industrial La Sabanita': { lat: 8.1036, lng: -63.5306, zoom: 13 },
  'Ciudad Bolívar · Centro y Marhuanta': { lat: 8.1222, lng: -63.5497, zoom: 13 },
  'Puerto Ordaz · Zona industrial Matanzas': { lat: 8.2875, lng: -62.8139, zoom: 13 },
  'Puerto Ordaz · Unare / Alta Vista': { lat: 8.2961, lng: -62.7411, zoom: 13 },
  'San Félix · Zona industrial': { lat: 8.3575, lng: -62.6453, zoom: 13 },
  'Upata · El Callao (minería)': { lat: 8.0128, lng: -62.4031, zoom: 11 },
}

const TERMINOS = [
  'transporte de carga',
  'empresa de transporte',
  'distribuidora de alimentos',
  'distribuidora de bebidas',
  'constructora',
  'alquiler de maquinaria',
  'cantera',
  'cementera',
  'planta industrial',
  'fábrica',
  'montacargas',
  'agroindustria',
  'centrales azucareros',
  'transporte de pasajeros',
  'logística',
]

// Google limita la búsqueda a 50 km de radio
const RADIO_MAX_KM = 50
const RADIOS_RAPIDOS = [1, 2, 5, 10, 20]

/** Sucursal que atiende un punto: el estado Bolívar (al sur del Orinoco y
 * al este de -66) es Ciudad Bolívar; de La Victoria hacia el oeste (Aragua
 * y Carabobo) es Valencia; el resto, Caracas. Se puede cambiar a mano. */
function sucursalPorPunto(p: Punto): string {
  if (p.lat < 8.7 && p.lng > -66) return '03'
  return p.lng < -67.25 ? '02' : '01'
}

const CLASIFICACION_ERP: Record<string, string> = {
  activo: 'activo',
  en_riesgo: 'en riesgo',
  inactivo: 'inactivo',
  sin_compras: 'sin compras',
}

function estadoResultado(r: ResultadoPlaces, elegidos: Set<string>, dups: Record<string, Duplicado[]>) {
  if (elegidos.has(r.googlePlaceId)) return 'elegida' as const
  if (r.clienteErp) return 'cliente' as const
  if ((dups[r.googlePlaceId] ?? []).length) return 'duplicada' as const
  return 'nueva' as const
}

export default function Semillas() {
  const p = usePermisos()
  const { yo } = useSesion()
  const [punto, setPunto] = useState<Punto | null>(null)
  const [radioKm, setRadioKm] = useState(5)
  const [sucursal, setSucursal] = useState('01')
  const [terminos, setTerminos] = useState<string[]>(['transporte de carga', 'distribuidora de alimentos'])
  const [libre, setLibre] = useState('')
  const [segmento, setSegmento] = useState('transporte_flotas')
  const [resultados, setResultados] = useState<ResultadoPlaces[]>([])
  const [dups, setDups] = useState<Record<string, Duplicado[]>>({})
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const mapaRef = useRef<L.Map | null>(null)
  const marcadorRef = useRef<L.Marker | null>(null)
  const circuloRef = useRef<L.Circle | null>(null)
  const capaResultadosRef = useRef<L.LayerGroup | null>(null)

  const marcar = useCallback((pt: Punto) => {
    setPunto(pt)
    setSucursal(sucursalPorPunto(pt))
  }, [])

  // Callback ref: el mapa se crea cuando el div existe y se destruye al salir
  const iniciarMapa = useCallback(
    (nodo: HTMLDivElement | null) => {
      if (!nodo) {
        mapaRef.current?.remove()
        mapaRef.current = null
        return
      }
      if (mapaRef.current) return
      const mapa = L.map(nodo).setView([9.3, -65.6], 7)
      capaBase().addTo(mapa)
      mapa.on('click', (e: L.LeafletMouseEvent) => marcar({ lat: e.latlng.lat, lng: e.latlng.lng }))
      capaResultadosRef.current = L.layerGroup().addTo(mapa)
      mapaRef.current = mapa
    },
    [marcar],
  )

  // Punto (arrastrable) y círculo del radio
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa) return
    marcadorRef.current?.remove()
    circuloRef.current?.remove()
    if (!punto) return
    const m = L.marker([punto.lat, punto.lng], { icon: iconoPin(COLORES.elegida), draggable: true }).addTo(mapa)
    m.on('dragend', () => {
      const ll = m.getLatLng()
      marcar({ lat: ll.lat, lng: ll.lng })
    })
    marcadorRef.current = m
    circuloRef.current = L.circle([punto.lat, punto.lng], {
      radius: radioKm * 1000,
      color: '#123a4a',
      weight: 2,
      fillColor: '#e8a23a',
      fillOpacity: 0.12,
      interactive: false,
    }).addTo(mapa)
  }, [punto, radioKm, marcar])

  // Resultados en el mapa, coloreados según si son nuevos, clientes o
  // duplicados. Si ya es cliente en Profit y el ERP tiene coordenadas, se
  // dibuja también la ubicación registrada (cuadrado verde) unida con una
  // línea punteada, para comparar.
  useEffect(() => {
    const capa = capaResultadosRef.current
    if (!capa) return
    capa.clearLayers()
    for (const r of resultados) {
      if (r.lat == null || r.lng == null) continue
      const estado = estadoResultado(r, elegidos, dups)
      const terminos = r.terminos?.length ? `<br><small>Encontrada con: ${escapar(r.terminos.join(', '))}</small>` : ''
      L.marker([r.lat, r.lng], { icon: iconoPunto(COLORES[estado]) })
        .bindTooltip(`<b>${escapar(r.nombre)}</b>${terminos}`)
        .on('click', () => alternar(r.googlePlaceId))
        .addTo(capa)
      const e = r.clienteErp
      if (e && e.latErp != null && e.lngErp != null) {
        L.polyline([[r.lat, r.lng], [e.latErp, e.lngErp]], { color: COLORES.cliente, weight: 2, dashArray: '4 4' }).addTo(capa)
        L.marker([e.latErp, e.lngErp], { icon: iconoErp() })
          .bindTooltip(`<b>En Profit: ${escapar(e.nombreErp)}</b><br><small>${escapar(e.codigoSarego)} · ${escapar(e.direccionErp ?? '')}</small>`)
          .addTo(capa)
      }
    }
  }, [resultados, dups, elegidos])

  const verEnMapa = (r: ResultadoPlaces) => {
    const mapa = mapaRef.current
    if (!mapa || r.lat == null || r.lng == null) return
    const e = r.clienteErp
    if (e && e.latErp != null && e.lngErp != null) {
      mapa.fitBounds(L.latLngBounds([[r.lat, r.lng], [e.latErp, e.lngErp]]), { padding: [60, 60], maxZoom: 17 })
    } else {
      mapa.setView([r.lat, r.lng], Math.max(mapa.getZoom(), 16))
    }
    document.querySelector('.leaflet-container')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const irAZona = (nombre: string) => {
    const z = ZONAS[nombre]
    if (!z) return
    mapaRef.current?.setView([z.lat, z.lng], z.zoom)
    marcar({ lat: z.lat, lng: z.lng })
  }

  const usarMiUbicacion = () =>
    navigator.geolocation?.getCurrentPosition(
      (x) => {
        const pt = { lat: x.coords.latitude, lng: x.coords.longitude }
        mapaRef.current?.setView([pt.lat, pt.lng], 13)
        marcar(pt)
      },
      () => setError('No se pudo leer tu ubicación.'),
      { enableHighAccuracy: true, timeout: 15000 },
    )

  const encuadrarCirculo = () => {
    if (circuloRef.current && mapaRef.current) mapaRef.current.fitBounds(circuloRef.current.getBounds(), { padding: [20, 20] })
  }

  const buscar = async () => {
    if (!punto) return setError('Toca el mapa para marcar dónde buscar.')
    setBuscando(true)
    setError(null)
    setMsg(null)
    setElegidos(new Set())
    try {
      const lista = [...terminos, ...libre.split(',').map((t) => t.trim()).filter(Boolean)]
      const { data, error } = await supabase.functions.invoke('buscar-prospectos-places', {
        body: { lat: punto.lat, lng: punto.lng, radioMetros: Math.round(radioKm * 1000), terminos: lista },
      })
      if (error) {
        const ctx = (error as { context?: Response }).context
        const cuerpo = ctx ? await ctx.json().catch(() => null) : null
        throw new Error(cuerpo?.error ?? error.message)
      }
      const r = ((data as { prospectos?: ResultadoPlaces[] })?.prospectos ?? []) as ResultadoPlaces[]
      setResultados(r)
      const pares = await Promise.all(
        r.map(async (x) => [x.googlePlaceId, ((await supabase.rpc('b2b_buscar_duplicados', { p_nombre: x.nombre })).data as Duplicado[]) ?? []] as const),
      )
      setDups(Object.fromEntries(pares))
      encuadrarCirculo()
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setBuscando(false)
    }
  }

  const importar = async () => {
    setError(null)
    const elegidas = resultados.filter((r) => elegidos.has(r.googlePlaceId))
    const sinCoordenadas = elegidas.filter((r) => r.lat == null || r.lng == null)
    if (sinCoordenadas.length) return setError(`No se pueden importar sin coordenadas: ${sinCoordenadas.map((r) => r.nombre).join(', ')}.`)
    const ahora = new Date().toISOString()
    const filas = elegidas
      .map((r) => ({
        razon_social: r.nombre,
        nombre_comercial: r.nombre,
        segmento,
        lineas: ['lubricantes', 'grasas'],
        sucursal,
        direccion: r.direccion,
        lat: r.lat,
        lng: r.lng,
        telefono: r.telefono,
        fuente: 'google_places',
        fuente_detalle: r.mapsUri,
        google_place_id: r.googlePlaceId,
        etapa: 'semilla',
        semilla: {
          terminos: r.terminos ?? [],
          centro: punto,
          radio_m: Math.round(radioKm * 1000),
          sucursal,
          buscado_por: yo?.id ?? null,
          buscado_at: ahora,
          google: {
            place_id: r.googlePlaceId,
            nombre: r.nombre,
            direccion: r.direccion,
            telefono: r.telefono,
            rating: r.rating,
            maps_uri: r.mapsUri,
            lat: r.lat,
            lng: r.lng,
          },
          cliente_erp: r.clienteErp
            ? {
                codigo: r.clienteErp.codigoSarego,
                nombre: r.clienteErp.nombreErp,
                clasificacion: r.clienteErp.clasificacion,
                similitud: r.clienteErp.similitud,
                direccion: r.clienteErp.direccionErp,
                lat: r.clienteErp.latErp,
                lng: r.clienteErp.lngErp,
              }
            : null,
        } satisfies Semilla,
      }))
    if (!filas.length) return
    const { error } = await supabase.from('b2b_proyectos').insert(filas)
    if (error) return setError(error.message)
    setMsg(`${filas.length} semilla(s) cargadas en la etapa "Semilla".`)
    setResultados((rs) => rs.filter((r) => !elegidos.has(r.googlePlaceId)))
    setElegidos(new Set())
  }

  function alternar(id: string) {
    setElegidos((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  if (!p.gestion) return <div className="aviso">El generador de semillas es de la oficina de prospectación y la gerencia.</div>

  const nuevas = resultados.filter((r) => !r.clienteErp && !(dups[r.googlePlaceId] ?? []).length)

  return (
    <>
      <div className="titulo-pagina">
        <div>
          <h1>Generador de semillas</h1>
          <div className="sec chico">Toca el mapa donde quieres buscar, ajusta el radio y elige qué buscar. Cada resultado se cruza con Profit y con lo que ya está en B2B.</div>
        </div>
      </div>
      <div className="curso" style={{ marginBottom: 12 }}>
        <span>📘</span>
        <span>
          <b>Curso 06, módulo 3:</b> la meta del primer mes es una lista de 100 cuentas con nombre, segmento, ciudad, tamaño estimado de flota y al menos un contacto. Google Maps es una fuente más: la red del grupo (Profit) y la calle rinden más.{' '}
          <a href="https://academia.distribuidorasarego.com/curso/prospeccion-corporativa#módulo-3-dónde-encontrar-prospectos-y-a-quién-hablarle" target="_blank" rel="noreferrer">Ver la lección</a>
        </span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(280px, 2fr)', alignItems: 'start', marginBottom: 12 }}>
        <section className="tarjeta pila min0" style={{ padding: 10 }}>
          <div className="fila">
            <select aria-label="Ir a una zona" value="" onChange={(e) => irAZona(e.target.value)} style={{ flex: 1, minWidth: 200 }}>
              <option value="">Ir a una zona industrial…</option>
              {Object.keys(ZONAS).map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
            <button className="chico" onClick={usarMiUbicacion}>📍 Mi ubicación</button>
            {punto && <button className="chico" onClick={encuadrarCirculo}>Ver el círculo completo</button>}
          </div>
          <div
            ref={iniciarMapa}
            style={{ height: 'min(62vh, 520px)', minHeight: 320, borderRadius: 6, border: '1px solid var(--borde)', cursor: 'crosshair' }}
            aria-label="Mapa: toca para marcar el centro de la búsqueda"
          />
          <div className="fila chico sec">
            {punto ? (
              <span>
                Centro: <span className="mono">{punto.lat.toFixed(5)}, {punto.lng.toFixed(5)}</span> · puedes arrastrar el marcador o tocar otro punto
              </span>
            ) : (
              <span>Toca el mapa para marcar el centro de la búsqueda.</span>
            )}
            {resultados.length > 0 && (
              <span className="fila" style={{ gap: 10 }}>
                <span><span className="punto" style={{ background: '#0c5a7a' }} /> nueva</span>
                <span><span className="punto" style={{ background: '#1f7a4d' }} /> cliente Profit</span>
                <span><span className="punto" style={{ background: '#a86400' }} /> ya en B2B</span>
                <span><span className="punto" style={{ background: '#e8a23a' }} /> elegida</span>
                <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#1f7a4d' }} /> ubicación en Profit</span>
              </span>
            )}
          </div>
        </section>

        <section className="tarjeta pila">
          <Campo etiqueta={`Radio: ${radioKm < 1 ? Math.round(radioKm * 1000) + ' m' : radioKm + ' km'}`}>
            <input
              type="range"
              min={0.5}
              max={RADIO_MAX_KM}
              step={0.5}
              value={radioKm}
              onChange={(e) => setRadioKm(Number(e.target.value))}
              style={{ padding: 0 }}
            />
          </Campo>
          <div className="fila">
            {RADIOS_RAPIDOS.map((r) => (
              <button key={r} className={'chico' + (radioKm === r ? ' primario' : '')} onClick={() => setRadioKm(r)}>{r} km</button>
            ))}
            <input
              type="number"
              min={0.5}
              max={RADIO_MAX_KM}
              step={0.5}
              value={radioKm}
              onChange={(e) => setRadioKm(Math.min(RADIO_MAX_KM, Math.max(0.5, Number(e.target.value) || 0.5)))}
              aria-label="Radio en kilómetros"
              style={{ width: 80 }}
            />
            <span className="sec chico">km (máx. {RADIO_MAX_KM})</span>
          </div>
          <div className="grid grid-2">
            <Campo etiqueta="Sucursal que atiende"><Selector valor={sucursal} onCambio={setSucursal} opciones={SUCURSALES} /></Campo>
            <Campo etiqueta="Segmento al importar"><Selector valor={segmento} onCambio={setSegmento} opciones={SEGMENTOS} /></Campo>
          </div>
          <div className="pila">
            <span className="sec chico">Qué buscar</span>
            <div className="fila">
              {TERMINOS.map((t) => (
                <label key={t} className="check chico">
                  <input type="checkbox" checked={terminos.includes(t)} onChange={(e) => setTerminos(e.target.checked ? [...terminos, t] : terminos.filter((x) => x !== t))} />
                  {t}
                </label>
              ))}
            </div>
            <Campo etiqueta="Otros términos (separados por coma)"><input value={libre} onChange={(e) => setLibre(e.target.value)} placeholder="flota de camiones, granja avícola" /></Campo>
          </div>
          <button className="primario" disabled={buscando || !punto || (!terminos.length && !libre.trim())} onClick={() => void buscar()} style={{ justifyContent: 'center' }}>
            {buscando ? 'Buscando…' : punto ? 'Buscar en este círculo' : 'Marca un punto en el mapa'}
          </button>
        </section>
      </div>

      <ErrorMsg error={error} />
      {msg && <div className="aviso ok" style={{ marginBottom: 12 }}>{msg} <Link to="/prospectos">Ver en prospectos</Link></div>}
      {resultados.length > 0 && (
        <section className="tarjeta pila">
          <div className="fila-entre">
            <h2>{resultados.length} resultados · {nuevas.length} nuevas</h2>
            <div className="fila">
              <button className="chico" onClick={() => setElegidos(new Set(nuevas.map((r) => r.googlePlaceId)))}>Elegir todas las nuevas</button>
              <button className="primario" disabled={!elegidos.size} onClick={() => void importar()}>Importar {elegidos.size} como semilla</button>
            </div>
          </div>
          <div className="tabla-wrap">
            <table>
              <thead><tr><th></th><th>Empresa</th><th>Encontrada con</th><th>Ya conocida</th><th></th></tr></thead>
              <tbody>
                {resultados.map((r) => {
                  const d = dups[r.googlePlaceId] ?? []
                  const e = r.clienteErp
                  const sinCoord = r.lat == null || r.lng == null
                  const ubicacionErp = e && e.latErp != null && e.lngErp != null
                  return (
                    <tr key={r.googlePlaceId}>
                      <td>
                        <input type="checkbox" disabled={sinCoord} checked={elegidos.has(r.googlePlaceId)} onChange={() => alternar(r.googlePlaceId)} aria-label={'Elegir ' + r.nombre} />
                      </td>
                      <td className="min0">
                        <b>{r.nombre}</b>
                        <div className="sec chico">{r.direccion}</div>
                        <div className="chico">
                          {r.telefono && <span>📞 {r.telefono} · </span>}
                          {sinCoord ? (
                            <span style={{ color: 'var(--critico)' }}>Sin coordenadas: no se puede importar</span>
                          ) : (
                            <span className="mono sec">{r.lat!.toFixed(5)}, {r.lng!.toFixed(5)}</span>
                          )}
                          {r.mapsUri && <> · <a href={r.mapsUri} target="_blank" rel="noreferrer">Google Maps</a></>}
                        </div>
                      </td>
                      <td>
                        <div className="fila" style={{ gap: 4 }}>
                          {(r.terminos ?? []).length ? (r.terminos ?? []).map((t) => <Pill key={t} tono="ambar">{t}</Pill>) : <span className="sec chico">—</span>}
                        </div>
                      </td>
                      <td className="chico" style={{ minWidth: 220 }}>
                        {e && (
                          <div className="pila" style={{ gap: 2 }}>
                            <span>
                              <Pill tono="ok">Ya es cliente en Profit</Pill>
                            </span>
                            <b>{e.nombreErp}</b>
                            <span className="sec">
                              {e.codigoSarego} · {CLASIFICACION_ERP[e.clasificacion] ?? e.clasificacion} · {Math.round(e.similitud * 100)}% parecido
                            </span>
                            {e.direccionErp && <span className="sec">{e.direccionErp}</span>}
                            {ubicacionErp ? (
                              <span>
                                Ubicación en el ERP:{' '}
                                {!sinCoord && <b>a {textoDistancia(distanciaMetros({ lat: r.lat!, lng: r.lng! }, { lat: e.latErp!, lng: e.lngErp! }))}</b>}{' '}
                                <a href={enlaceGoogleMaps(e.latErp!, e.lngErp!)} target="_blank" rel="noreferrer">abrir</a>
                              </span>
                            ) : (
                              <span style={{ color: 'var(--alerta)' }}>El ERP no tiene coordenadas de este cliente</span>
                            )}
                          </div>
                        )}
                        {d.map((x) => <div key={x.codigo}><Pill tono="alerta">Ya en B2B: {x.codigo} · {x.responsable ?? 'Oficina'}</Pill></div>)}
                        {!e && !d.length && <span className="sec">Nueva</span>}
                      </td>
                      <td>{!sinCoord && <button className="chico" onClick={() => verEnMapa(r)}>Ver en el mapa</button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="sec chico" style={{ margin: 0 }}>Toca "Ver en el mapa" para ubicarla (si ya es cliente, también se ve dónde la tiene registrada Profit). Tocar un punto del mapa lo elige.</p>
        </section>
      )}
      {!buscando && resultados.length === 0 && !msg && punto && <Vacio>Ajusta el radio y toca "Buscar en este círculo".</Vacio>}
    </>
  )
}

function escapar(t: string): string {
  return t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}
