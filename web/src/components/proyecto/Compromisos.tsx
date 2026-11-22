import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, ok } from '../../lib/supabase'
import { ejecutar, leerConCache } from '../../lib/offline'
import { nombreDe, useSesion } from '../../lib/sesion'
import type { Compromiso } from '../../lib/tipos'
import { PARTE_COMPROMISO } from '../../lib/catalogos'
import { fecha, hoyISO, sumarDias } from '../../lib/formato'
import { AvisoCache, Campo, Cargando, ErrorMsg, Pill, Selector, Vacio, mensajeError, useCarga } from '../ui'
import type { PropsPestana } from '../../pages/Proyecto'

export default function Compromisos({ proyecto, puedeEditar, recargarProyecto }: PropsPestana) {
  const { usuarios, yo } = useSesion()
  const [verCerrados, setVerCerrados] = useState(false)
  const { datos, error, cargando, recargar } = useCarga(
    () =>
      leerConCache('compromisos:' + proyecto.id, async () =>
        ok(await supabase.from('b2b_compromisos').select('*').eq('proyecto_id', proyecto.id).order('vence', { nullsFirst: false })) as Compromiso[],
      ),
    [proyecto.id],
  )
  const todos = datos?.datos ?? []
  const lista = todos.filter((c) => verCerrados || c.estado === 'pendiente')

  const marcar = async (c: Compromiso, estado: 'cumplido' | 'cancelado' | 'pendiente') => {
    await ejecutar(
      { tipo: 'update', tabla: 'b2b_compromisos', id: c.id, cambios: { estado, cumplido_at: estado === 'cumplido' ? new Date().toISOString() : null } },
      'Compromiso: ' + c.descripcion.slice(0, 40),
    )
    await recargar()
    await recargarProyecto()
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(280px, 2fr)', alignItems: 'start' }}>
      <section className="tarjeta min0">
        <div className="fila-entre" style={{ marginBottom: 8 }}>
          <h2>Compromisos</h2>
          <label className="check chico"><input type="checkbox" checked={verCerrados} onChange={(e) => setVerCerrados(e.target.checked)} /> Ver cumplidos y cancelados</label>
        </div>
        <AvisoCache desdeCache={datos?.desdeCache ?? false} />
        <ErrorMsg error={error} />
        {cargando ? (
          <Cargando />
        ) : lista.length === 0 ? (
          <Vacio>No hay compromisos pendientes.</Vacio>
        ) : (
          <div className="tabla-wrap">
            <table>
              <thead>
                <tr><th>Qué</th><th>De quién</th><th>Responsable</th><th>Vence</th><th></th></tr>
              </thead>
              <tbody>
                {lista.map((c) => {
                  const vencido = c.estado === 'pendiente' && c.vence && c.vence < hoyISO()
                  return (
                    <tr key={c.id}>
                      <td>
                        {c.descripcion}
                        {c.automatico && <div className="sec chico">Creado por la app{c.muestra_id && <> · <Link to={'/muestra/' + c.muestra_id}>ver muestra</Link></>}</div>}
                      </td>
                      <td className="chico">{PARTE_COMPROMISO[c.parte]}</td>
                      <td className="chico">{nombreDe(usuarios, c.responsable_id)}</td>
                      <td className="num">
                        {fecha(c.vence)} {vencido && <Pill tono="alerta">Vencido</Pill>}
                        {c.estado !== 'pendiente' && <Pill tono={c.estado === 'cumplido' ? 'ok' : undefined}>{c.estado}</Pill>}
                      </td>
                      <td>
                        {puedeEditar && c.estado === 'pendiente' && (
                          <div className="fila">
                            <button className="chico" onClick={() => void marcar(c, 'cumplido')}>Cumplido</button>
                            <button className="chico" onClick={() => void marcar(c, 'cancelado')}>Cancelar</button>
                          </div>
                        )}
                        {puedeEditar && c.estado !== 'pendiente' && <button className="chico" onClick={() => void marcar(c, 'pendiente')}>Reabrir</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {puedeEditar && (
        <NuevoCompromiso
          proyectoId={proyecto.id}
          responsableDefecto={proyecto.responsable_id ?? yo?.id ?? ''}
          onHecho={async () => {
            await recargar()
            await recargarProyecto()
          }}
        />
      )}
    </div>
  )
}

function NuevoCompromiso({ proyectoId, responsableDefecto, onHecho }: { proyectoId: string; responsableDefecto: string; onHecho: () => Promise<void> }) {
  const { usuarios } = useSesion()
  const [parte, setParte] = useState('nosotros')
  const [descripcion, setDescripcion] = useState('')
  const [responsable, setResponsable] = useState(responsableDefecto)
  const [vence, setVence] = useState(sumarDias(hoyISO(), 7))
  const [whatsapp, setWhatsapp] = useState(false)
  const [calendar, setCalendar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const guardar = async () => {
    setError(null)
    setMsg(null)
    if (!descripcion.trim()) return setError('Describe el compromiso.')
    try {
      const r = await ejecutar(
        {
          tipo: 'insert',
          tabla: 'b2b_compromisos',
          fila: {
            id: crypto.randomUUID(),
            proyecto_id: proyectoId,
            parte,
            descripcion: descripcion.trim(),
            responsable_id: responsable || null,
            vence: vence || null,
            recordar_whatsapp: whatsapp,
            recordar_calendar: calendar,
          },
        },
        'Compromiso nuevo',
      )
      setDescripcion('')
      setMsg(r.encolada ? 'Sin señal: se enviará solo.' : 'Compromiso creado.')
      if (!r.encolada) await onHecho()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  return (
    <section className="tarjeta pila">
      <h2>Nuevo compromiso</h2>
      <Campo etiqueta="Tipo"><Selector valor={parte} onCambio={setParte} opciones={PARTE_COMPROMISO} /></Campo>
      <Campo etiqueta="Qué hay que hacer">
        <textarea id="cp-desc" placeholder="Enviar ficha técnica del Mobil Delvac; el cliente envía el inventario de equipos…" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </Campo>
      <div className="grid grid-2">
        <Campo etiqueta="Responsable interno">
          <Selector valor={responsable} onCambio={setResponsable} opciones={Object.fromEntries(usuarios.map((u) => [u.user_id, u.nombre]))} vacio="—" />
        </Campo>
        <Campo etiqueta="Vence"><input id="cp-vence" type="date" value={vence} onChange={(e) => setVence(e.target.value)} /></Campo>
      </div>
      <div className="fila">
        <label className="check"><input type="checkbox" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} /> Recordar por WhatsApp</label>
        <label className="check"><input type="checkbox" checked={calendar} onChange={(e) => setCalendar(e.target.checked)} /> Google Calendar</label>
      </div>
      <p className="sec chico" style={{ margin: 0 }}>Los recordatorios por WhatsApp y Calendar se activan en la fase 2; quedan marcados desde ya.</p>
      <ErrorMsg error={error} />
      {msg && <div className="aviso ok">{msg}</div>}
      <div><button className="primario" onClick={() => void guardar()}>Crear compromiso</button></div>
    </section>
  )
}
