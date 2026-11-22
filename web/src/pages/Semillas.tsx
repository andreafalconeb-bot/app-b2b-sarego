import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from '../lib/supabase'
import { usePermisos } from '../lib/sesion'
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
  clienteErp: { codigoSarego: string; nombreErp: string; clasificacion: string } | null
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

// Tiles de OpenStreetMap: gratis y sin clave (los mismos de la app retail,
// ver web/src/lib/mapaTiles.ts allá: CARTO empezó a pedir API key).
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

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

/** Sucursal que atiende un punto: de La Victoria hacia el oeste (Aragua y
 * Carabobo) es Valencia; el resto, Caracas. Se puede cambiar a mano. */
function sucursalPorPunto(p: Punto): string {
  return p.lng < -67.25 ? '02' : '01'
}

function iconoPunto(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: '<span style="display:block;width:22px;height:22px;border-radius:50% 50% 50% 0;background:#e8a23a;border:2px solid #123a4a;transform:rotate(-45deg);box-shadow:0 1px 3px rgba(0,0,0,.45)"></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 22],
  })
}

function iconoResultado(estado: 'nueva' | 'cliente' | 'duplicada' | 'elegida'): L.DivIcon {
  const color = { nueva: '#0c5a7a', cliente: '#1f7a4d', duplicada: '#a86400', elegida: '#e8a23a' }[estado]
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.45)"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })
}

export default function Semillas() {
  const p = usePermisos()
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
      const mapa = L.map(nodo).setView([10.3, -67.4], 9)
      L.tileLayer(TILE_URL, {
        attribution: '© OpenStreetMap contributors',
        subdomains: ['a', 'b', 'c'],
        maxZoom: 19,
        detectRetina: true,
      }).addTo(mapa)
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
    const m = L.marker([punto.lat, punto.lng], { icon: iconoPunto(), draggable: true }).addTo(mapa)
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

  // Resultados en el mapa, coloreados según si son nuevos, clientes o duplicados
  useEffect(() => {
    const capa = capaResultadosRef.current
    if (!capa) return
    capa.clearLayers()
    for (const r of resultados) {
      if (r.lat == null || r.lng == null) continue
      const estado = elegidos.has(r.googlePlaceId)
        ? 'elegida'
        : r.clienteErp
          ? 'cliente'
          : (dups[r.googlePlaceId] ?? []).length
            ? 'duplicada'
            : 'nueva'
      L.marker([r.lat, r.lng], { icon: iconoResultado(estado) })
        .bindTooltip(r.nombre)
        .on('click', () => alternar(r.googlePlaceId))
        .addTo(capa)
    }
  }, [resultados, dups, elegidos])

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
    const filas = resultados
      .filter((r) => elegidos.has(r.googlePlaceId))
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
              <thead><tr><th></th><th>Empresa</th><th>Teléfono</th><th>Ya conocida</th></tr></thead>
              <tbody>
                {resultados.map((r) => {
                  const d = dups[r.googlePlaceId] ?? []
                  return (
                    <tr key={r.googlePlaceId} className="clic" onClick={() => {
                      if (r.lat != null && r.lng != null) mapaRef.current?.setView([r.lat, r.lng], Math.max(mapaRef.current.getZoom(), 15))
                    }}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={elegidos.has(r.googlePlaceId)} onChange={() => alternar(r.googlePlaceId)} aria-label={'Elegir ' + r.nombre} />
                      </td>
                      <td>
                        <b>{r.nombre}</b>
                        <div className="sec chico">{r.direccion}{r.mapsUri && <> · <a href={r.mapsUri} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Maps</a></>}</div>
                      </td>
                      <td className="chico">{r.telefono ?? '—'}</td>
                      <td className="chico">
                        {r.clienteErp && <Pill tono="acento">Cliente Profit {r.clienteErp.codigoSarego} · {r.clienteErp.clasificacion}</Pill>}{' '}
                        {d.map((x) => <Pill key={x.codigo} tono="alerta">{x.codigo} · {x.responsable ?? 'Oficina'}</Pill>)}
                        {!r.clienteErp && !d.length && <span className="sec">Nueva</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="sec chico" style={{ margin: 0 }}>Toca una fila para ubicarla en el mapa, o toca un punto del mapa para elegirla.</p>
        </section>
      )}
      {!buscando && resultados.length === 0 && !msg && punto && <Vacio>Ajusta el radio y toca "Buscar en este círculo".</Vacio>}
    </>
  )
}
