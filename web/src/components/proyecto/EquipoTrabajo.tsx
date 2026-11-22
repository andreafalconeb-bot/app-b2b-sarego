import { useState } from 'react'
import { supabase, ok } from '../../lib/supabase'
import { nombreDe, usePermisos, useSesion } from '../../lib/sesion'
import type { Asignacion } from '../../lib/tipos'
import { SEGMENTOS, etiqueta } from '../../lib/catalogos'
import { fechaHora } from '../../lib/formato'
import { Campo, Cargando, ErrorMsg, Pill, Vacio, mensajeError, useCarga } from '../ui'
import type { Miembro, PropsPestana } from '../../pages/Proyecto'

interface Sugerencia {
  user_id: string
  nombre: string
  coincide_zona: boolean
  coincide_especialidad: boolean
  relacion_previa: boolean
  proyectos_activos: number
  puntaje: number
}

export default function EquipoTrabajo({ proyecto, recargarProyecto, miembros }: PropsPestana & { miembros: Miembro[] }) {
  const { usuarios, yo } = useSesion()
  const p = usePermisos()
  const [destino, setDestino] = useState('')
  const [motivo, setMotivo] = useState('')
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [nuevoMiembro, setNuevoMiembro] = useState('')
  const [rolMiembro, setRolMiembro] = useState<'colaborador' | 'seguidor'>('colaborador')

  const esDueno = proyecto.responsable_id === yo?.id
  const esTraspaso = !!proyecto.responsable_id
  const puedeAsignar = p.gestion || (esDueno && esTraspaso)

  const historial = useCarga(
    async () => ok(await supabase.from('b2b_asignaciones').select('*').eq('proyecto_id', proyecto.id).order('created_at', { ascending: false })) as Asignacion[],
    [proyecto.id, proyecto.responsable_id],
  )
  const sugerencias = useCarga(
    async () => (p.gestion ? (ok(await supabase.rpc('b2b_sugerir_ingenieros', { p_proyecto: proyecto.id })) as Sugerencia[]) : []),
    [proyecto.id, p.gestion],
  )

  const asignar = async (aUser: string | null) => {
    setError(null)
    setMsg(null)
    if (esTraspaso && (!motivo.trim() || !nota.trim())) return setError('El traspaso necesita motivo y nota de traspaso: qué se habló, qué falta y con quién.')
    try {
      const r = ok(
        await supabase.rpc('b2b_asignar_proyecto', { p_proyecto: proyecto.id, p_a_user: aUser, p_motivo: motivo || null, p_nota: nota || null }),
      ) as Asignacion
      setMotivo('')
      setNota('')
      setDestino('')
      setMsg(r.estado === 'pendiente' ? 'Pedido de traspaso enviado. Lo aprueba el gerente o la oficina.' : 'Listo.')
      await historial.recargar()
      await recargarProyecto()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  const resolver = async (a: Asignacion, aprobar: boolean) => {
    try {
      ok(await supabase.rpc('b2b_resolver_traspaso', { p_asignacion: a.id, p_aprobar: aprobar }))
      await historial.recargar()
      await recargarProyecto()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  const agregarMiembro = async () => {
    if (!nuevoMiembro) return
    try {
      ok(await supabase.from('b2b_proyecto_miembros').upsert({ proyecto_id: proyecto.id, user_id: nuevoMiembro, rol_en_proyecto: rolMiembro }))
      setNuevoMiembro('')
      await recargarProyecto()
    } catch (e) {
      setError(mensajeError(e))
    }
  }
  const quitarMiembro = async (u: string) => {
    try {
      ok(await supabase.from('b2b_proyecto_miembros').delete().eq('proyecto_id', proyecto.id).eq('user_id', u))
      await recargarProyecto()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  const ingenieros = usuarios.filter((u) => (u.rol === 'ingeniero' || u.rol === 'gerente') && u.activo && u.user_id !== proyecto.responsable_id)
  const pendientes = (historial.datos ?? []).filter((a) => a.estado === 'pendiente')
  const candidatos = usuarios.filter((u) => u.activo && u.user_id !== proyecto.responsable_id && !miembros.some((m) => m.user_id === u.user_id))

  return (
    <div className="grid grid-2" style={{ alignItems: 'start' }}>
      <div className="pila">
        <section className="tarjeta pila">
          <h2>Responsable</h2>
          <div className="fila-entre">
            <b>{proyecto.responsable_nombre ?? 'Oficina de prospectación (sin ingeniero)'}</b>
            {proyecto.responsable_id && p.gestion && (
              <button className="chico" onClick={() => void asignar(null)} disabled={!motivo || !nota} title="Necesita motivo y nota">
                Devolver a la oficina
              </button>
            )}
          </div>

          {pendientes.length > 0 && (
            <div className="aviso alerta pila">
              {pendientes.map((a) => (
                <div key={a.id}>
                  <b>Traspaso pendiente</b> de {nombreDe(usuarios, a.de_user_id)} a {nombreDe(usuarios, a.a_user_id)}: {a.motivo}
                  <div className="chico">Nota: {a.nota_traspaso}</div>
                  {p.gestion && (
                    <div className="fila" style={{ marginTop: 6 }}>
                      <button className="chico primario" onClick={() => void resolver(a, true)}>Aprobar</button>
                      <button className="chico" onClick={() => void resolver(a, false)}>Rechazar</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {puedeAsignar ? (
            <>
              <h3>{esTraspaso ? (p.gestion ? 'Traspasar a otro ingeniero' : 'Pedir traspaso a otro ingeniero') : 'Asignar a un ingeniero'}</h3>
              {p.gestion && !sugerencias.cargando && (sugerencias.datos ?? []).length > 0 && (
                <div className="pila chico">
                  <span className="sec">Sugeridos (zona, especialidad en {etiqueta(SEGMENTOS, proyecto.segmento)}, relación previa y carga). Tú decides:</span>
                  {(sugerencias.datos ?? []).slice(0, 4).map((s) => (
                    <label key={s.user_id} className="check">
                      <input type="radio" name="destino" checked={destino === s.user_id} onChange={() => setDestino(s.user_id)} />
                      <span>
                        <b>{s.nombre}</b> · {s.proyectos_activos} activos{' '}
                        {s.coincide_zona && <Pill tono="ok">Zona</Pill>} {s.coincide_especialidad && <Pill tono="ok">Especialidad</Pill>}{' '}
                        {s.relacion_previa && <Pill tono="acento">Ya lo conoce</Pill>}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <Campo etiqueta="Ingeniero">
                <select id="as-destino" value={destino} onChange={(e) => setDestino(e.target.value)}>
                  <option value="">Elegir…</option>
                  {ingenieros.map((u) => (
                    <option key={u.user_id} value={u.user_id}>{u.nombre}</option>
                  ))}
                </select>
              </Campo>
              <Campo etiqueta={esTraspaso ? 'Motivo *' : 'Motivo (opcional)'}>
                <input id="as-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Cambio de zona, especialidad, carga…" />
              </Campo>
              <Campo etiqueta={esTraspaso ? 'Nota de traspaso *' : 'Nota para el ingeniero'}>
                <textarea id="as-nota" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Qué se habló, con quién, qué está pendiente y la próxima fecha acordada." />
              </Campo>
              <ErrorMsg error={error} />
              {msg && <div className="aviso ok">{msg}</div>}
              <div>
                <button className="primario" disabled={!destino} onClick={() => void asignar(destino)}>
                  {esTraspaso ? (p.gestion ? 'Traspasar' : 'Pedir traspaso') : 'Asignar'}
                </button>
              </div>
            </>
          ) : (
            <p className="sec chico">Solo el gerente, la oficina o el ingeniero responsable pueden cambiar el responsable.</p>
          )}
        </section>

        <section className="tarjeta pila">
          <h2>Compartido con</h2>
          <p className="sec chico" style={{ margin: 0 }}>
            Un ingeniero solo ve sus proyectos. Para que otro ingeniero trabaje aquí, agrégalo como colaborador (edita) o seguidor (lee y comenta). El gerente y la oficina ven todos los proyectos.
          </p>
          {miembros.length === 0 ? (
            <span className="sec chico">Nadie más.</span>
          ) : (
            miembros.map((m) => (
              <div key={m.user_id} className="fila-entre">
                <span>
                  {nombreDe(usuarios, m.user_id)} <Pill>{m.rol_en_proyecto}</Pill>
                </span>
                {p.gestion && <button className="chico" onClick={() => void quitarMiembro(m.user_id)}>Quitar</button>}
              </div>
            ))
          )}
          {p.gestion && (
            <div className="fila">
              <select id="m-nuevo" value={nuevoMiembro} onChange={(e) => setNuevoMiembro(e.target.value)} style={{ flex: 2, minWidth: 160 }}>
                <option value="">Agregar persona…</option>
                {candidatos.map((u) => (
                  <option key={u.user_id} value={u.user_id}>{u.nombre}</option>
                ))}
              </select>
              <select id="m-rol" value={rolMiembro} onChange={(e) => setRolMiembro(e.target.value as 'colaborador' | 'seguidor')} style={{ flex: 1, minWidth: 120 }}>
                <option value="colaborador">Colaborador</option>
                <option value="seguidor">Seguidor</option>
              </select>
              <button onClick={() => void agregarMiembro()} disabled={!nuevoMiembro}>Compartir</button>
            </div>
          )}
        </section>
      </div>

      <section className="tarjeta">
        <h2 style={{ marginBottom: 8 }}>Historial de asignaciones</h2>
        {historial.cargando ? (
          <Cargando />
        ) : (historial.datos ?? []).length === 0 ? (
          <Vacio>Todavía no se asignó.</Vacio>
        ) : (
          <ul className="linea">
            {(historial.datos ?? []).map((a) => (
              <li key={a.id}>
                <span className="ico">→</span>
                <div className="min0">
                  <div className="fila-entre">
                    <b>
                      {a.tipo === 'asignacion' ? 'Asignado' : a.tipo === 'traspaso' ? 'Traspaso' : 'Devuelto a la oficina'}
                      {a.a_user_id && ' a ' + nombreDe(usuarios, a.a_user_id)}
                    </b>
                    <Pill tono={a.estado === 'aplicada' ? 'ok' : a.estado === 'pendiente' ? 'alerta' : undefined}>{a.estado}</Pill>
                  </div>
                  <div className="sec chico">
                    {fechaHora(a.created_at)} · pedido por {nombreDe(usuarios, a.solicitado_por)}
                    {a.de_user_id && ' · antes: ' + nombreDe(usuarios, a.de_user_id)}
                  </div>
                  {a.motivo && <p className="chico">Motivo: {a.motivo}</p>}
                  {a.nota_traspaso && <p className="chico">Nota: {a.nota_traspaso}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
