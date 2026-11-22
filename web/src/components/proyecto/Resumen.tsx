import { useEffect, useState } from 'react'
import { supabase, ok } from '../../lib/supabase'
import { useSesion } from '../../lib/sesion'
import { CRITERIOS, FUENTES, LINEAS, SEGMENTOS, SUCURSALES } from '../../lib/catalogos'
import { fecha, numero } from '../../lib/formato'
import { Campo, ErrorMsg, Modal, Selector, mensajeError } from '../ui'
import type { PropsPestana } from '../../pages/Proyecto'
import type { Proyecto } from '../../lib/tipos'

const EDITABLES = [
  'razon_social', 'nombre_comercial', 'rif', 'segmento', 'lineas', 'sucursal', 'ciudad', 'direccion',
  'telefono', 'email', 'web', 'fuente', 'fuente_detalle', 'num_vehiculos', 'num_equipos',
  'consumo_litros_anual', 'potencial_usd_anual', 'proveedor_actual', 'marca_actual', 'dolor',
  'crit_consumo', 'crit_divisas', 'crit_dolor', 'crit_zona', 'crit_decisor',
] as const
type Editable = (typeof EDITABLES)[number]

export default function Resumen({ proyecto, puedeEditar, recargarProyecto }: PropsPestana) {
  const { etapas } = useSesion()
  const [f, setF] = useState<Pick<Proyecto, Editable>>(() => tomar(proyecto))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [cambioEtapa, setCambioEtapa] = useState<string | null>(null)

  useEffect(() => setF(tomar(proyecto)), [proyecto])

  const cambiado = EDITABLES.some((k) => JSON.stringify(f[k]) !== JSON.stringify(proyecto[k]))
  const set = <K extends Editable>(k: K, v: Proyecto[K]) => setF((x) => ({ ...x, [k]: v }))
  const puntaje = CRITERIOS.filter((c) => f[c.campo]).length
  const etapa = etapas.find((e) => e.codigo === proyecto.etapa)

  const guardar = async () => {
    setGuardando(true)
    setError(null)
    try {
      const cambios: Record<string, unknown> = {}
      for (const k of EDITABLES) if (JSON.stringify(f[k]) !== JSON.stringify(proyecto[k])) cambios[k] = f[k] === '' ? null : f[k]
      ok(await supabase.from('b2b_proyectos').update(cambios).eq('id', proyecto.id))
      setMsg('Ficha guardada.')
      await recargarProyecto()
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setGuardando(false)
    }
  }

  const txt = (k: Editable, etiquetaCampo: string, tipo = 'text') => (
    <Campo etiqueta={etiquetaCampo}>
      <input
        id={'r-' + k}
        type={tipo}
        disabled={!puedeEditar}
        value={(f[k] as string | number | null) ?? ''}
        onChange={(e) => set(k, (tipo === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value) as never)}
      />
    </Campo>
  )

  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)', alignItems: 'start' }}>
      <div className="pila min0">
        <section className="tarjeta pila">
          <h2>Datos de la empresa</h2>
          <div className="grid grid-2">
            {txt('razon_social', 'Razón social')}
            {txt('nombre_comercial', 'Nombre comercial')}
            {txt('rif', 'RIF')}
            <Campo etiqueta="Segmento">
              <Selector valor={f.segmento} onCambio={(v) => set('segmento', v)} opciones={SEGMENTOS} vacio="—" />
            </Campo>
            <Campo etiqueta="Sucursal">
              <Selector valor={f.sucursal} onCambio={(v) => set('sucursal', v)} opciones={SUCURSALES} vacio="—" />
            </Campo>
            {txt('ciudad', 'Ciudad')}
          </div>
          {txt('direccion', 'Dirección')}
          <div className="grid grid-3">
            {txt('telefono', 'Teléfono')}
            {txt('email', 'Correo', 'email')}
            {txt('web', 'Web')}
            <Campo etiqueta="Fuente">
              <Selector valor={f.fuente} onCambio={(v) => set('fuente', v)} opciones={FUENTES} vacio="—" />
            </Campo>
            {txt('fuente_detalle', 'Detalle de la fuente')}
          </div>
          <div className="fila">
            <span className="sec chico">Líneas:</span>
            {Object.entries(LINEAS).map(([k, v]) => (
              <label key={k} className="check">
                <input
                  type="checkbox"
                  disabled={!puedeEditar}
                  checked={f.lineas.includes(k)}
                  onChange={(e) => set('lineas', e.target.checked ? [...f.lineas, k] : f.lineas.filter((l) => l !== k))}
                />
                {v}
              </label>
            ))}
          </div>
        </section>

        <section className="tarjeta pila">
          <h2>Tamaño y situación actual</h2>
          <div className="grid grid-4">
            {txt('num_vehiculos', 'Vehículos', 'number')}
            {txt('num_equipos', 'Equipos', 'number')}
            {txt('consumo_litros_anual', 'Consumo anual (L)', 'number')}
            {txt('potencial_usd_anual', 'Potencial (US$/año)', 'number')}
          </div>
          <div className="grid grid-2">
            {txt('proveedor_actual', 'Proveedor actual')}
            {txt('marca_actual', 'Marca que usa hoy')}
          </div>
          <Campo etiqueta="Dolor principal (paradas, cauchos que no rinden, aceite dudoso, despachos que fallan…)">
            <textarea id="r-dolor" disabled={!puedeEditar} value={f.dolor ?? ''} onChange={(e) => set('dolor', e.target.value)} />
          </Campo>
        </section>

        <section className="tarjeta pila">
          <div className="fila-entre">
            <h2>Cliente ideal: {puntaje} de 5 criterios</h2>
            <span className={'pill ' + (puntaje >= 4 ? 'ok' : puntaje >= 3 ? 'alerta' : '')}>
              {puntaje >= 4 ? 'Califica' : 'Por debajo de 4'}
            </span>
          </div>
          <p className="sec chico" style={{ margin: 0 }}>
            Curso 06, módulo 2. Es informativo: se puede asignar igual, pero con menos de 4 el curso recomienda no dedicarle el tiempo del ingeniero.
          </p>
          {CRITERIOS.map((c) => (
            <label key={c.campo} className="check">
              <input type="checkbox" disabled={!puedeEditar} checked={f[c.campo]} onChange={(e) => set(c.campo, e.target.checked)} />
              {c.texto}
            </label>
          ))}
        </section>

        {puedeEditar && (
          <div className="fila">
            <button className="primario" disabled={!cambiado || guardando} onClick={() => void guardar()}>
              {guardando ? 'Guardando…' : 'Guardar ficha'}
            </button>
            {cambiado && <span className="sec chico">Hay cambios sin guardar</span>}
            {msg && !cambiado && <span className="sec chico">{msg}</span>}
          </div>
        )}
        <ErrorMsg error={error} />
      </div>

      <aside className="pila">
        <section className="tarjeta pila">
          <h2>Etapa</h2>
          <div className="fila-entre">
            <b>{proyecto.etapa_nombre}</b>
            {puedeEditar && <button className="chico" onClick={() => setCambioEtapa(proyecto.etapa)}>Cambiar</button>}
          </div>
          {etapa?.descripcion && <p style={{ margin: 0 }} className="chico">{etapa.descripcion}</p>}
          {etapa?.curso_url && (
            <div className="curso">
              <span>📘</span>
              <span>
                <b>Cómo hacerlo:</b> {etapa.curso_modulo} del curso.{' '}
                <a href={etapa.curso_url} target="_blank" rel="noreferrer">Abrir la lección</a>
              </span>
            </div>
          )}
          {proyecto.etapa === 'perdido' && (
            <p className="chico" style={{ margin: 0 }}>
              Motivo: <b>{proyecto.motivo_perdida}</b> {proyecto.motivo_perdida_detalle}
            </p>
          )}
        </section>
        <section className="tarjeta pila chico">
          <h2>Seguimiento</h2>
          <div className="fila-entre"><span className="sec">Última gestión</span><b>{fecha(proyecto.ultima_gestion_at)}</b></div>
          <div className="fila-entre"><span className="sec">Próxima gestión</span><b>{fecha(proyecto.proxima_gestion)}</b></div>
          <div className="fila-entre"><span className="sec">Asignado desde</span><b>{fecha(proyecto.asignado_at)}</b></div>
          <div className="fila-entre"><span className="sec">Creado</span><b>{fecha(proyecto.created_at)}</b></div>
          <div className="fila-entre"><span className="sec">Compromisos vencidos</span><b className="num">{numero(proyecto.compromisos_vencidos)}</b></div>
        </section>
      </aside>

      <CambioEtapa abierto={cambioEtapa !== null} proyecto={proyecto} onCerrar={() => setCambioEtapa(null)} onHecho={recargarProyecto} />
    </div>
  )
}

function tomar(p: Proyecto): Pick<Proyecto, Editable> {
  const o = {} as Record<string, unknown>
  for (const k of EDITABLES) o[k] = p[k]
  return o as Pick<Proyecto, Editable>
}

function CambioEtapa({ abierto, proyecto, onCerrar, onHecho }: { abierto: boolean; proyecto: Proyecto; onCerrar: () => void; onHecho: () => Promise<void> }) {
  const { etapas } = useSesion()
  const [etapa, setEtapa] = useState(proyecto.etapa)
  const [motivo, setMotivo] = useState('')
  const [detalle, setDetalle] = useState('')
  const [motivos, setMotivos] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    setEtapa(proyecto.etapa)
    void supabase.from('b2b_motivos_perdida').select('codigo, nombre').eq('activo', true).order('orden').then(({ data }) => {
      setMotivos(Object.fromEntries((data ?? []).map((m) => [m.codigo, m.nombre])))
    })
  }, [abierto, proyecto.etapa])

  const elegida = etapas.find((e) => e.codigo === etapa)
  const sinIngeniero = !proyecto.responsable_id && elegida?.fase === 'ingenieria'

  const guardar = async () => {
    setError(null)
    if (etapa === 'perdido' && !motivo) return setError('Elige el motivo de pérdida.')
    try {
      ok(
        await supabase
          .from('b2b_proyectos')
          .update({
            etapa,
            motivo_perdida: etapa === 'perdido' ? motivo : null,
            motivo_perdida_detalle: etapa === 'perdido' ? detalle || null : null,
          })
          .eq('id', proyecto.id),
      )
      onCerrar()
      await onHecho()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Cambiar etapa"
      onCerrar={onCerrar}
      pie={
        <>
          <button onClick={onCerrar}>Cancelar</button>
          <button className="primario" onClick={() => void guardar()}>Guardar</button>
        </>
      }
    >
      <div className="pila">
        {etapas.map((e) => (
          <label key={e.codigo} className="check">
            <input type="radio" name="etapa" checked={etapa === e.codigo} onChange={() => setEtapa(e.codigo)} />
            <span>
              <b>{e.nombre}</b> <span className="sec chico">({e.fase === 'oficina' ? 'oficina' : e.fase === 'ingenieria' ? 'ingeniero' : 'cierre'})</span>
            </span>
          </label>
        ))}
      </div>
      {sinIngeniero && (
        <div className="aviso alerta">Esta etapa es del ingeniero y el proyecto todavía no tiene uno. Asígnalo en la pestaña "Responsable y equipo".</div>
      )}
      {etapa === 'perdido' && (
        <>
          <Campo etiqueta="Motivo de pérdida *">
            <Selector valor={motivo} onCambio={setMotivo} opciones={motivos} vacio="—" />
          </Campo>
          <Campo etiqueta="Detalle">
            <textarea id="ce-detalle" value={detalle} onChange={(e) => setDetalle(e.target.value)} />
          </Campo>
        </>
      )}
      <ErrorMsg error={error} />
    </Modal>
  )
}
