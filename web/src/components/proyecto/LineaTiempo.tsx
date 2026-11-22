import { useState } from 'react'
import { supabase, ok } from '../../lib/supabase'
import { ejecutar, leerConCache } from '../../lib/offline'
import { nombreDe, useSesion } from '../../lib/sesion'
import type { Actividad, Comentario, Contacto } from '../../lib/tipos'
import { RESULTADOS, TIPOS_ACTIVIDAD, TIPOS_GESTION, etiqueta } from '../../lib/catalogos'
import { fecha, fechaHora, hoyISO, sumarDias } from '../../lib/formato'
import { AvisoCache, Campo, Cargando, ErrorMsg, Selector, Vacio, mensajeError, useCarga } from '../ui'
import type { PropsPestana } from '../../pages/Proyecto'

interface Correo {
  id: string
  direccion: string
  de: string | null
  para: string[]
  asunto: string | null
  cuerpo_texto: string | null
  fecha: string
}

type Item =
  | { k: 'act'; fecha: string; a: Actividad }
  | { k: 'com'; fecha: string; c: Comentario }
  | { k: 'mail'; fecha: string; m: Correo }

export default function LineaTiempo({ proyecto, puedeEditar, recargarProyecto }: PropsPestana) {
  const { usuarios, yo } = useSesion()
  const [filtro, setFiltro] = useState<'todo' | 'gestiones' | 'comentarios' | 'correos'>('todo')
  const { datos, error, cargando, recargar } = useCarga(
    () =>
      leerConCache('linea:' + proyecto.id, async () => {
        const [a, c, m, ct] = await Promise.all([
          supabase.from('b2b_actividades').select('*').eq('proyecto_id', proyecto.id).order('fecha', { ascending: false }).limit(300),
          supabase.from('b2b_comentarios').select('*').eq('proyecto_id', proyecto.id).order('created_at', { ascending: false }).limit(300),
          supabase.from('b2b_correos').select('id, direccion, de, para, asunto, cuerpo_texto, fecha').eq('proyecto_id', proyecto.id).order('fecha', { ascending: false }).limit(200),
          supabase.from('b2b_contactos').select('*').eq('proyecto_id', proyecto.id).order('nombre'),
        ])
        return {
          act: ok(a) as Actividad[],
          com: ok(c) as Comentario[],
          mail: ok(m) as Correo[],
          contactos: ok(ct) as Contacto[],
        }
      }),
    [proyecto.id],
  )

  const items: Item[] = datos
    ? [
        ...datos.datos.act.map((a) => ({ k: 'act' as const, fecha: a.fecha, a })),
        ...datos.datos.com.map((c) => ({ k: 'com' as const, fecha: c.created_at, c })),
        ...datos.datos.mail.map((m) => ({ k: 'mail' as const, fecha: m.fecha, m })),
      ]
        .filter((i) =>
          filtro === 'todo' ? true : filtro === 'gestiones' ? i.k === 'act' : filtro === 'comentarios' ? i.k === 'com' : i.k === 'mail',
        )
        .sort((x, y) => y.fecha.localeCompare(x.fecha))
    : []

  const contactos = datos?.datos.contactos ?? []

  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(280px, 2fr)', alignItems: 'start' }}>
      <section className="tarjeta min0">
        <div className="fila-entre" style={{ marginBottom: 8 }}>
          <h2>Historia</h2>
          <div className="fila">
            {(['todo', 'gestiones', 'comentarios', 'correos'] as const).map((k) => (
              <button key={k} className={'chico' + (filtro === k ? ' primario' : '')} onClick={() => setFiltro(k)}>
                {k === 'todo' ? 'Todo' : k[0].toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <AvisoCache desdeCache={datos?.desdeCache ?? false} />
        <ErrorMsg error={error} />
        {cargando ? (
          <Cargando />
        ) : items.length === 0 ? (
          <Vacio>Todavía no hay nada registrado. Cada intento cuenta: regístralo el mismo día.</Vacio>
        ) : (
          <ul className="linea">
            {items.map((i) =>
              i.k === 'act' ? (
                <li key={'a' + i.a.id} className={i.a.automatica ? 'auto' : ''}>
                  <span className="ico">{(TIPOS_ACTIVIDAD[i.a.tipo] ?? i.a.tipo).slice(0, 1)}</span>
                  <div className="min0">
                    <div className="fila-entre">
                      <b>
                        {i.a.titulo ?? etiqueta(TIPOS_ACTIVIDAD, i.a.tipo)}
                        {i.a.resultado && <span className="sec"> · {etiqueta(RESULTADOS, i.a.resultado)}</span>}
                      </b>
                      <span className="sec chico">{fechaHora(i.a.fecha)}</span>
                    </div>
                    <div className="sec chico">
                      {i.a.automatica ? 'Automático' : nombreDe(usuarios, i.a.autor_id)}
                      {i.a.contacto_id && ' · con ' + (contactos.find((c) => c.id === i.a.contacto_id)?.nombre ?? 'contacto')}
                      {i.a.proxima_gestion && ' · próxima: ' + fecha(i.a.proxima_gestion)}
                    </div>
                    {i.a.descripcion && <p>{i.a.descripcion}</p>}
                  </div>
                </li>
              ) : i.k === 'com' ? (
                <li key={'c' + i.c.id}>
                  <span className="ico">💬</span>
                  <div className="min0">
                    <div className="fila-entre">
                      <b>{nombreDe(usuarios, i.c.autor_id)}</b>
                      <span className="sec chico">{fechaHora(i.c.created_at)}</span>
                    </div>
                    {i.c.menciones.length > 0 && (
                      <div className="sec chico">Para: {i.c.menciones.map((u) => nombreDe(usuarios, u)).join(', ')}</div>
                    )}
                    <p>{i.c.texto}</p>
                  </div>
                </li>
              ) : (
                <li key={'m' + i.m.id}>
                  <span className="ico">@</span>
                  <div className="min0">
                    <div className="fila-entre">
                      <b>{i.m.asunto ?? '(sin asunto)'}</b>
                      <span className="sec chico">{fechaHora(i.m.fecha)}</span>
                    </div>
                    <div className="sec chico">De {i.m.de} · para {i.m.para.join(', ')}</div>
                    {i.m.cuerpo_texto && (
                      <details>
                        <summary className="chico">Ver correo</summary>
                        <p>{i.m.cuerpo_texto}</p>
                      </details>
                    )}
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <div className="pila">
        {puedeEditar && (
          <NuevaGestion
            proyectoId={proyecto.id}
            contactos={contactos}
            onHecho={async () => {
              await recargar()
              await recargarProyecto()
            }}
          />
        )}
        <NuevoComentario proyectoId={proyecto.id} yo={yo?.id ?? ''} onHecho={recargar} />
      </div>
    </div>
  )
}

function NuevaGestion({ proyectoId, contactos, onHecho }: { proyectoId: string; contactos: Contacto[]; onHecho: () => Promise<void> }) {
  const [tipo, setTipo] = useState<string>('llamada')
  const [resultado, setResultado] = useState('')
  const [contacto, setContacto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [proxima, setProxima] = useState(sumarDias(hoyISO(), 3))
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const esContacto = ['llamada', 'whatsapp', 'correo', 'visita', 'reunion', 'linkedin'].includes(tipo)

  const tomarGps = () => {
    navigator.geolocation?.getCurrentPosition(
      (p) => setGps({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setError('No se pudo leer la ubicación del teléfono.'),
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  const guardar = async () => {
    setError(null)
    setMsg(null)
    if (!proxima) return setError('Toda gestión deja una próxima fecha (curso 08). Elige cuándo vuelves a contactar.')
    if (esContacto && !resultado) return setError('Elige el resultado del intento.')
    setGuardando(true)
    try {
      const r = await ejecutar(
        {
          tipo: 'insert',
          tabla: 'b2b_actividades',
          fila: {
            id: crypto.randomUUID(),
            proyecto_id: proyectoId,
            tipo,
            resultado: esContacto ? resultado : null,
            contacto_id: contacto || null,
            descripcion: descripcion.trim() || null,
            fecha: new Date().toISOString(),
            proxima_gestion: proxima,
            lat: gps?.lat ?? null,
            lng: gps?.lng ?? null,
          },
        },
        `Gestión (${TIPOS_ACTIVIDAD[tipo]})`,
      )
      setDescripcion('')
      setResultado('')
      setGps(null)
      setMsg(r.encolada ? 'Sin señal: la gestión se guardó en el teléfono y se enviará sola.' : 'Gestión registrada.')
      if (!r.encolada) await onHecho()
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="tarjeta pila">
      <h2>Registrar gestión</h2>
      <div className="grid grid-2">
        <Campo etiqueta="Tipo">
          <Selector valor={tipo} onCambio={setTipo} opciones={Object.fromEntries(TIPOS_GESTION.map((t) => [t, TIPOS_ACTIVIDAD[t]]))} />
        </Campo>
        {esContacto && (
          <Campo etiqueta="Resultado">
            <Selector valor={resultado} onCambio={setResultado} opciones={RESULTADOS} vacio="—" />
          </Campo>
        )}
        <Campo etiqueta="Con quién">
          <Selector valor={contacto} onCambio={setContacto} opciones={Object.fromEntries(contactos.map((c) => [c.id, c.nombre + (c.cargo ? ' · ' + c.cargo : '')]))} vacio="—" />
        </Campo>
        <Campo etiqueta="Próxima gestión *">
          <input id="g-proxima" type="date" value={proxima} onChange={(e) => setProxima(e.target.value)} />
        </Campo>
      </div>
      <Campo etiqueta="Qué pasó y qué sigue">
        <textarea id="g-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </Campo>
      {(tipo === 'visita' || tipo === 'diagnostico') && (
        <div className="fila">
          <button className="chico" onClick={tomarGps}>📍 Registrar ubicación</button>
          {gps && <span className="sec chico mono">{gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}</span>}
        </div>
      )}
      <ErrorMsg error={error} />
      {msg && <div className="aviso ok">{msg}</div>}
      <div>
        <button className="primario" disabled={guardando} onClick={() => void guardar()}>Registrar</button>
      </div>
    </section>
  )
}

function NuevoComentario({ proyectoId, yo, onHecho }: { proyectoId: string; yo: string; onHecho: () => Promise<void> }) {
  const { usuarios } = useSesion()
  const [texto, setTexto] = useState('')
  const [menciones, setMenciones] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const enviar = async () => {
    if (!texto.trim()) return
    setError(null)
    try {
      ok(await supabase.from('b2b_comentarios').insert({ proyecto_id: proyectoId, autor_id: yo, texto: texto.trim(), menciones }))
      setTexto('')
      setMenciones([])
      await onHecho()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  const otros = usuarios.filter((u) => u.user_id !== yo && u.activo)
  return (
    <section className="tarjeta pila">
      <h2>Comentar</h2>
      <textarea id="c-texto" placeholder="Para el equipo: dudas, avances, pedidos…" value={texto} onChange={(e) => setTexto(e.target.value)} />
      <Campo etiqueta="Mencionar (les llega una notificación)">
        <select
          id="c-mencion"
          value=""
          onChange={(e) => e.target.value && setMenciones((m) => (m.includes(e.target.value) ? m : [...m, e.target.value]))}
        >
          <option value="">Agregar persona…</option>
          {otros.map((u) => (
            <option key={u.user_id} value={u.user_id}>{u.nombre}</option>
          ))}
        </select>
      </Campo>
      {menciones.length > 0 && (
        <div className="fila">
          {menciones.map((m) => (
            <button key={m} className="chico" onClick={() => setMenciones((x) => x.filter((y) => y !== m))} title="Quitar">
              @{nombreDe(usuarios, m)} ✕
            </button>
          ))}
        </div>
      )}
      <ErrorMsg error={error} />
      <div>
        <button onClick={() => void enviar()} disabled={!texto.trim()}>Comentar</button>
      </div>
    </section>
  )
}
