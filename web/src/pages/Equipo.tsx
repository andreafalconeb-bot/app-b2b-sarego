import { useState } from 'react'
import { supabase, ok } from '../lib/supabase'
import { usePermisos, useSesion } from '../lib/sesion'
import type { Etapa, Parametro, Rol, UsuarioB2B } from '../lib/tipos'
import { COMPONENTES, ROLES, SEGMENTOS, SUCURSALES, TIPOS_EQUIPO, etiqueta } from '../lib/catalogos'
import { Campo, Cargando, ErrorMsg, Modal, Pill, Selector, Vacio, mensajeError, useCarga } from '../components/ui'
import type { Limite } from '../lib/semaforo'

export default function Equipo() {
  const p = usePermisos()
  const [pestana, setPestana] = useState<'personas' | 'etapas' | 'limites' | 'config'>('personas')
  if (!p.gerente) return <div className="aviso">Solo el gerente B2B administra el equipo.</div>
  return (
    <>
      <div className="titulo-pagina">
        <h1>Equipo y configuración</h1>
      </div>
      <div className="pestanas" role="tablist">
        {([['personas', 'Personas y roles'], ['etapas', 'Etapas y curso'], ['limites', 'Límites del semáforo'], ['config', 'Ajustes']] as const).map(([k, t]) => (
          <button key={k} className={pestana === k ? 'activa' : ''} onClick={() => setPestana(k)}>{t}</button>
        ))}
      </div>
      {pestana === 'personas' && <Personas />}
      {pestana === 'etapas' && <Etapas />}
      {pestana === 'limites' && <Limites />}
      {pestana === 'config' && <Ajustes />}
    </>
  )
}

function Personas() {
  const { recargar: recargarSesion } = useSesion()
  const [editando, setEditando] = useState<(Partial<UsuarioB2B> & { nuevo?: boolean }) | null>(null)
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState<{ user_id: string; nombre: string; tiene_b2b: boolean }[]>([])
  const { datos, error, cargando, recargar } = useCarga(
    async () => {
      const r = ok(await supabase.from('b2b_usuarios').select('*')) as (Omit<UsuarioB2B, 'nombre'>)[]
      const nombres = (ok(await supabase.rpc('b2b_listar_usuarios')) as UsuarioB2B[]) ?? []
      return r.map((u) => ({ ...u, nombre: nombres.find((n) => n.user_id === u.user_id)?.nombre ?? '—' })) as UsuarioB2B[]
    },
    [],
  )

  const buscar = async (texto: string) => {
    setQ(texto)
    if (texto.trim().length < 2) return setResultados([])
    const r = await supabase.rpc('b2b_buscar_perfiles', { p_q: texto.trim() })
    setResultados((r.data as typeof resultados) ?? [])
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(260px, 1fr)', alignItems: 'start' }}>
      <section className="tarjeta tabla-wrap min0">
        <ErrorMsg error={error} />
        {cargando ? (
          <Cargando />
        ) : !datos?.length ? (
          <Vacio>Nadie tiene acceso B2B todavía.</Vacio>
        ) : (
          <table>
            <thead><tr><th>Persona</th><th>Rol</th><th>Sucursal</th><th>Especialidades / zonas</th><th></th></tr></thead>
            <tbody>
              {datos.sort((a, b) => a.nombre.localeCompare(b.nombre)).map((u) => (
                <tr key={u.user_id}>
                  <td>{u.nombre} {!u.activo && <Pill>Inactivo</Pill>}</td>
                  <td>{ROLES[u.rol]}</td>
                  <td>{etiqueta(SUCURSALES, u.sucursal)}</td>
                  <td className="chico">{[...(u.especialidades ?? []).map((e) => SEGMENTOS[e] ?? e), ...(u.zonas ?? [])].join(', ') || '—'}</td>
                  <td><button className="chico" onClick={() => setEditando(u)}>Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="tarjeta pila">
        <h2>Dar acceso B2B</h2>
        <p className="sec chico" style={{ margin: 0 }}>La persona ya debe tener cuenta en la app retail. Entra con el mismo usuario y contraseña.</p>
        <Campo etiqueta="Buscar por nombre"><input value={q} onChange={(e) => void buscar(e.target.value)} /></Campo>
        {resultados.map((r) => (
          <div key={r.user_id} className="fila-entre">
            <span>{r.nombre}</span>
            {r.tiene_b2b ? <Pill>Ya tiene</Pill> : <button className="chico" onClick={() => setEditando({ user_id: r.user_id, nombre: r.nombre, rol: 'ingeniero', zonas: [], especialidades: [], activo: true, nuevo: true })}>Dar acceso</button>}
          </div>
        ))}
      </section>
      <EditarPersona
        u={editando}
        onCerrar={() => setEditando(null)}
        onHecho={async () => {
          setResultados([])
          setQ('')
          await recargar()
          await recargarSesion()
        }}
      />
    </div>
  )
}

function EditarPersona({ u, onCerrar, onHecho }: { u: (Partial<UsuarioB2B> & { nuevo?: boolean }) | null; onCerrar: () => void; onHecho: () => Promise<void> }) {
  const [f, setF] = useState<Partial<UsuarioB2B>>({})
  const [zonas, setZonas] = useState('')
  const [cargado, setCargado] = useState<typeof u>(null)
  const [proyectos, setProyectos] = useState<{ id: string; codigo: string; razon_social: string }[]>([])
  const [clienteProyecto, setClienteProyecto] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (u !== cargado) {
    setCargado(u)
    setF(u ?? {})
    setZonas((u?.zonas ?? []).join(', '))
    setError(null)
  }
  const guardar = async () => {
    setError(null)
    if (f.rol === 'cliente' && !clienteProyecto) return setError('Elige la cuenta cuyo portal verá este cliente.')
    const fila = {
      user_id: f.user_id,
      rol: f.rol,
      sucursal: f.sucursal || null,
      zonas: zonas.split(',').map((z) => z.trim()).filter(Boolean),
      especialidades: f.especialidades ?? [],
      activo: f.activo ?? true,
      proyecto_cliente_id: f.rol === 'cliente' ? clienteProyecto : null,
    }
    try {
      ok(await supabase.from('b2b_usuarios').upsert(fila))
      onCerrar()
      await onHecho()
    } catch (e) {
      setError(mensajeError(e))
    }
  }
  const cargarProyectos = async () => {
    if (proyectos.length) return
    const r = await supabase.from('b2b_proyectos_resumen').select('id, codigo, razon_social').order('razon_social')
    setProyectos((r.data as typeof proyectos) ?? [])
  }
  return (
    <Modal abierto={u !== null} titulo={u?.nuevo ? `Dar acceso a ${u?.nombre}` : `Editar a ${u?.nombre}`} onCerrar={onCerrar} pie={<><button onClick={onCerrar}>Cancelar</button><button className="primario" onClick={() => void guardar()}>Guardar</button></>}>
      <div className="grid grid-2">
        <Campo etiqueta="Rol">
          <Selector valor={f.rol} onCambio={(v) => { setF({ ...f, rol: v as Rol }); if (v === 'cliente') void cargarProyectos() }} opciones={ROLES} />
        </Campo>
        <Campo etiqueta="Sucursal"><Selector valor={f.sucursal} onCambio={(v) => setF({ ...f, sucursal: v })} opciones={SUCURSALES} vacio="Todas" /></Campo>
      </div>
      {f.rol === 'cliente' && (
        <Campo etiqueta="Cuenta del portal">
          <select value={clienteProyecto} onChange={(e) => setClienteProyecto(e.target.value)}>
            <option value="">Elegir…</option>
            {proyectos.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.razon_social}</option>)}
          </select>
        </Campo>
      )}
      {f.rol === 'ingeniero' && (
        <>
          <div className="pila">
            <span className="sec chico">Especialidades (para sugerir asignaciones)</span>
            <div className="grid grid-2">
              {Object.entries(SEGMENTOS).map(([k, v]) => (
                <label key={k} className="check">
                  <input type="checkbox" checked={(f.especialidades ?? []).includes(k)} onChange={(e) => setF({ ...f, especialidades: e.target.checked ? [...(f.especialidades ?? []), k] : (f.especialidades ?? []).filter((x) => x !== k) })} />
                  {v}
                </label>
              ))}
            </div>
          </div>
          <Campo etiqueta="Zonas o ciudades (separadas por coma)"><input value={zonas} onChange={(e) => setZonas(e.target.value)} placeholder="Valencia, Guacara, Maracay" /></Campo>
        </>
      )}
      <label className="check"><input type="checkbox" checked={f.activo ?? true} onChange={(e) => setF({ ...f, activo: e.target.checked })} /> Activo</label>
      <ErrorMsg error={error} />
    </Modal>
  )
}

function Etapas() {
  const { recargar: recargarSesion } = useSesion()
  const { datos, error, cargando, recargar } = useCarga(async () => ok(await supabase.from('b2b_etapas').select('*').order('orden')) as Etapa[], [])
  const [err, setErr] = useState<string | null>(null)
  const guardar = async (e: Etapa, cambios: Partial<Etapa>) => {
    try {
      ok(await supabase.from('b2b_etapas').update(cambios).eq('codigo', e.codigo))
      await recargar()
      await recargarSesion()
    } catch (x) {
      setErr(mensajeError(x))
    }
  }
  return (
    <section className="tarjeta pila">
      <p className="sec chico" style={{ margin: 0 }}>
        Las etapas siguen el curso 06 de la Academia. Si el curso cambia, ajusta aquí el nombre, la descripción y el enlace a la lección: se ve al instante en cada proyecto.
      </p>
      <ErrorMsg error={error ?? err} />
      {cargando ? <Cargando /> : (datos ?? []).map((e) => (
        <div key={e.codigo} className="grid" style={{ gridTemplateColumns: '40px minmax(140px,1fr) minmax(200px,2fr) minmax(160px,1fr) auto', gap: 8, alignItems: 'start', borderTop: '1px solid var(--borde)', paddingTop: 8 }}>
          <span className="mono sec">{e.orden}</span>
          <input defaultValue={e.nombre} onBlur={(x) => x.target.value !== e.nombre && void guardar(e, { nombre: x.target.value })} aria-label="Nombre" />
          <textarea defaultValue={e.descripcion ?? ''} onBlur={(x) => x.target.value !== (e.descripcion ?? '') && void guardar(e, { descripcion: x.target.value })} aria-label="Descripción" style={{ minHeight: 40 }} />
          <div className="pila">
            <input defaultValue={e.curso_modulo ?? ''} placeholder="Módulo" onBlur={(x) => void guardar(e, { curso_modulo: x.target.value || null })} aria-label="Módulo del curso" />
            <input defaultValue={e.curso_url ?? ''} placeholder="Enlace a la lección" onBlur={(x) => void guardar(e, { curso_url: x.target.value || null })} aria-label="Enlace" />
          </div>
          <label className="check chico"><input type="checkbox" defaultChecked={e.activa} onChange={(x) => void guardar(e, { activa: x.target.checked })} /> Activa</label>
        </div>
      ))}
    </section>
  )
}

function Limites() {
  const { datos, error, cargando, recargar } = useCarga(async () => {
    const [l, p] = await Promise.all([supabase.from('b2b_limites').select('*'), supabase.from('b2b_parametros').select('*').order('orden')])
    return { limites: ok(l) as (Limite & { id: string })[], parametros: ok(p) as Parametro[] }
  }, [])
  const [f, setF] = useState<Record<string, string>>({ parametro_codigo: 'fe', componente: '', tipo_equipo: '' })
  const [err, setErr] = useState<string | null>(null)
  const n = (v: string | undefined) => (v === undefined || v === '' ? null : Number(v))
  const agregar = async () => {
    try {
      ok(await supabase.from('b2b_limites').insert({
        parametro_codigo: f.parametro_codigo,
        componente: f.componente || null,
        tipo_equipo: f.tipo_equipo || null,
        precaucion_min: n(f.precaucion_min),
        precaucion_max: n(f.precaucion_max),
        critico_min: n(f.critico_min),
        critico_max: n(f.critico_max),
      }))
      setF({ parametro_codigo: f.parametro_codigo, componente: f.componente, tipo_equipo: f.tipo_equipo })
      await recargar()
    } catch (e) {
      setErr(mensajeError(e))
    }
  }
  const borrar = async (id: string) => {
    await supabase.from('b2b_limites').delete().eq('id', id)
    await recargar()
  }
  const par = (c: string) => datos?.parametros.find((p) => p.codigo === c)
  return (
    <section className="tarjeta pila">
      <p className="sec chico" style={{ margin: 0 }}>
        Límites para el semáforo automático de cada resultado. Gana el más específico (componente + tipo de equipo). Copia los límites que use Smart Assistance o el fabricante del equipo; el ingeniero siempre confirma el semáforo final.
      </p>
      <ErrorMsg error={error ?? err} />
      {cargando ? <Cargando /> : (
        <div className="tabla-wrap">
          <table>
            <thead><tr><th>Parámetro</th><th>Componente</th><th>Equipo</th><th>Precaución</th><th>Crítico</th><th></th></tr></thead>
            <tbody>
              {(datos?.limites ?? []).map((l) => (
                <tr key={l.id}>
                  <td>{par(l.parametro_codigo)?.nombre}</td>
                  <td>{etiqueta(COMPONENTES, l.componente) === '—' ? 'Todos' : etiqueta(COMPONENTES, l.componente)}</td>
                  <td>{l.tipo_equipo ? TIPOS_EQUIPO[l.tipo_equipo] : 'Todos'}</td>
                  <td className="num">{l.precaucion_min != null ? '≤ ' + l.precaucion_min : ''} {l.precaucion_max != null ? '≥ ' + l.precaucion_max : ''}</td>
                  <td className="num">{l.critico_min != null ? '≤ ' + l.critico_min : ''} {l.critico_max != null ? '≥ ' + l.critico_max : ''}</td>
                  <td><button className="chico" onClick={() => void borrar(l.id)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="grid grid-4">
        <Campo etiqueta="Parámetro"><Selector valor={f.parametro_codigo} onCambio={(v) => setF({ ...f, parametro_codigo: v })} opciones={Object.fromEntries((datos?.parametros ?? []).map((p) => [p.codigo, p.nombre]))} /></Campo>
        <Campo etiqueta="Componente"><Selector valor={f.componente} onCambio={(v) => setF({ ...f, componente: v })} opciones={COMPONENTES} vacio="Todos" /></Campo>
        <Campo etiqueta="Tipo de equipo"><Selector valor={f.tipo_equipo} onCambio={(v) => setF({ ...f, tipo_equipo: v })} opciones={TIPOS_EQUIPO} vacio="Todos" /></Campo>
        <span />
        <Campo etiqueta="Precaución si ≥"><input type="number" step="any" value={f.precaucion_max ?? ''} onChange={(e) => setF({ ...f, precaucion_max: e.target.value })} /></Campo>
        <Campo etiqueta="Crítico si ≥"><input type="number" step="any" value={f.critico_max ?? ''} onChange={(e) => setF({ ...f, critico_max: e.target.value })} /></Campo>
        <Campo etiqueta="Precaución si ≤ (TBN, viscosidad)"><input type="number" step="any" value={f.precaucion_min ?? ''} onChange={(e) => setF({ ...f, precaucion_min: e.target.value })} /></Campo>
        <Campo etiqueta="Crítico si ≤"><input type="number" step="any" value={f.critico_min ?? ''} onChange={(e) => setF({ ...f, critico_min: e.target.value })} /></Campo>
      </div>
      <div><button className="primario" onClick={() => void agregar()}>Agregar límite</button></div>
    </section>
  )
}

function Ajustes() {
  const { datos, error, recargar } = useCarga(async () => ok(await supabase.from('b2b_config').select('*').single()) as { dias_estancado: number; horas_aviso_critico: number; ia_presupuesto_mensual_usd: number }, [])
  const [err, setErr] = useState<string | null>(null)
  const guardar = async (c: Record<string, number>) => {
    try {
      ok(await supabase.from('b2b_config').update(c).eq('id', true))
      await recargar()
    } catch (e) {
      setErr(mensajeError(e))
    }
  }
  if (!datos) return <ErrorMsg error={error} />
  return (
    <section className="tarjeta pila" style={{ maxWidth: 520 }}>
      <Campo etiqueta="Días sin gestión para considerar un prospecto estancado">
        <input type="number" defaultValue={datos.dias_estancado} onBlur={(e) => void guardar({ dias_estancado: Number(e.target.value) })} />
      </Campo>
      <Campo etiqueta="Horas para avisar al cliente un resultado crítico">
        <input type="number" defaultValue={datos.horas_aviso_critico} onBlur={(e) => void guardar({ horas_aviso_critico: Number(e.target.value) })} />
      </Campo>
      <Campo etiqueta="Tope de gasto mensual de la investigación con IA (US$)">
        <input type="number" min={0} step={1} defaultValue={datos.ia_presupuesto_mensual_usd} onBlur={(e) => void guardar({ ia_presupuesto_mensual_usd: Number(e.target.value) })} />
      </Campo>
      <p className="sec chico" style={{ margin: 0 }}>Al llegar al tope, nadie puede investigar hasta el mes siguiente. Una preliminar cuesta ~US$ 0,02 y una completa ~US$ 0,06.</p>
      <ErrorMsg error={err} />
    </section>
  )
}
