import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, ok } from '../lib/supabase'
import { leerConCache } from '../lib/offline'
import type { Muestra } from '../lib/tipos'
import { COMPONENTES, ESTADOS_MUESTRA, NOMBRE_ESTADO_MUESTRA, etiqueta } from '../lib/catalogos'
import { codigoMuestra, diasDesde, fecha, hoyISO } from '../lib/formato'
import { AvisoCache, Cargando, Campo, ErrorMsg, Pill, PillSemaforo, Vacio, useCarga } from '../components/ui'

type Fila = Muestra & {
  b2b_proyectos: { razon_social: string; nombre_comercial: string | null; numero: number } | null
  b2b_equipos: { codigo_cliente: string | null; marca: string | null; modelo: string | null } | null
  b2b_puntos_muestreo: { componente: string } | null
}

interface PuntoVencido {
  id: string
  qr_token: string
  componente: string
  proxima_muestra: string
  proyecto_id: string
  b2b_equipos: { codigo_cliente: string | null; marca: string | null } | null
  b2b_proyectos: { razon_social: string; nombre_comercial: string | null } | null
}

// Bandejas: qué tiene que hacer quién
const BANDEJAS = [
  { k: 'tomar', t: 'Por tomar', estados: ['programada', 'kit_entregado'] },
  { k: 'enviar', t: 'Por enviar al laboratorio', estados: ['tomada'] },
  { k: 'lab', t: 'En el laboratorio', estados: ['enviada', 'recibida_lab'] },
  { k: 'interpretar', t: 'Por interpretar', estados: ['resultado_cargado'] },
  { k: 'comunicar', t: 'Por comunicar al cliente', estados: ['interpretada'] },
  { k: 'cerradas', t: 'Comunicadas y cerradas', estados: ['comunicada', 'cerrada'] },
] as const

export default function Muestras() {
  const [bandeja, setBandeja] = useState<string>('tomar')
  const [texto, setTexto] = useState('')
  const [soloCriticas, setSoloCriticas] = useState(false)

  const { datos, error, cargando } = useCarga(
    () =>
      leerConCache('muestras', async () => {
        const [m, p] = await Promise.all([
          supabase
            .from('b2b_muestras')
            .select('*, b2b_proyectos(razon_social, nombre_comercial, numero), b2b_equipos(codigo_cliente, marca, modelo), b2b_puntos_muestreo(componente)')
            .neq('estado', 'anulada')
            .order('created_at', { ascending: false })
            .limit(1000),
          supabase
            .from('b2b_puntos_muestreo')
            .select('id, qr_token, componente, proxima_muestra, proyecto_id, b2b_equipos(codigo_cliente, marca), b2b_proyectos(razon_social, nombre_comercial)')
            .eq('activo', true)
            .lte('proxima_muestra', hoyISO())
            .order('proxima_muestra'),
        ])
        return { muestras: ok(m) as unknown as Fila[], vencidos: ok(p) as unknown as PuntoVencido[] }
      }),
    [],
  )
  const muestras = datos?.datos.muestras ?? []
  const vencidos = datos?.datos.vencidos ?? []
  const b = BANDEJAS.find((x) => x.k === bandeja)!

  const conteo = (estados: readonly string[]) => muestras.filter((m) => estados.includes(m.estado)).length
  const lista = useMemo(() => {
    const t = texto.trim().toLowerCase()
    return muestras.filter((m) => {
      if (!(b.estados as readonly string[]).includes(m.estado)) return false
      if (soloCriticas && m.semaforo_final !== 'critico' && m.semaforo_lab !== 'critico') return false
      if (t) {
        const s = `${codigoMuestra(m.numero)} ${m.numero_lab ?? ''} ${m.b2b_proyectos?.razon_social ?? ''} ${m.b2b_proyectos?.nombre_comercial ?? ''} ${m.b2b_equipos?.codigo_cliente ?? ''}`.toLowerCase()
        if (!s.includes(t)) return false
      }
      return true
    })
  }, [muestras, b, texto, soloCriticas])

  const criticasSinComunicar = muestras.filter((m) => m.semaforo_final === 'critico' && !['comunicada', 'cerrada'].includes(m.estado))

  return (
    <>
      <div className="titulo-pagina">
        <div>
          <h1>Muestras de aceite usado</h1>
          <div className="sec chico">Laboratorio Smart Assistance · flujo: {ESTADOS_MUESTRA.map((e) => e.nombre).join(' → ')}</div>
        </div>
      </div>
      <AvisoCache desdeCache={datos?.desdeCache ?? false} />
      <ErrorMsg error={error} />

      {criticasSinComunicar.length > 0 && (
        <div className="aviso error" style={{ marginBottom: 12 }}>
          <b>{criticasSinComunicar.length} resultado(s) crítico(s) sin comunicar al cliente.</b> Hay que avisar en menos de 24 horas:{' '}
          {criticasSinComunicar.map((m, i) => (
            <span key={m.id}>
              {i > 0 && ', '}
              <Link to={'/muestra/' + m.id}>{codigoMuestra(m.numero)} ({m.b2b_proyectos?.nombre_comercial || m.b2b_proyectos?.razon_social})</Link>
            </span>
          ))}
        </div>
      )}

      {vencidos.length > 0 && (
        <section className="tarjeta" style={{ marginBottom: 12 }}>
          <h2 style={{ marginBottom: 6 }}>Toca muestrear ({vencidos.length})</h2>
          <div className="fila">
            {vencidos.slice(0, 30).map((p) => (
              <Link key={p.id} to={'/qr/' + p.qr_token} className="boton chico">
                {p.b2b_proyectos?.nombre_comercial || p.b2b_proyectos?.razon_social} · {p.b2b_equipos?.codigo_cliente ?? p.b2b_equipos?.marca} · {etiqueta(COMPONENTES, p.componente)}{' '}
                <span className="sec">({fecha(p.proxima_muestra)})</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="pestanas" role="tablist">
        {BANDEJAS.map((x) => (
          <button key={x.k} role="tab" aria-selected={bandeja === x.k} className={bandeja === x.k ? 'activa' : ''} onClick={() => setBandeja(x.k)}>
            {x.t} <span className="cuenta">{conteo(x.estados)}</span>
          </button>
        ))}
      </div>
      <div className="fila" style={{ marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <Campo etiqueta="Buscar"><input id="m-buscar" placeholder="Empresa, M-000123, número del laboratorio, unidad" value={texto} onChange={(e) => setTexto(e.target.value)} /></Campo>
        </div>
        <label className="check"><input type="checkbox" checked={soloCriticas} onChange={(e) => setSoloCriticas(e.target.checked)} /> Solo críticas</label>
      </div>

      {cargando ? (
        <Cargando />
      ) : lista.length === 0 ? (
        <div className="tarjeta"><Vacio>No hay muestras en esta bandeja.</Vacio></div>
      ) : (
        <div className="tarjeta tabla-wrap">
          <table>
            <thead>
              <tr><th>Muestra</th><th>Cliente</th><th>Equipo · punto</th><th>Estado</th><th>Fecha</th><th>Nº lab.</th><th>Resultado</th></tr>
            </thead>
            <tbody>
              {lista.map((m) => {
                const dias = diasDesde(m.fecha_toma ?? m.created_at)
                return (
                  <tr key={m.id}>
                    <td><Link to={'/muestra/' + m.id} className="mono">{codigoMuestra(m.numero)}</Link></td>
                    <td><Link to={'/proyecto/' + m.proyecto_id}>{m.b2b_proyectos?.nombre_comercial || m.b2b_proyectos?.razon_social}</Link></td>
                    <td className="chico">{[m.b2b_equipos?.codigo_cliente, m.b2b_equipos?.marca, m.b2b_equipos?.modelo].filter(Boolean).join(' ')} · {etiqueta(COMPONENTES, m.b2b_puntos_muestreo?.componente)}</td>
                    <td className="chico">
                      {NOMBRE_ESTADO_MUESTRA[m.estado]}
                      {['enviada', 'recibida_lab'].includes(m.estado) && dias != null && dias > 10 && <div><Pill tono="alerta">{dias} días</Pill></div>}
                    </td>
                    <td className="num">{fecha(m.fecha_toma ?? m.fecha_programada)}</td>
                    <td className="mono chico">{m.numero_lab ?? '—'}</td>
                    <td><PillSemaforo s={m.semaforo_final ?? m.semaforo_lab} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
