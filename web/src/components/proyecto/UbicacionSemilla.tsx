import { useCallback, useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase, ok } from '../../lib/supabase'
import { nombreDe, useSesion } from '../../lib/sesion'
import type { Proyecto } from '../../lib/tipos'
import { SUCURSALES, etiqueta } from '../../lib/catalogos'
import { fechaHora } from '../../lib/formato'
import { COLORES, capaBase, distanciaMetros, enlaceGoogleMaps, iconoErp, iconoPin, textoDistancia } from '../../lib/mapa'
import { ErrorMsg, Pill, mensajeError } from '../ui'

const CLASIFICACION_ERP: Record<string, string> = { activo: 'activo', en_riesgo: 'en riesgo', inactivo: 'inactivo', sin_compras: 'sin compras' }

/** Ubicación del prospecto en el mapa + lo que trajo el generador de semillas. */
export default function UbicacionSemilla({ proyecto, puedeEditar, onCambio }: { proyecto: Proyecto; puedeEditar: boolean; onCambio: () => Promise<void> }) {
  const { usuarios } = useSesion()
  const s = proyecto.semilla
  const erp = s?.cliente_erp ?? null
  const tieneCoord = proyecto.lat != null && proyecto.lng != null
  const erpCoord = erp && erp.lat != null && erp.lng != null
  const [marcando, setMarcando] = useState(false)
  const [nuevo, setNuevo] = useState<{ lat: number; lng: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mapaRef = useRef<L.Map | null>(null)
  const capaRef = useRef<L.LayerGroup | null>(null)
  const marcandoRef = useRef(false)
  marcandoRef.current = marcando

  const iniciar = useCallback((nodo: HTMLDivElement | null) => {
    if (!nodo) {
      mapaRef.current?.remove()
      mapaRef.current = null
      return
    }
    if (mapaRef.current) return
    const mapa = L.map(nodo, { scrollWheelZoom: false }).setView([10.3, -67.4], 8)
    capaBase().addTo(mapa)
    capaRef.current = L.layerGroup().addTo(mapa)
    mapa.on('click', (e: L.LeafletMouseEvent) => {
      if (marcandoRef.current) setNuevo({ lat: e.latlng.lat, lng: e.latlng.lng })
    })
    mapaRef.current = mapa
  }, [])

  useEffect(() => {
    const mapa = mapaRef.current
    const capa = capaRef.current
    if (!mapa || !capa) return
    capa.clearLayers()
    const puntos: L.LatLngExpression[] = []
    const pos = nuevo ?? (tieneCoord ? { lat: proyecto.lat!, lng: proyecto.lng! } : null)
    if (pos) {
      L.marker([pos.lat, pos.lng], { icon: iconoPin(COLORES.prospecto) }).bindTooltip(proyecto.nombre_comercial || proyecto.razon_social).addTo(capa)
      puntos.push([pos.lat, pos.lng])
    }
    if (erpCoord) {
      L.marker([erp!.lat!, erp!.lng!], { icon: iconoErp() }).bindTooltip(`En Profit: ${erp!.nombre}`).addTo(capa)
      puntos.push([erp!.lat!, erp!.lng!])
      if (pos) L.polyline([[pos.lat, pos.lng], [erp!.lat!, erp!.lng!]], { color: COLORES.cliente, weight: 2, dashArray: '4 4' }).addTo(capa)
    }
    if (s?.centro && s.radio_m && !nuevo) {
      L.circle([s.centro.lat, s.centro.lng], { radius: s.radio_m, color: '#123a4a', weight: 1, fillOpacity: 0.04, dashArray: '3 5', interactive: false }).addTo(capa)
    }
    if (puntos.length === 1) mapa.setView(puntos[0], 16)
    else if (puntos.length > 1) mapa.fitBounds(L.latLngBounds(puntos), { padding: [40, 40], maxZoom: 17 })
  }, [proyecto.lat, proyecto.lng, nuevo, erpCoord, erp, s, tieneCoord, proyecto.nombre_comercial, proyecto.razon_social])

  const guardar = async () => {
    if (!nuevo) return
    try {
      ok(await supabase.from('b2b_proyectos').update({ lat: nuevo.lat, lng: nuevo.lng }).eq('id', proyecto.id))
      setMarcando(false)
      setNuevo(null)
      await onCambio()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  const usarGps = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => setNuevo({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setError('No se pudo leer la ubicación del teléfono.'),
      { enableHighAccuracy: true, timeout: 15000 },
    )

  return (
    <section className="tarjeta pila">
      <div className="fila-entre">
        <h2>Ubicación</h2>
        <div className="fila chico">
          {tieneCoord ? (
            <>
              <span className="mono sec">{proyecto.lat!.toFixed(5)}, {proyecto.lng!.toFixed(5)}</span>
              <a href={enlaceGoogleMaps(proyecto.lat!, proyecto.lng!)} target="_blank" rel="noreferrer">Google Maps</a>
            </>
          ) : (
            <Pill tono="critico">Sin coordenadas</Pill>
          )}
          {puedeEditar && !marcando && (
            <button className="chico" onClick={() => setMarcando(true)}>{tieneCoord ? 'Corregir ubicación' : 'Marcar en el mapa'}</button>
          )}
        </div>
      </div>
      {marcando && (
        <div className="aviso chico fila">
          <span>Toca el mapa donde está la empresa{nuevo ? ' (o toca otro punto)' : ''}.</span>
          <button className="chico" onClick={usarGps}>📍 Estoy aquí</button>
          <button className="chico primario" disabled={!nuevo} onClick={() => void guardar()}>Guardar ubicación</button>
          <button className="chico" onClick={() => { setMarcando(false); setNuevo(null) }}>Cancelar</button>
        </div>
      )}
      <div ref={iniciar} style={{ height: 260, borderRadius: 6, border: '1px solid var(--borde)', cursor: marcando ? 'crosshair' : undefined }} />
      <ErrorMsg error={error} />

      {erp && (
        <div className="pila chico" style={{ borderTop: '1px solid var(--borde)', paddingTop: 8, gap: 2 }}>
          <span><Pill tono="ok">Ya es cliente en Profit</Pill></span>
          <b>{erp.nombre}</b>
          <span className="sec">
            {erp.codigo} · {CLASIFICACION_ERP[erp.clasificacion] ?? erp.clasificacion} · {Math.round(erp.similitud * 100)}% parecido al nombre de Google
          </span>
          {erp.direccion && <span className="sec">{erp.direccion}</span>}
          {erpCoord ? (
            <span>
              Ubicación registrada en el ERP{tieneCoord && <>: <b>a {textoDistancia(distanciaMetros({ lat: proyecto.lat!, lng: proyecto.lng! }, { lat: erp.lat!, lng: erp.lng! }))}</b> de la de Google</>} (cuadrado verde).{' '}
              <a href={enlaceGoogleMaps(erp.lat!, erp.lng!)} target="_blank" rel="noreferrer">Abrir</a>
            </span>
          ) : (
            <span style={{ color: 'var(--alerta)' }}>El ERP no tiene coordenadas de este cliente.</span>
          )}
          {!proyecto.cliente_erp_id && <span className="sec">No se encontró su código en la base de clientes sincronizada.</span>}
        </div>
      )}

      {s && (
        <div className="pila chico" style={{ borderTop: '1px solid var(--borde)', paddingTop: 8, gap: 4 }}>
          <b>Cómo se generó esta semilla</b>
          <div className="fila" style={{ gap: 4 }}>
            <span className="sec">Encontrada con:</span>
            {s.terminos.length ? s.terminos.map((t) => <Pill key={t} tono="ambar">{t}</Pill>) : <span>búsqueda por tipos de negocio</span>}
          </div>
          <span className="sec">
            {fechaHora(s.buscado_at)} · {nombreDe(usuarios, s.buscado_por)} · radio {s.radio_m ? textoDistancia(s.radio_m) : '—'} · sucursal {etiqueta(SUCURSALES, s.sucursal)}
          </span>
          <span>
            Google: <b>{s.google.nombre}</b>
            {s.google.rating != null && <> · ★ {s.google.rating}</>}
            {s.google.telefono && <> · {s.google.telefono}</>}
            {s.google.maps_uri && <> · <a href={s.google.maps_uri} target="_blank" rel="noreferrer">ficha en Google Maps</a></>}
          </span>
          {s.google.direccion && <span className="sec">{s.google.direccion}</span>}
        </div>
      )}
    </section>
  )
}
