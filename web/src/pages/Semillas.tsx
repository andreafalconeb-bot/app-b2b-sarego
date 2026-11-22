import { useState } from 'react'
import { Link } from 'react-router-dom'
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

// Zonas industriales y centros de distribución (curso 06, módulo 2: Caracas,
// Valencia, Maracay y las rutas que ya se despachan)
const ZONAS: Record<string, { lat: number; lng: number; sucursal: string; ciudad: string }> = {
  'Caracas · La Yaguara / Catia': { lat: 10.4806, lng: -66.9555, sucursal: '01', ciudad: 'Caracas' },
  'Caracas · Los Cortijos / La Urbina': { lat: 10.4925, lng: -66.8167, sucursal: '01', ciudad: 'Caracas' },
  'Guarenas · Guatire': { lat: 10.4716, lng: -66.5383, sucursal: '01', ciudad: 'Guarenas' },
  'Valles del Tuy': { lat: 10.2283, lng: -66.8572, sucursal: '01', ciudad: 'Charallave' },
  'Valencia · Zona Industrial Sur': { lat: 10.1306, lng: -68.0039, sucursal: '02', ciudad: 'Valencia' },
  'Valencia · Castillito / Flor Amarillo': { lat: 10.1418, lng: -67.9504, sucursal: '02', ciudad: 'Valencia' },
  'Guacara · Zona industrial': { lat: 10.2265, lng: -67.8833, sucursal: '02', ciudad: 'Guacara' },
  'Maracay · Zona industrial San Vicente': { lat: 10.2203, lng: -67.5714, sucursal: '02', ciudad: 'Maracay' },
  'La Victoria · Aragua': { lat: 10.2275, lng: -67.3333, sucursal: '02', ciudad: 'La Victoria' },
  'Puerto Cabello': { lat: 10.4731, lng: -68.0125, sucursal: '02', ciudad: 'Puerto Cabello' },
}

const TERMINOS: Record<string, string> = {
  'transporte de carga': 'transporte_flotas',
  'empresa de transporte': 'transporte_flotas',
  'distribuidora de alimentos': 'alimentos_bebidas',
  'distribuidora de bebidas': 'alimentos_bebidas',
  'constructora': 'construccion',
  'alquiler de maquinaria': 'construccion',
  'cantera': 'mineria',
  'cementera': 'construccion',
  'planta industrial': 'manufactura',
  'fábrica': 'manufactura',
  'montacargas': 'manufactura',
  'agroindustria': 'agroindustria',
  'centrales azucareros': 'agroindustria',
  'transporte de pasajeros': 'transporte_flotas',
  'logística': 'transporte_flotas',
}

export default function Semillas() {
  const p = usePermisos()
  const [zona, setZona] = useState(Object.keys(ZONAS)[0])
  const [radio, setRadio] = useState(5000)
  const [terminos, setTerminos] = useState<string[]>(['transporte de carga', 'distribuidora de alimentos'])
  const [libre, setLibre] = useState('')
  const [segmento, setSegmento] = useState('transporte_flotas')
  const [resultados, setResultados] = useState<ResultadoPlaces[]>([])
  const [dups, setDups] = useState<Record<string, Duplicado[]>>({})
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [centro, setCentro] = useState<{ lat: number; lng: number } | null>(null)

  if (!p.gestion) return <div className="aviso">El generador de semillas es de la oficina de prospectación y la gerencia.</div>

  const usarMiUbicacion = () =>
    navigator.geolocation?.getCurrentPosition(
      (x) => setCentro({ lat: x.coords.latitude, lng: x.coords.longitude }),
      () => setError('No se pudo leer tu ubicación.'),
    )

  const buscar = async () => {
    setBuscando(true)
    setError(null)
    setMsg(null)
    setElegidos(new Set())
    try {
      const z = centro ?? ZONAS[zona]
      const lista = [...terminos, ...libre.split(',').map((t) => t.trim()).filter(Boolean)]
      const { data, error } = await supabase.functions.invoke('buscar-prospectos-places', {
        body: { lat: z.lat, lng: z.lng, radioMetros: radio, terminos: lista },
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
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setBuscando(false)
    }
  }

  const importar = async () => {
    setError(null)
    const z = ZONAS[zona]
    const filas = resultados
      .filter((r) => elegidos.has(r.googlePlaceId))
      .map((r) => ({
        razon_social: r.nombre,
        nombre_comercial: r.nombre,
        segmento,
        lineas: ['lubricantes', 'grasas'],
        sucursal: z.sucursal,
        ciudad: centro ? null : z.ciudad,
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

  const alternar = (id: string) =>
    setElegidos((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <>
      <div className="titulo-pagina">
        <div>
          <h1>Generador de semillas</h1>
          <div className="sec chico">Empresas con flota o planta, desde Google Maps. Cada una se cruza con Profit y con lo que ya está en B2B.</div>
        </div>
      </div>
      <div className="curso" style={{ marginBottom: 12 }}>
        <span>📘</span>
        <span>
          <b>Curso 06, módulo 3:</b> la meta del primer mes es una lista de 100 cuentas con nombre, segmento, ciudad, tamaño estimado de flota y al menos un contacto. Google Maps es una fuente más: la red del grupo (Profit) y la calle rinden más.{' '}
          <a href="https://academia.distribuidorasarego.com/curso/prospeccion-corporativa#módulo-3-dónde-encontrar-prospectos-y-a-quién-hablarle" target="_blank" rel="noreferrer">Ver la lección</a>
        </span>
      </div>
      <section className="tarjeta pila" style={{ marginBottom: 12 }}>
        <div className="grid grid-3">
          <Campo etiqueta="Zona">
            <select value={zona} onChange={(e) => { setZona(e.target.value); setCentro(null) }}>
              {Object.keys(ZONAS).map((z) => <option key={z}>{z}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Radio">
            <select value={radio} onChange={(e) => setRadio(Number(e.target.value))}>
              {[2000, 5000, 10000, 20000, 40000].map((r) => <option key={r} value={r}>{r / 1000} km</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Segmento para las que importes">
            <Selector valor={segmento} onCambio={setSegmento} opciones={SEGMENTOS} />
          </Campo>
        </div>
        <div className="fila">
          <button className="chico" onClick={usarMiUbicacion}>📍 Buscar alrededor de mí</button>
          {centro && <span className="sec chico mono">{centro.lat.toFixed(4)}, {centro.lng.toFixed(4)} <button className="chico" onClick={() => setCentro(null)}>Quitar</button></span>}
          <span className="sec chico">Sucursal: {SUCURSALES[ZONAS[zona].sucursal]}</span>
        </div>
        <div className="pila">
          <span className="sec chico">Qué buscar</span>
          <div className="fila">
            {Object.keys(TERMINOS).map((t) => (
              <label key={t} className="check chico">
                <input type="checkbox" checked={terminos.includes(t)} onChange={(e) => setTerminos(e.target.checked ? [...terminos, t] : terminos.filter((x) => x !== t))} />
                {t}
              </label>
            ))}
          </div>
          <Campo etiqueta="Otros términos (separados por coma)"><input value={libre} onChange={(e) => setLibre(e.target.value)} placeholder="flota de camiones, granja avícola" /></Campo>
        </div>
        <div><button className="primario" disabled={buscando || (!terminos.length && !libre.trim())} onClick={() => void buscar()}>{buscando ? 'Buscando…' : 'Buscar'}</button></div>
      </section>
      <ErrorMsg error={error} />
      {msg && <div className="aviso ok" style={{ marginBottom: 12 }}>{msg} <Link to="/prospectos">Ver en prospectos</Link></div>}
      {resultados.length > 0 && (
        <section className="tarjeta pila">
          <div className="fila-entre">
            <h2>{resultados.length} resultados</h2>
            <button className="primario" disabled={!elegidos.size} onClick={() => void importar()}>Importar {elegidos.size} como semilla</button>
          </div>
          <div className="tabla-wrap">
            <table>
              <thead><tr><th></th><th>Empresa</th><th>Teléfono</th><th>Ya conocida</th></tr></thead>
              <tbody>
                {resultados.map((r) => {
                  const d = dups[r.googlePlaceId] ?? []
                  return (
                    <tr key={r.googlePlaceId}>
                      <td><input type="checkbox" checked={elegidos.has(r.googlePlaceId)} onChange={() => alternar(r.googlePlaceId)} aria-label={'Elegir ' + r.nombre} /></td>
                      <td>
                        <b>{r.nombre}</b>
                        <div className="sec chico">{r.direccion}{r.mapsUri && <> · <a href={r.mapsUri} target="_blank" rel="noreferrer">Maps</a></>}</div>
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
        </section>
      )}
      {!buscando && resultados.length === 0 && !msg && <Vacio>Elige una zona y qué buscar.</Vacio>}
    </>
  )
}
