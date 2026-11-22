import { useState } from 'react'
import { supabase, ok } from '../../lib/supabase'
import { ejecutar, leerConCache } from '../../lib/offline'
import type { Equipo, Medicion, Piloto } from '../../lib/tipos'
import { ESTADOS_PILOTO, LINEAS, TIPOS_EQUIPO, TIPOS_MEDICION } from '../../lib/catalogos'
import { fecha, hoyISO, numero } from '../../lib/formato'
import { AvisoCache, Campo, Cargando, ErrorMsg, Modal, Pill, Selector, Vacio, mensajeError, useCarga } from '../ui'
import type { PropsPestana } from '../../pages/Proyecto'

export default function Pilotos({ proyecto, puedeEditar }: PropsPestana) {
  const [editando, setEditando] = useState<Partial<Piloto> | null>(null)
  const { datos, error, cargando, recargar } = useCarga(
    () =>
      leerConCache('pilotos:' + proyecto.id, async () => {
        const [p, m, e] = await Promise.all([
          supabase.from('b2b_pilotos').select('*').eq('proyecto_id', proyecto.id).order('created_at', { ascending: false }),
          supabase.from('b2b_mediciones').select('*').eq('proyecto_id', proyecto.id).order('fecha'),
          supabase.from('b2b_equipos').select('*').eq('proyecto_id', proyecto.id).order('codigo_cliente'),
        ])
        return { pilotos: ok(p) as Piloto[], mediciones: ok(m) as Medicion[], equipos: ok(e) as Equipo[] }
      }),
    [proyecto.id],
  )
  const pilotos = datos?.datos.pilotos ?? []
  const mediciones = datos?.datos.mediciones ?? []
  const equipos = datos?.datos.equipos ?? []

  return (
    <div className="pila">
      <div className="fila-entre">
        <div className="curso" style={{ flex: 1, minWidth: 260 }}>
          <span>📘</span>
          <span>
            <b>Curso 06, módulo 4 · paso 5:</b> prueba acotada (5 camiones, 1 línea o 1 sede) de 60 a 90 días, con la medición acordada desde el inicio: km por caucho, intervalo de cambio, resultado del análisis de aceite.
          </span>
        </div>
        {puedeEditar && <button className="primario" onClick={() => setEditando({ linea: 'lubricantes', estado: 'planificado', fecha_inicio: hoyISO() })}>+ Piloto</button>}
      </div>
      <AvisoCache desdeCache={datos?.desdeCache ?? false} />
      <ErrorMsg error={error} />
      {cargando ? (
        <Cargando />
      ) : (
        <>
          {pilotos.length === 0 && <div className="tarjeta"><Vacio>Sin pilotos todavía.</Vacio></div>}
          {pilotos.map((pl) => (
            <section key={pl.id} className="tarjeta pila">
              <div className="fila-entre">
                <div>
                  <h3>{pl.alcance}</h3>
                  <div className="sec chico">
                    {LINEAS[pl.linea]} · {fecha(pl.fecha_inicio)} → {fecha(pl.fecha_fin)}
                  </div>
                </div>
                <div className="fila">
                  <Pill tono={pl.estado === 'exitoso' ? 'ok' : pl.estado === 'no_exitoso' ? 'critico' : pl.estado === 'en_curso' ? 'acento' : undefined}>{ESTADOS_PILOTO[pl.estado]}</Pill>
                  {puedeEditar && <button className="chico" onClick={() => setEditando(pl)}>Editar</button>}
                </div>
              </div>
              <div className="chico"><b>Medición acordada:</b> {pl.metrica_acordada}</div>
              {pl.linea_base && <div className="chico"><b>Línea base:</b> {pl.linea_base}</div>}
              {pl.resultado && <div className="chico"><b>Resultado:</b> {pl.resultado}</div>}
              <Mediciones
                proyectoId={proyecto.id}
                pilotoId={pl.id}
                mediciones={mediciones.filter((m) => m.piloto_id === pl.id)}
                equipos={equipos}
                puedeEditar={puedeEditar}
                onHecho={recargar}
              />
            </section>
          ))}
          <section className="tarjeta pila">
            <h3>Mediciones de diagnóstico (fuera de un piloto)</h3>
            <p className="sec chico" style={{ margin: 0 }}>Profundidad de banda y presión de cauchos en la visita de diagnóstico, horómetros, consumos…</p>
            <Mediciones
              proyectoId={proyecto.id}
              pilotoId={null}
              mediciones={mediciones.filter((m) => !m.piloto_id)}
              equipos={equipos}
              puedeEditar={puedeEditar}
              onHecho={recargar}
            />
          </section>
        </>
      )}
      <EditarPiloto piloto={editando} proyectoId={proyecto.id} onCerrar={() => setEditando(null)} onHecho={recargar} />
    </div>
  )
}

function Mediciones({ proyectoId, pilotoId, mediciones, equipos, puedeEditar, onHecho }: {
  proyectoId: string
  pilotoId: string | null
  mediciones: Medicion[]
  equipos: Equipo[]
  puedeEditar: boolean
  onHecho: () => Promise<void>
}) {
  const [f, setF] = useState({ equipo_id: '', tipo: 'profundidad_banda', posicion: '', valor: '', fecha: hoyISO(), notas: '' })
  const [error, setError] = useState<string | null>(null)
  const nombreEquipo = (id: string | null) => {
    const e = equipos.find((x) => x.id === id)
    return e ? [e.codigo_cliente, TIPOS_EQUIPO[e.tipo], e.marca].filter(Boolean).join(' · ') : '—'
  }

  // Primera vs última lectura de cada serie (equipo + tipo + posición)
  const series = new Map<string, Medicion[]>()
  for (const m of mediciones) {
    const k = `${m.equipo_id}|${m.tipo}|${m.posicion ?? ''}`
    series.set(k, [...(series.get(k) ?? []), m])
  }

  const agregar = async () => {
    setError(null)
    if (f.valor === '') return setError('Escribe el valor.')
    try {
      const r = await ejecutar(
        {
          tipo: 'insert',
          tabla: 'b2b_mediciones',
          fila: {
            id: crypto.randomUUID(),
            proyecto_id: proyectoId,
            piloto_id: pilotoId,
            equipo_id: f.equipo_id || null,
            fecha: f.fecha,
            tipo: f.tipo,
            posicion: f.posicion || null,
            valor: Number(f.valor),
            notas: f.notas || null,
          },
        },
        'Medición',
      )
      setF((x) => ({ ...x, valor: '', notas: '' }))
      if (!r.encolada) await onHecho()
      else setError('Sin señal: la medición se enviará sola.')
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  return (
    <div className="pila">
      {series.size > 0 && (
        <div className="tabla-wrap">
          <table>
            <thead><tr><th>Equipo</th><th>Medición</th><th>Posición</th><th>Primera</th><th>Última</th><th>Cambio</th><th>Lecturas</th></tr></thead>
            <tbody>
              {[...series.values()].map((s) => {
                const a = s[0]
                const z = s[s.length - 1]
                return (
                  <tr key={a.id}>
                    <td className="chico">{nombreEquipo(a.equipo_id)}</td>
                    <td className="chico">{TIPOS_MEDICION[a.tipo]}</td>
                    <td className="chico">{a.posicion ?? '—'}</td>
                    <td className="num">{numero(a.valor, 2)} <span className="sec chico">{fecha(a.fecha)}</span></td>
                    <td className="num">{numero(z.valor, 2)} <span className="sec chico">{fecha(z.fecha)}</span></td>
                    <td className="num">{s.length > 1 ? (z.valor - a.valor > 0 ? '+' : '') + numero(z.valor - a.valor, 2) : '—'}</td>
                    <td className="num">{s.length}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {puedeEditar && (
        <div className="grid grid-4">
          <Campo etiqueta="Equipo"><Selector valor={f.equipo_id} onCambio={(v) => setF({ ...f, equipo_id: v })} opciones={Object.fromEntries(equipos.map((e) => [e.id, nombreEquipo(e.id)]))} vacio="—" /></Campo>
          <Campo etiqueta="Medición"><Selector valor={f.tipo} onCambio={(v) => setF({ ...f, tipo: v })} opciones={TIPOS_MEDICION} /></Campo>
          <Campo etiqueta="Posición (caucho o componente)"><input value={f.posicion} placeholder="DI, DD, TIE…" onChange={(e) => setF({ ...f, posicion: e.target.value })} /></Campo>
          <Campo etiqueta="Valor"><input type="number" step="any" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></Campo>
          <Campo etiqueta="Fecha"><input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></Campo>
          <Campo etiqueta="Nota"><input value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} /></Campo>
          <div className="pila" style={{ justifyContent: 'flex-end' }}><button onClick={() => void agregar()}>+ Agregar medición</button></div>
        </div>
      )}
      <ErrorMsg error={error} />
    </div>
  )
}

function EditarPiloto({ piloto, proyectoId, onCerrar, onHecho }: { piloto: Partial<Piloto> | null; proyectoId: string; onCerrar: () => void; onHecho: () => Promise<void> }) {
  const [f, setF] = useState<Partial<Piloto>>({})
  const [cargado, setCargado] = useState<Partial<Piloto> | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (piloto !== cargado) {
    setCargado(piloto)
    setF(piloto ?? {})
    setError(null)
  }
  const set = (k: keyof Piloto, v: string) => setF((x) => ({ ...x, [k]: v }))
  const guardar = async () => {
    if (!f.alcance?.trim() || !f.metrica_acordada?.trim()) return setError('El alcance y la medición acordada son obligatorios.')
    const fila = {
      proyecto_id: proyectoId,
      linea: f.linea ?? 'lubricantes',
      alcance: f.alcance.trim(),
      metrica_acordada: f.metrica_acordada.trim(),
      linea_base: f.linea_base || null,
      fecha_inicio: f.fecha_inicio || null,
      fecha_fin: f.fecha_fin || null,
      estado: f.estado ?? 'planificado',
      resultado: f.resultado || null,
    }
    try {
      if (f.id) ok(await supabase.from('b2b_pilotos').update(fila).eq('id', f.id))
      else ok(await supabase.from('b2b_pilotos').insert(fila))
      onCerrar()
      await onHecho()
    } catch (e) {
      setError(mensajeError(e))
    }
  }
  return (
    <Modal abierto={piloto !== null} titulo={f.id ? 'Editar piloto' : 'Nuevo piloto'} onCerrar={onCerrar} pie={<><button onClick={onCerrar}>Cancelar</button><button className="primario" onClick={() => void guardar()}>Guardar</button></>}>
      <div className="grid grid-2">
        <Campo etiqueta="Línea"><Selector valor={f.linea} onCambio={(v) => set('linea', v)} opciones={LINEAS} /></Campo>
        <Campo etiqueta="Estado"><Selector valor={f.estado} onCambio={(v) => set('estado', v)} opciones={ESTADOS_PILOTO} /></Campo>
        <Campo etiqueta="Inicio"><input type="date" value={f.fecha_inicio ?? ''} onChange={(e) => set('fecha_inicio', e.target.value)} /></Campo>
        <Campo etiqueta="Fin (60 a 90 días)"><input type="date" value={f.fecha_fin ?? ''} onChange={(e) => set('fecha_fin', e.target.value)} /></Campo>
      </div>
      <Campo etiqueta="Alcance *"><input value={f.alcance ?? ''} placeholder="5 camiones Mack de la sede Guacara" onChange={(e) => set('alcance', e.target.value)} /></Campo>
      <Campo etiqueta="Medición acordada con el cliente *"><textarea value={f.metrica_acordada ?? ''} placeholder="Intervalo de cambio de 15.000 a 25.000 km con análisis cada 5.000 km" onChange={(e) => set('metrica_acordada', e.target.value)} /></Campo>
      <Campo etiqueta="Línea base (cómo está hoy)"><textarea value={f.linea_base ?? ''} onChange={(e) => set('linea_base', e.target.value)} /></Campo>
      <Campo etiqueta="Resultado"><textarea value={f.resultado ?? ''} onChange={(e) => set('resultado', e.target.value)} /></Campo>
      <ErrorMsg error={error} />
    </Modal>
  )
}

