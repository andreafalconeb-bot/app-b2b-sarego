import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, ok } from '../lib/supabase'
import { leerConCache } from '../lib/offline'
import { usePermisos, useSesion } from '../lib/sesion'
import type { Proyecto } from '../lib/tipos'
import { FUENTES, LINEAS, SEGMENTOS, SUCURSALES, etiqueta } from '../lib/catalogos'
import { diasDesde, fecha } from '../lib/formato'
import { AvisoCache, Cargando, Campo, ErrorMsg, Modal, Pill, Selector, Vacio, mensajeError, useCarga } from '../components/ui'

export default function Prospectos() {
  const { etapas, usuarios, yo } = useSesion()
  const p = usePermisos()
  const [vista, setVista] = useState<'tablero' | 'lista'>('tablero')
  const [texto, setTexto] = useState('')
  const [responsable, setResponsable] = useState('')
  const [segmento, setSegmento] = useState('')
  const [soloAlertas, setSoloAlertas] = useState(false)
  const [verCerrados, setVerCerrados] = useState(false)
  const [nuevo, setNuevo] = useState(false)

  const { datos, error, cargando } = useCarga(
    () =>
      leerConCache('proyectos', async () =>
        ok(await supabase.from('b2b_proyectos_resumen').select('*').order('updated_at', { ascending: false })) as Proyecto[],
      ),
    [],
  )
  const proyectos = datos?.datos ?? []

  const filtrados = useMemo(() => {
    const t = texto.trim().toLowerCase()
    return proyectos.filter((x) => {
      if (t && !`${x.razon_social} ${x.nombre_comercial ?? ''} ${x.rif ?? ''} ${x.codigo} ${x.ciudad ?? ''}`.toLowerCase().includes(t)) return false
      if (responsable === 'sin') {
        if (x.responsable_id) return false
      } else if (responsable && x.responsable_id !== responsable) return false
      if (segmento && x.segmento !== segmento) return false
      if (soloAlertas && !x.estancado && !x.compromisos_vencidos && !x.muestras_criticas_abiertas) return false
      return true
    })
  }, [proyectos, texto, responsable, segmento, soloAlertas])

  const columnas = etapas.filter((e) => verCerrados || e.fase !== 'cierre')
  const ingenieros = usuarios.filter((u) => u.rol === 'ingeniero')
  const puedeCrear = p.gestion || p.ingeniero

  return (
    <>
      <div className="titulo-pagina">
        <div>
          <h1>Prospectos y cuentas</h1>
          <div className="sec chico">
            {filtrados.length} de {proyectos.length}
            {!p.leeTodo && ' · ves tus proyectos y los que te compartieron'}
          </div>
        </div>
        <div className="fila">
          <div className="fila" role="group" aria-label="Vista">
            <button className={vista === 'tablero' ? 'primario chico' : 'chico'} onClick={() => setVista('tablero')}>Tablero</button>
            <button className={vista === 'lista' ? 'primario chico' : 'chico'} onClick={() => setVista('lista')}>Lista</button>
          </div>
          {puedeCrear && <button className="primario" onClick={() => setNuevo(true)}>+ Nuevo prospecto</button>}
        </div>
      </div>

      <div className="tarjeta" style={{ marginBottom: 12 }}>
        <div className="grid grid-4">
          <Campo etiqueta="Buscar">
            <input id="buscar" placeholder="Nombre, RIF, ciudad o P-0001" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </Campo>
          {p.leeTodo && (
            <Campo etiqueta="Responsable">
              <select id="f-resp" value={responsable} onChange={(e) => setResponsable(e.target.value)}>
                <option value="">Todos</option>
                <option value="sin">Sin asignar (oficina)</option>
                {ingenieros.map((u) => (
                  <option key={u.user_id} value={u.user_id}>{u.nombre}</option>
                ))}
              </select>
            </Campo>
          )}
          <Campo etiqueta="Segmento">
            <Selector valor={segmento} onCambio={setSegmento} opciones={SEGMENTOS} vacio="Todos" />
          </Campo>
          <div className="pila" style={{ justifyContent: 'flex-end' }}>
            <label className="check"><input type="checkbox" checked={soloAlertas} onChange={(e) => setSoloAlertas(e.target.checked)} /> Solo con alertas</label>
            <label className="check"><input type="checkbox" checked={verCerrados} onChange={(e) => setVerCerrados(e.target.checked)} /> Ver "Más adelante" y "Perdido"</label>
          </div>
        </div>
      </div>

      <AvisoCache desdeCache={datos?.desdeCache ?? false} />
      <ErrorMsg error={error} />
      {cargando ? (
        <Cargando />
      ) : proyectos.length === 0 ? (
        <div className="tarjeta">
          <Vacio>
            Todavía no hay prospectos{p.gestion ? '. Cárgalos con "+ Nuevo prospecto" o desde Semillas (Google Maps).' : ' asignados a ti.'}
          </Vacio>
        </div>
      ) : vista === 'tablero' ? (
        <div className="tablero">
          {columnas.map((e) => {
            const items = filtrados.filter((x) => x.etapa === e.codigo)
            return (
              <section key={e.codigo} className={'columna fase-' + e.fase}>
                <h3>
                  <span>{e.nombre}</span>
                  <span className="mono">{items.length}</span>
                </h3>
                {items.map((x) => (
                  <FichaProyecto key={x.id} x={x} />
                ))}
              </section>
            )
          })}
        </div>
      ) : (
        <div className="tarjeta tabla-wrap">
          <TablaProyectos proyectos={filtrados} />
        </div>
      )}

      {puedeCrear && (
        <NuevoProspecto
          abierto={nuevo}
          onCerrar={() => setNuevo(false)}
          responsablePropio={p.ingeniero && !p.gestion ? yo!.id : null}
        />
      )}
    </>
  )
}

function FichaProyecto({ x }: { x: Proyecto }) {
  const clase = 'ficha' + (x.muestras_criticas_abiertas ? ' critico' : x.estancado ? ' estancado' : '')
  const dias = diasDesde(x.ultima_gestion_at ?? x.created_at)
  return (
    <Link to={'/proyecto/' + x.id} className={clase}>
      <div className="fila-entre">
        <span className="mono sec">{x.codigo}</span>
        <span className="mono sec" title="Criterios del cliente ideal (curso 06, módulo 2)">{x.puntaje}/5</span>
      </div>
      <div className="nom">{x.nombre_comercial || x.razon_social}</div>
      <div className="sec chico">
        {etiqueta(SEGMENTOS, x.segmento)}
        {x.ciudad ? ' · ' + x.ciudad : ''}
      </div>
      <div className="fila chico" style={{ marginTop: 4 }}>
        <span className="sec">{x.responsable_nombre ?? 'Oficina'}</span>
        {x.estancado && <Pill tono="alerta">Estancado {dias} d</Pill>}
        {x.compromisos_vencidos > 0 && <Pill tono="alerta">{x.compromisos_vencidos} vencido(s)</Pill>}
        {x.muestras_criticas_abiertas > 0 && <Pill tono="critico">Muestra crítica</Pill>}
      </div>
    </Link>
  )
}

export function TablaProyectos({ proyectos }: { proyectos: Proyecto[] }) {
  const nav = useNavigate()
  if (!proyectos.length) return <Vacio>No hay proyectos con estos filtros.</Vacio>
  return (
    <table>
      <thead>
        <tr>
          <th>Código</th>
          <th>Empresa</th>
          <th>Etapa</th>
          <th>Responsable</th>
          <th>Puntaje</th>
          <th>Última gestión</th>
          <th>Próxima</th>
          <th>Alertas</th>
        </tr>
      </thead>
      <tbody>
        {proyectos.map((x) => (
          <tr key={x.id} className="clic" onClick={() => nav('/proyecto/' + x.id)}>
            <td className="mono">{x.codigo}</td>
            <td>
              <b>{x.nombre_comercial || x.razon_social}</b>
              <div className="sec chico">{etiqueta(SEGMENTOS, x.segmento)} · {x.ciudad ?? '—'}</div>
            </td>
            <td>{x.etapa_nombre}</td>
            <td>{x.responsable_nombre ?? <span className="sec">Oficina</span>}</td>
            <td className="num">{x.puntaje}/5</td>
            <td className="num">{fecha(x.ultima_gestion_at)}</td>
            <td className="num">{fecha(x.proxima_gestion)}</td>
            <td>
              <div className="fila">
                {x.estancado && <Pill tono="alerta">Estancado</Pill>}
                {x.compromisos_vencidos > 0 && <Pill tono="alerta">{x.compromisos_vencidos} compromiso(s)</Pill>}
                {x.muestras_criticas_abiertas > 0 && <Pill tono="critico">Crítica</Pill>}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

interface Duplicado {
  proyecto_id: string
  codigo: string
  razon_social: string
  etapa: string
  responsable: string | null
}
interface ClienteErp {
  codigo_sarego: string
  nombre_erp: string
  clasificacion: string
  similitud: number
}

function NuevoProspecto({ abierto, onCerrar, responsablePropio }: { abierto: boolean; onCerrar: () => void; responsablePropio: string | null }) {
  const nav = useNavigate()
  const vacio = {
    razon_social: '',
    nombre_comercial: '',
    rif: '',
    segmento: '',
    lineas: ['lubricantes'] as string[],
    sucursal: '01',
    ciudad: '',
    direccion: '',
    telefono: '',
    email: '',
    fuente: '',
    fuente_detalle: '',
  }
  const [f, setF] = useState(vacio)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [dups, setDups] = useState<Duplicado[]>([])
  const [erp, setErp] = useState<ClienteErp[]>([])
  const set = (k: keyof typeof vacio, v: string | string[]) => setF((x) => ({ ...x, [k]: v }))

  const revisar = async () => {
    if (f.razon_social.trim().length < 4 && !f.rif.trim()) return
    const [d, e] = await Promise.all([
      supabase.rpc('b2b_buscar_duplicados', { p_nombre: f.nombre_comercial || f.razon_social, p_rif: f.rif || null }),
      supabase.rpc('buscar_cliente_erp_similar', { p_nombre: f.nombre_comercial || f.razon_social, p_direccion: f.direccion || '' }),
    ])
    setDups((d.data as Duplicado[] | null) ?? [])
    setErp(((e.data as ClienteErp[] | null) ?? []).slice(0, 3))
  }

  const guardar = async () => {
    if (!f.razon_social.trim()) return setError('Escribe la razón social.')
    setGuardando(true)
    setError(null)
    try {
      const fila = {
        razon_social: f.razon_social.trim(),
        nombre_comercial: f.nombre_comercial.trim() || null,
        rif: f.rif.trim().toUpperCase() || null,
        segmento: f.segmento || null,
        lineas: f.lineas,
        sucursal: f.sucursal || null,
        ciudad: f.ciudad.trim() || null,
        direccion: f.direccion.trim() || null,
        telefono: f.telefono.trim() || null,
        email: f.email.trim() || null,
        fuente: f.fuente || null,
        fuente_detalle: f.fuente_detalle.trim() || null,
        responsable_id: responsablePropio,
        asignado_at: responsablePropio ? new Date().toISOString() : null,
        etapa: responsablePropio ? 'asignado' : 'semilla',
      }
      const r = ok(await supabase.from('b2b_proyectos').insert(fila).select('id').single()) as { id: string }
      setF(vacio)
      onCerrar()
      nav('/proyecto/' + r.id)
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Nuevo prospecto"
      onCerrar={onCerrar}
      pie={
        <>
          <button onClick={onCerrar}>Cancelar</button>
          <button className="primario" disabled={guardando} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Crear prospecto'}</button>
        </>
      }
    >
      <p className="sec chico" style={{ margin: 0 }}>
        Carga lo mínimo; la ficha se completa con la investigación. Curso 06: si no sabes qué equipos tiene, todavía no se llama.
      </p>
      <div className="grid grid-2">
        <Campo etiqueta="Razón social *">
          <input id="np-razon" value={f.razon_social} onChange={(e) => set('razon_social', e.target.value)} onBlur={() => void revisar()} />
        </Campo>
        <Campo etiqueta="Nombre comercial">
          <input id="np-comercial" value={f.nombre_comercial} onChange={(e) => set('nombre_comercial', e.target.value)} onBlur={() => void revisar()} />
        </Campo>
        <Campo etiqueta="RIF">
          <input id="np-rif" placeholder="J-12345678-9" value={f.rif} onChange={(e) => set('rif', e.target.value)} onBlur={() => void revisar()} />
        </Campo>
        <Campo etiqueta="Segmento">
          <Selector valor={f.segmento} onCambio={(v) => set('segmento', v)} opciones={SEGMENTOS} vacio="—" />
        </Campo>
        <Campo etiqueta="Sucursal">
          <Selector valor={f.sucursal} onCambio={(v) => set('sucursal', v)} opciones={SUCURSALES} vacio="—" />
        </Campo>
        <Campo etiqueta="Ciudad">
          <input id="np-ciudad" value={f.ciudad} onChange={(e) => set('ciudad', e.target.value)} />
        </Campo>
      </div>
      <Campo etiqueta="Dirección">
        <input id="np-dir" value={f.direccion} onChange={(e) => set('direccion', e.target.value)} />
      </Campo>
      <div className="grid grid-2">
        <Campo etiqueta="Teléfono">
          <input id="np-tel" value={f.telefono} onChange={(e) => set('telefono', e.target.value)} />
        </Campo>
        <Campo etiqueta="Correo">
          <input id="np-email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
        </Campo>
        <Campo etiqueta="Fuente">
          <Selector valor={f.fuente} onCambio={(v) => set('fuente', v)} opciones={FUENTES} vacio="—" />
        </Campo>
        <Campo etiqueta="Detalle de la fuente">
          <input id="np-fuente-det" placeholder="Quién refirió, qué feria…" value={f.fuente_detalle} onChange={(e) => set('fuente_detalle', e.target.value)} />
        </Campo>
      </div>
      <div className="fila">
        <span className="sec chico">Líneas:</span>
        {Object.entries(LINEAS).map(([k, v]) => (
          <label key={k} className="check">
            <input
              type="checkbox"
              checked={f.lineas.includes(k)}
              onChange={(e) => set('lineas', e.target.checked ? [...f.lineas, k] : f.lineas.filter((l) => l !== k))}
            />
            {v}
          </label>
        ))}
      </div>
      {dups.length > 0 && (
        <div className="aviso alerta">
          <b>Ya existe en B2B:</b>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {dups.map((d) => (
              <li key={d.proyecto_id}>
                {d.codigo} · {d.razon_social} · {d.etapa} · {d.responsable ?? 'Oficina'}
              </li>
            ))}
          </ul>
        </div>
      )}
      {erp.length > 0 && (
        <div className="aviso">
          <b>Parece cliente en Profit:</b>{' '}
          {erp.map((c) => `${c.nombre_erp} (${c.codigo_sarego}, ${c.clasificacion})`).join(' · ')}
        </div>
      )}
      <ErrorMsg error={error} />
    </Modal>
  )
}
