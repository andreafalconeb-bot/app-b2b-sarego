import { useState } from 'react'
import { supabase, ok } from '../../lib/supabase'
import { leerConCache } from '../../lib/offline'
import { nombreDe, useSesion } from '../../lib/sesion'
import type { Investigacion, ResultadoIA } from '../../lib/tipos'
import { CRITERIOS, LINEAS, SEGMENTOS, etiqueta } from '../../lib/catalogos'
import { fechaHora } from '../../lib/formato'
import { COSTO_APROX, PRIORIDAD_IA, PideClaude, SENALES, fueGratis, gastoDelMes, investigar, sinHallazgo, usd } from '../../lib/ia'
import { Cargando, ErrorMsg, Pill, Vacio, mensajeError, useCarga } from '../ui'
import type { PropsPestana } from '../../pages/Proyecto'

const TONO_PRIORIDAD = { alta: 'ok', media: 'acento', baja: 'alerta', descartar: 'critico' } as const
const CAMPO_CRITERIO = { consumo: 'crit_consumo', divisas: 'crit_divisas', dolor: 'crit_dolor', zona: 'crit_zona', decisor: 'crit_decisor' } as const

export default function InvestigacionIA({ proyecto, puedeEditar, recargarProyecto }: PropsPestana) {
  const { usuarios } = useSesion()
  const [trabajando, setTrabajando] = useState<'preliminar' | 'completa' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  // Pregunta antes de investigar con Claude, que cuesta
  const [pregunta, setPregunta] = useState<{ tipo: 'preliminar' | 'completa'; motivo: string } | null>(null)

  const { datos, error: errCarga, cargando, recargar } = useCarga(
    () =>
      leerConCache('ia:' + proyecto.id, async () => {
        const [inv, gasto] = await Promise.all([
          supabase.from('b2b_investigaciones').select('*').eq('proyecto_id', proyecto.id).order('created_at', { ascending: false }).limit(20),
          gastoDelMes(),
        ])
        return { investigaciones: ok(inv) as Investigacion[], ...gasto }
      }),
    [proyecto.id],
  )
  const lista = datos?.datos.investigaciones ?? []
  const ultima = lista.find((i) => i.estado === 'ok' && i.resultado)
  const r = ultima?.resultado ?? null
  const gasto = datos?.datos.gasto ?? 0
  const tope = datos?.datos.tope ?? 10
  // Al tope solo se frena Claude; la vía gratis sigue (b2b-investigar)
  const sinPresupuesto = gasto >= tope

  const ejecutar = async (tipo: 'preliminar' | 'completa', conClaude = false) => {
    setTrabajando(tipo)
    setError(null)
    setMsg(null)
    setPregunta(null)
    try {
      const inv = await investigar(proyecto.id, tipo, conClaude)
      setMsg(fueGratis(inv.modelo) ? 'Listo. Se hizo gratis (Tavily + Gemini).' : `Listo. La hizo Claude: costó ${usd(inv.costo_usd)}.`)
      if (sinHallazgo(inv)) {
        setPregunta({ tipo, motivo: 'La búsqueda gratis no encontró la empresa con certeza.' })
      }
      await recargar()
      await recargarProyecto()
    } catch (e) {
      if (e instanceof PideClaude) setPregunta({ tipo, motivo: 'La búsqueda gratis no pudo hacerse en este momento.' })
      else setError(mensajeError(e))
      await recargar()
    } finally {
      setTrabajando(null)
    }
  }

  // Copia a la ficha solo lo que la ficha no tiene, y los criterios en "sí"
  const aplicar = async (res: ResultadoIA) => {
    setError(null)
    const cambios: Record<string, unknown> = {}
    if (!proyecto.segmento && res.segmento) cambios.segmento = res.segmento
    if (!proyecto.web && res.web) cambios.web = res.web
    if (!proyecto.ciudad && res.ciudad) cambios.ciudad = res.ciudad
    if (!proyecto.telefono && res.telefonos[0]) cambios.telefono = res.telefonos[0]
    if (!proyecto.email && res.correos[0]) cambios.email = res.correos[0]
    if (!proyecto.marca_actual && res.marcas_que_usa.length) cambios.marca_actual = res.marcas_que_usa.join(', ')
    const nuevasLineas = res.lineas_interes.filter((l) => !proyecto.lineas.includes(l))
    if (nuevasLineas.length) cambios.lineas = [...proyecto.lineas, ...nuevasLineas]
    for (const [k, campo] of Object.entries(CAMPO_CRITERIO)) {
      if (res.criterios[k as keyof typeof CAMPO_CRITERIO] === 'si' && !proyecto[campo]) cambios[campo] = true
    }
    if (!Object.keys(cambios).length) return setMsg('La ficha ya tiene todo lo que sugiere la IA.')
    try {
      ok(await supabase.from('b2b_proyectos').update(cambios).eq('id', proyecto.id))
      setMsg(`Se completaron ${Object.keys(cambios).length} dato(s) de la ficha. Revisa la pestaña Resumen.`)
      await recargarProyecto()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  const agregarContacto = async (c: ResultadoIA['contactos'][number]) => {
    try {
      ok(
        await supabase.from('b2b_contactos').insert({
          proyecto_id: proyecto.id,
          nombre: c.nombre,
          cargo: c.cargo,
          rol_decision: /flota|mantenim|taller|operacion|planta|ingenier/i.test(c.cargo ?? '') ? 'tecnico' : /compra/i.test(c.cargo ?? '') ? 'compras' : 'otro',
          notas: c.fuente_url ? 'Encontrado por la IA: ' + c.fuente_url : 'Encontrado por la IA',
        }),
      )
      setMsg(`${c.nombre} quedó en Decisores.`)
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  const copiarMensaje = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      /* queda visible para copiar a mano */
    }
  }

  return (
    <div className="pila">
      <section className="tarjeta pila">
        <div className="fila-entre">
          <div className="min0">
            <h2>Investigación con IA</h2>
            <p className="sec chico" style={{ margin: '4px 0 0' }}>
              Busca lo público en la web (su página, publicaciones de redes que aparecen en buscadores, empleos, noticias) y lo clasifica con el método del curso 06. Todo es una sugerencia: tú decides qué pasa a la ficha.
            </p>
          </div>
          <span className={'pill ' + (sinPresupuesto ? 'critico' : '')} title="Gasto de la IA en el mes, de todo el equipo">
            Mes: {usd(gasto)} de {usd(tope)}
          </span>
        </div>
        {puedeEditar && (
          <div className="fila">
            <button className="primario" disabled={!!trabajando} onClick={() => void ejecutar('preliminar')}>
              {trabajando === 'preliminar' ? 'Investigando…' : 'Preliminar (gratis)'}
            </button>
            <button disabled={!!trabajando} onClick={() => void ejecutar('completa')}>
              {trabajando === 'completa' ? 'Investigando… (hasta 1 min)' : 'Completa (gratis)'}
            </button>
            <span className="sec chico">
              La preliminar confirma qué es y si vale la pena. La completa busca además señales de compra, contactos y marcas.
              Se hacen gratis con Tavily y Gemini. Si no encuentran nada, te pregunta antes de buscar con Claude, que sí cuesta (~{usd(COSTO_APROX.preliminar)} la preliminar, ~{usd(COSTO_APROX.completa)} la completa).
            </span>
          </div>
        )}
        {sinPresupuesto && <div className="aviso alerta chico">Se alcanzó el tope de gasto del mes: se sigue investigando gratis, pero ya no con Claude. El gerente puede subir el tope en Equipo → Ajustes.</div>}
        <ErrorMsg error={errCarga ?? error} />
        {msg && <div className="aviso ok">{msg}</div>}
        {pregunta && puedeEditar && (
          <div className="aviso alerta pila">
            <div>
              <b>{pregunta.motivo}</b> ¿Quieres buscar con Claude? Busca más a fondo, pero cuesta ~
              {usd(COSTO_APROX[pregunta.tipo])}.
            </div>
            <div className="fila">
              <button className="primario" disabled={!!trabajando || sinPresupuesto} onClick={() => void ejecutar(pregunta.tipo, true)}>
                Sí, buscar con Claude (~{usd(COSTO_APROX[pregunta.tipo])})
              </button>
              <button onClick={() => setPregunta(null)}>No, dejarlo así</button>
              {sinPresupuesto && <span className="sec chico">No se puede: se alcanzó el tope de gasto del mes.</span>}
            </div>
          </div>
        )}
      </section>

      {cargando ? (
        <Cargando />
      ) : !r ? (
        <div className="tarjeta"><Vacio>Todavía no se investigó. Empieza por la preliminar.</Vacio></div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(260px, 2fr)', alignItems: 'start' }}>
          <div className="pila min0">
            <section className="tarjeta pila">
              <div className="fila-entre">
                <div className="fila">
                  <Pill tono={TONO_PRIORIDAD[r.prioridad]}>{PRIORIDAD_IA[r.prioridad]}</Pill>
                  {r.existe !== 'si' && <Pill tono="alerta">{r.existe === 'no' ? 'No parece existir' : 'Existencia dudosa'}</Pill>}
                  <span className="sec chico">{ultima!.tipo === 'completa' ? 'Completa' : 'Preliminar'} · {fechaHora(ultima!.created_at)}</span>
                </div>
                {puedeEditar && <button className="chico" onClick={() => void aplicar(r)}>Completar la ficha con esto</button>}
              </div>
              <p style={{ margin: 0 }}>{r.resumen}</p>
              <p className="chico" style={{ margin: 0 }}><b>Por qué esa prioridad:</b> {r.razon_prioridad}</p>
              <div className="grid grid-2 chico">
                <div><span className="sec">Segmento:</span> {etiqueta(SEGMENTOS, r.segmento)}</div>
                <div><span className="sec">Actividad:</span> {r.actividad}</div>
                <div>
                  <span className="sec">Flota o planta:</span> {r.tiene_flota_o_planta === 'si' ? (r.flota_estimada ?? 'Sí') : r.tiene_flota_o_planta === 'no' ? 'No' : 'Sin datos'}
                </div>
                <div><span className="sec">Líneas:</span> {r.lineas_interes.map((l) => LINEAS[l] ?? l).join(', ') || '—'}</div>
                {r.marcas_que_usa.length > 0 && <div><span className="sec">Marcas que usa:</span> {r.marcas_que_usa.join(', ')}</div>}
                {r.ciudad && <div><span className="sec">Ciudad:</span> {r.ciudad}</div>}
              </div>
              {r.evidencia_flota && <p className="chico sec" style={{ margin: 0 }}>Evidencia: {r.evidencia_flota}</p>}
            </section>

            {r.senales.length > 0 && (
              <section className="tarjeta pila">
                <h3>Señales de compra</h3>
                {r.senales.map((s, i) => (
                  <div key={i} className="chico">
                    <b>{SENALES[s.tipo] ?? s.tipo}:</b> {s.detalle}{' '}
                    {s.fuente_url && <a href={s.fuente_url} target="_blank" rel="noreferrer">fuente</a>}
                  </div>
                ))}
              </section>
            )}

            <section className="tarjeta pila">
              <h3>Cliente ideal según la IA</h3>
              {CRITERIOS.map((c) => {
                const k = Object.entries(CAMPO_CRITERIO).find(([, v]) => v === c.campo)![0] as keyof ResultadoIA['criterios']
                const v = r.criterios[k]
                return (
                  <div key={c.campo} className="fila chico" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                    <Pill tono={v === 'si' ? 'ok' : v === 'no' ? 'critico' : undefined}>{v === 'si' ? 'Sí' : v === 'no' ? 'No' : '?'}</Pill>
                    <span>{c.texto}</span>
                  </div>
                )
              })}
            </section>

            <section className="tarjeta pila">
              <div className="fila-entre">
                <h3>Primer mensaje sugerido</h3>
                <button className="chico" onClick={() => void copiarMensaje(r.primer_mensaje)}>{copiado ? 'Copiado' : 'Copiar'}</button>
              </div>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.primer_mensaje}</p>
            </section>
          </div>

          <aside className="pila">
            <section className="tarjeta pila chico">
              <h3>Presencia en la web</h3>
              {r.web && <a href={r.web.startsWith('http') ? r.web : 'https://' + r.web} target="_blank" rel="noreferrer">{r.web}</a>}
              {r.redes.map((x) => (
                <a key={x.url} href={x.url} target="_blank" rel="noreferrer">{x.red[0].toUpperCase() + x.red.slice(1)}: {x.url.replace(/^https?:\/\/(www\.)?/, '')}</a>
              ))}
              {r.telefonos.map((t) => <span key={t}>📞 {t}</span>)}
              {r.correos.map((c) => <span key={c}>✉️ {c}</span>)}
              {!r.web && !r.redes.length && !r.telefonos.length && !r.correos.length && <span className="sec">No encontró web ni redes.</span>}
            </section>

            {r.contactos.length > 0 && (
              <section className="tarjeta pila chico">
                <h3>Contactos públicos</h3>
                {r.contactos.map((c, i) => (
                  <div key={i} className="fila-entre">
                    <span>
                      <b>{c.nombre}</b> {c.cargo && <span className="sec">· {c.cargo}</span>}{' '}
                      {c.fuente_url && <a href={c.fuente_url} target="_blank" rel="noreferrer">fuente</a>}
                    </span>
                    {puedeEditar && <button className="chico" onClick={() => void agregarContacto(c)}>A decisores</button>}
                  </div>
                ))}
              </section>
            )}

            <section className="tarjeta pila chico">
              <h3>Fuentes consultadas ({ultima!.fuentes.length})</h3>
              {ultima!.fuentes.slice(0, 12).map((f) => (
                <a key={f.url} href={f.url} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-word' }}>{f.titulo || f.url}</a>
              ))}
            </section>
          </aside>
        </div>
      )}

      {lista.length > 0 && (
        <section className="tarjeta tabla-wrap">
          <h3 style={{ marginBottom: 6 }}>Historial y costos</h3>
          <table>
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Pedida por</th><th>Hecha con</th><th>Búsquedas</th><th>Costo</th><th>Estado</th></tr></thead>
            <tbody>
              {lista.map((i) => (
                <tr key={i.id}>
                  <td className="chico">{fechaHora(i.created_at)}</td>
                  <td className="chico">{i.tipo === 'completa' ? 'Completa' : 'Preliminar'}</td>
                  <td className="chico">{nombreDe(usuarios, i.solicitado_por)}</td>
                  <td className="chico">{fueGratis(i.modelo) ? <span className="pill ok">Gratis</span> : 'Claude'}</td>
                  <td className="num">{i.busquedas}</td>
                  <td className="num">{usd(Number(i.costo_usd))}</td>
                  <td className="chico">{i.estado === 'ok' ? 'Bien' : <span title={i.error ?? ''}>Error: {i.error}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
