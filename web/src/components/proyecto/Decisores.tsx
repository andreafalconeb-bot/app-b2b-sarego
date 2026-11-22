import { useState } from 'react'
import { supabase, ok } from '../../lib/supabase'
import { leerConCache } from '../../lib/offline'
import type { Contacto } from '../../lib/tipos'
import { ARGUMENTO_DECISOR, RELACION, ROL_DECISION, etiqueta } from '../../lib/catalogos'
import { AvisoCache, Campo, Cargando, ErrorMsg, Modal, Pill, Selector, Vacio, mensajeError, useCarga } from '../ui'
import type { PropsPestana } from '../../pages/Proyecto'

const ROLES_CLAVE = ['tecnico', 'compras', 'aprobador', 'influenciador'] as const

export default function Decisores({ proyecto, puedeEditar }: PropsPestana) {
  const [editando, setEditando] = useState<Partial<Contacto> | null>(null)
  const { datos, error, cargando, recargar } = useCarga(
    () =>
      leerConCache('contactos:' + proyecto.id, async () =>
        ok(await supabase.from('b2b_contactos').select('*').eq('proyecto_id', proyecto.id).order('nombre')) as Contacto[],
      ),
    [proyecto.id],
  )
  const contactos = datos?.datos ?? []

  return (
    <div className="pila">
      <div className="curso">
        <span>📘</span>
        <span>
          <b>Mapa de decisores (curso 06, módulo 3):</b> se entra por el técnico y se cierra con compras. Si se entra por compras, la conversación queda en precio.{' '}
          <a href="https://academia.distribuidorasarego.com/curso/prospeccion-corporativa#módulo-3-dónde-encontrar-prospectos-y-a-quién-hablarle" target="_blank" rel="noreferrer">
            Ver la lección
          </a>
        </span>
      </div>
      <AvisoCache desdeCache={datos?.desdeCache ?? false} />
      <ErrorMsg error={error} />
      {cargando ? (
        <Cargando />
      ) : (
        <div className="grid grid-2">
          {ROLES_CLAVE.map((rol) => {
            const deEsteRol = contactos.filter((c) => c.rol_decision === rol)
            return (
              <section key={rol} className="tarjeta pila">
                <div className="fila-entre">
                  <h3>{ROL_DECISION[rol]}</h3>
                  {puedeEditar && (
                    <button className="chico" onClick={() => setEditando({ rol_decision: rol, relacion: 'sin_contacto' })}>+ Agregar</button>
                  )}
                </div>
                <p className="sec chico" style={{ margin: 0 }}>{ARGUMENTO_DECISOR[rol]}</p>
                {deEsteRol.length === 0 ? (
                  <div className="aviso alerta chico">Sin identificar todavía.</div>
                ) : (
                  deEsteRol.map((c) => <TarjetaContacto key={c.id} c={c} onEditar={puedeEditar ? () => setEditando(c) : undefined} />)
                )}
              </section>
            )
          })}
          {contactos.some((c) => c.rol_decision === 'otro') && (
            <section className="tarjeta pila">
              <h3>Otros contactos</h3>
              {contactos
                .filter((c) => c.rol_decision === 'otro')
                .map((c) => (
                  <TarjetaContacto key={c.id} c={c} onEditar={puedeEditar ? () => setEditando(c) : undefined} />
                ))}
            </section>
          )}
        </div>
      )}
      {contactos.length === 0 && !cargando && <Vacio>Identifica al menos al técnico antes del primer contacto.</Vacio>}
      <EditarContacto
        contacto={editando}
        proyectoId={proyecto.id}
        onCerrar={() => setEditando(null)}
        onHecho={recargar}
      />
    </div>
  )
}

function TarjetaContacto({ c, onEditar }: { c: Contacto; onEditar?: () => void }) {
  const tono = c.relacion === 'aliado' ? 'ok' : c.relacion === 'opositor' ? 'critico' : c.relacion === 'sin_contacto' ? undefined : 'acento'
  return (
    <div style={{ borderTop: '1px solid var(--borde)', paddingTop: 8 }}>
      <div className="fila-entre">
        <b>{c.nombre}</b>
        <div className="fila">
          <Pill tono={tono}>{etiqueta(RELACION, c.relacion)}</Pill>
          {onEditar && <button className="chico" onClick={onEditar}>Editar</button>}
        </div>
      </div>
      <div className="sec chico">{c.cargo ?? 'Sin cargo'}</div>
      <div className="chico">
        {[c.telefono, c.email].filter(Boolean).join(' · ')}
        {c.linkedin && (
          <>
            {' · '}
            <a href={c.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>
          </>
        )}
      </div>
      {c.notas && <p className="chico" style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{c.notas}</p>}
    </div>
  )
}

function EditarContacto({ contacto, proyectoId, onCerrar, onHecho }: {
  contacto: Partial<Contacto> | null
  proyectoId: string
  onCerrar: () => void
  onHecho: () => Promise<void>
}) {
  const [f, setF] = useState<Partial<Contacto>>({})
  const [error, setError] = useState<string | null>(null)
  const [cargado, setCargado] = useState<Partial<Contacto> | null>(null)
  if (contacto !== cargado) {
    setCargado(contacto)
    setF(contacto ?? {})
    setError(null)
  }
  const set = (k: keyof Contacto, v: string) => setF((x) => ({ ...x, [k]: v }))

  const guardar = async () => {
    if (!f.nombre?.trim()) return setError('Escribe el nombre.')
    const fila = {
      proyecto_id: proyectoId,
      nombre: f.nombre.trim(),
      cargo: f.cargo || null,
      rol_decision: f.rol_decision ?? 'otro',
      relacion: f.relacion ?? 'sin_contacto',
      telefono: f.telefono || null,
      email: f.email || null,
      linkedin: f.linkedin || null,
      notas: f.notas || null,
    }
    try {
      if (f.id) ok(await supabase.from('b2b_contactos').update(fila).eq('id', f.id))
      else ok(await supabase.from('b2b_contactos').insert(fila))
      onCerrar()
      await onHecho()
    } catch (e) {
      setError(mensajeError(e))
    }
  }
  const borrar = async () => {
    if (!f.id) return
    try {
      ok(await supabase.from('b2b_contactos').delete().eq('id', f.id))
      onCerrar()
      await onHecho()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  return (
    <Modal
      abierto={contacto !== null}
      titulo={f.id ? 'Editar contacto' : 'Nuevo contacto'}
      onCerrar={onCerrar}
      pie={
        <>
          {f.id && <button className="peligro" onClick={() => void borrar()}>Borrar</button>}
          <button onClick={onCerrar}>Cancelar</button>
          <button className="primario" onClick={() => void guardar()}>Guardar</button>
        </>
      }
    >
      <div className="grid grid-2">
        <Campo etiqueta="Nombre *"><input id="ct-nombre" value={f.nombre ?? ''} onChange={(e) => set('nombre', e.target.value)} /></Campo>
        <Campo etiqueta="Cargo"><input id="ct-cargo" value={f.cargo ?? ''} onChange={(e) => set('cargo', e.target.value)} /></Campo>
        <Campo etiqueta="Rol en la decisión"><Selector valor={f.rol_decision} onCambio={(v) => set('rol_decision', v)} opciones={ROL_DECISION} /></Campo>
        <Campo etiqueta="Relación"><Selector valor={f.relacion} onCambio={(v) => set('relacion', v)} opciones={RELACION} /></Campo>
        <Campo etiqueta="Teléfono / WhatsApp"><input id="ct-tel" value={f.telefono ?? ''} onChange={(e) => set('telefono', e.target.value)} /></Campo>
        <Campo etiqueta="Correo"><input id="ct-email" type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Campo>
      </div>
      <Campo etiqueta="LinkedIn (enlace)"><input id="ct-li" value={f.linkedin ?? ''} onChange={(e) => set('linkedin', e.target.value)} /></Campo>
      <Campo etiqueta="Notas"><textarea id="ct-notas" value={f.notas ?? ''} onChange={(e) => set('notas', e.target.value)} /></Campo>
      <ErrorMsg error={error} />
    </Modal>
  )
}
