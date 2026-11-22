import { useState } from 'react'
import { supabase, ok } from '../../lib/supabase'
import { leerConCache } from '../../lib/offline'
import { nombreDe, usePermisos, useSesion } from '../../lib/sesion'
import type { Cotizacion, CotizacionItem } from '../../lib/tipos'
import { ESTADOS_COTIZACION } from '../../lib/catalogos'
import { dinero, fecha, hoyISO, sumarDias } from '../../lib/formato'
import { AvisoCache, Campo, Cargando, ErrorMsg, Pill, Selector, Vacio, mensajeError, useCarga } from '../ui'
import { abrirDocumento, subirDocumento } from './Documentos'
import type { PropsPestana } from '../../pages/Proyecto'

interface Articulo {
  codigo: string
  nombre: string
  precio_lpusm: number | null
  linea: string | null
}

const TONO: Record<string, 'ok' | 'alerta' | 'critico' | 'acento' | undefined> = {
  pendiente_aprobacion: 'alerta',
  aprobada: 'acento',
  enviada: 'acento',
  aceptada: 'ok',
  rechazada: 'critico',
}

export default function Cotizaciones({ proyecto, puedeEditar }: PropsPestana) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { datos, error: errCarga, cargando, recargar } = useCarga(
    () =>
      leerConCache('cots:' + proyecto.id, async () =>
        ok(await supabase.from('b2b_cotizaciones').select('*').eq('proyecto_id', proyecto.id).order('numero', { ascending: false })) as Cotizacion[],
      ),
    [proyecto.id],
  )
  const cots = datos?.datos ?? []

  const nueva = async (origen: 'app' | 'profit') => {
    setError(null)
    try {
      const c = ok(
        await supabase
          .from('b2b_cotizaciones')
          .insert({ proyecto_id: proyecto.id, origen, valida_hasta: sumarDias(hoyISO(), 15) })
          .select('id')
          .single(),
      ) as { id: string }
      await recargar()
      setAbierta(c.id)
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  return (
    <div className="pila">
      <div className="fila-entre">
        <div className="curso" style={{ flex: 1, minWidth: 260 }}>
          <span>📘</span>
          <span>
            <b>Curso 06, módulo 5:</b> la oferta va en costo por km o por hora de equipo, en divisas o indexada a la tasa BCV del día de pago. Nunca crédito largo en bolívares sin indexar.{' '}
            <a href="https://academia.distribuidorasarego.com/curso/prospeccion-corporativa#módulo-5-propuesta-de-valor-y-objeciones" target="_blank" rel="noreferrer">Ver la lección</a>
          </span>
        </div>
        {puedeEditar && (
          <div className="fila">
            <button className="primario" onClick={() => void nueva('app')}>+ Cotización en la app</button>
            <button onClick={() => void nueva('profit')}>+ Adjuntar de Profit</button>
          </div>
        )}
      </div>
      <AvisoCache desdeCache={datos?.desdeCache ?? false} />
      <ErrorMsg error={errCarga ?? error} />
      {cargando ? (
        <Cargando />
      ) : cots.length === 0 ? (
        <div className="tarjeta"><Vacio>Sin cotizaciones.</Vacio></div>
      ) : (
        cots.map((c) =>
          abierta === c.id ? (
            <DetalleCotizacion key={c.id} c={c} proyectoId={proyecto.id} puedeEditar={puedeEditar} onCerrar={() => setAbierta(null)} onCambio={recargar} />
          ) : (
            <section key={c.id} className="tarjeta fila-entre">
              <div>
                <b className="mono">COT-{String(c.numero).padStart(5, '0')}</b>{' '}
                <Pill tono={TONO[c.estado]}>{ESTADOS_COTIZACION[c.estado]}</Pill>{' '}
                {c.origen === 'profit' && <Pill>Profit {c.numero_profit ?? ''}</Pill>}
                {c.descuento_pct > 0 && <Pill tono="ambar">Desc. {c.descuento_pct}%</Pill>}
                <div className="sec chico">{fecha(c.created_at)} · válida hasta {fecha(c.valida_hasta)} · {c.plazo_dias ? `${c.plazo_dias} días` : 'contado'}</div>
              </div>
              <div className="fila">
                <b className="num">{dinero(c.total, c.moneda)}</b>
                <button className="chico" onClick={() => setAbierta(c.id)}>Abrir</button>
              </div>
            </section>
          ),
        )
      )}
    </div>
  )
}

function DetalleCotizacion({ c, proyectoId, puedeEditar, onCerrar, onCambio }: {
  c: Cotizacion
  proyectoId: string
  puedeEditar: boolean
  onCerrar: () => void
  onCambio: () => Promise<void>
}) {
  const { usuarios, yo } = useSesion()
  const p = usePermisos()
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [articulos, setArticulos] = useState<Articulo[]>([])
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const items = useCarga(
    async () => ok(await supabase.from('b2b_cotizacion_items').select('*').eq('cotizacion_id', c.id).order('orden')) as CotizacionItem[],
    [c.id, c.total],
  )
  const bloqueada = ['aprobada', 'enviada', 'aceptada', 'rechazada', 'vencida'].includes(c.estado)
  const editable = puedeEditar && !bloqueada
  const tieneDescuento = c.descuento_pct > 0 || (items.datos ?? []).some((i) => i.descuento_pct > 0)

  const actualizar = async (cambios: Partial<Cotizacion>) => {
    setError(null)
    try {
      ok(await supabase.from('b2b_cotizaciones').update(cambios).eq('id', c.id))
      await onCambio()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  const buscar = async (q: string) => {
    setBusqueda(q)
    if (q.trim().length < 3) return setArticulos([])
    const r = await supabase
      .from('articulos_erp')
      .select('codigo, nombre, precio_lpusm, linea')
      .eq('anulado', false)
      .or(`nombre.ilike.%${q.trim()}%,codigo.ilike.%${q.trim()}%`)
      .limit(15)
    setArticulos((r.data as Articulo[]) ?? [])
  }

  const agregar = async (a: Articulo | null) => {
    try {
      ok(
        await supabase.from('b2b_cotizacion_items').insert({
          cotizacion_id: c.id,
          orden: (items.datos?.length ?? 0) + 1,
          articulo_codigo: a?.codigo ?? null,
          descripcion: a?.nombre ?? 'Renglón libre',
          cantidad: 1,
          precio_lista: a?.precio_lpusm ?? 0,
        }),
      )
      setBusqueda('')
      setArticulos([])
      await items.recargar()
      await onCambio()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  const editarItem = async (it: CotizacionItem, cambios: Partial<CotizacionItem>) => {
    try {
      ok(await supabase.from('b2b_cotizacion_items').update(cambios).eq('id', it.id))
      await items.recargar()
      await onCambio()
    } catch (e) {
      setError(mensajeError(e))
    }
  }
  const quitarItem = async (it: CotizacionItem) => {
    try {
      ok(await supabase.from('b2b_cotizacion_items').delete().eq('id', it.id))
      await items.recargar()
      await onCambio()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  const adjuntar = async (f: File | undefined) => {
    if (!f) return
    try {
      const d = await subirDocumento({ proyectoId, archivo: f, categoria: 'cotizacion', descripcion: `COT-${c.numero}` })
      await actualizar({ documento_id: d.id })
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  const abrirPdf = async () => {
    const r = await supabase.from('b2b_documentos').select('storage_path').eq('id', c.documento_id!).single()
    if (r.data) await abrirDocumento(r.data.storage_path)
  }

  return (
    <section className="tarjeta pila">
      <div className="fila-entre">
        <h2>
          COT-{String(c.numero).padStart(5, '0')} <Pill tono={TONO[c.estado]}>{ESTADOS_COTIZACION[c.estado]}</Pill>
        </h2>
        <button className="chico" onClick={onCerrar}>Cerrar</button>
      </div>

      <div className="grid grid-4">
        <Campo etiqueta="Moneda">
          <Selector valor={c.moneda} onCambio={(v) => void actualizar({ moneda: v as Cotizacion['moneda'] })} opciones={{ USD: 'Divisas (US$)', VES_BCV: 'Bs indexado a tasa BCV' }} />
        </Campo>
        <Campo etiqueta="Plazo (días, 0 = contado)">
          <input id="cot-plazo" type="number" disabled={!editable} defaultValue={c.plazo_dias} onBlur={(e) => void actualizar({ plazo_dias: Number(e.target.value) || 0 })} />
        </Campo>
        <Campo etiqueta="Válida hasta">
          <input id="cot-valida" type="date" disabled={!editable} defaultValue={c.valida_hasta ?? ''} onBlur={(e) => void actualizar({ valida_hasta: e.target.value || null })} />
        </Campo>
        <Campo etiqueta="Descuento global (%)">
          <input id="cot-desc" type="number" min={0} max={100} disabled={!editable} defaultValue={c.descuento_pct} onBlur={(e) => void actualizar({ descuento_pct: Number(e.target.value) || 0 })} />
        </Campo>
      </div>

      {c.origen === 'profit' ? (
        <div className="grid grid-3">
          <Campo etiqueta="Número en Profit">
            <input id="cot-nprofit" disabled={!editable} defaultValue={c.numero_profit ?? ''} onBlur={(e) => void actualizar({ numero_profit: e.target.value || null })} />
          </Campo>
          <Campo etiqueta="Monto total">
            <input id="cot-monto" type="number" disabled={!editable} defaultValue={c.subtotal} onBlur={(e) => void actualizar({ subtotal: Number(e.target.value) || 0 })} />
          </Campo>
          <Campo etiqueta="PDF de Profit">
            <input id="cot-pdf" type="file" accept=".pdf,image/*" disabled={!puedeEditar} onChange={(e) => void adjuntar(e.target.files?.[0])} />
          </Campo>
        </div>
      ) : (
        <>
          <div className="tabla-wrap">
            <table>
              <thead><tr><th>Artículo</th><th>Cant.</th><th>Precio lista</th><th>Desc. %</th><th>Precio</th><th>Total</th><th></th></tr></thead>
              <tbody>
                {(items.datos ?? []).map((it) => (
                  <tr key={it.id}>
                    <td className="min0">
                      {editable ? (
                        <input defaultValue={it.descripcion} onBlur={(e) => e.target.value !== it.descripcion && void editarItem(it, { descripcion: e.target.value })} />
                      ) : (
                        it.descripcion
                      )}
                      {it.articulo_codigo && <div className="sec chico mono">{it.articulo_codigo}</div>}
                    </td>
                    <td style={{ width: 90 }}><input type="number" disabled={!editable} defaultValue={it.cantidad} onBlur={(e) => Number(e.target.value) !== it.cantidad && void editarItem(it, { cantidad: Number(e.target.value) })} /></td>
                    <td style={{ width: 120 }}><input type="number" disabled={!editable} defaultValue={it.precio_lista} onBlur={(e) => Number(e.target.value) !== it.precio_lista && void editarItem(it, { precio_lista: Number(e.target.value) })} /></td>
                    <td style={{ width: 90 }}><input type="number" min={0} max={100} disabled={!editable} defaultValue={it.descuento_pct} onBlur={(e) => Number(e.target.value) !== it.descuento_pct && void editarItem(it, { descuento_pct: Number(e.target.value) })} /></td>
                    <td className="num">{dinero(it.precio, c.moneda)}</td>
                    <td className="num">{dinero(it.total, c.moneda)}</td>
                    <td>{editable && <button className="chico" onClick={() => void quitarItem(it)}>✕</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {editable && (
            <div className="pila">
              <div className="fila">
                <input id="cot-buscar" placeholder="Buscar artículo de Profit por nombre o código (3 letras o más)" value={busqueda} onChange={(e) => void buscar(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
                <button className="chico" onClick={() => void agregar(null)}>+ Renglón libre</button>
              </div>
              {articulos.length > 0 && (
                <div className="tarjeta pila" style={{ padding: 8 }}>
                  {articulos.map((a) => (
                    <button key={a.codigo} className="chico" style={{ justifyContent: 'space-between' }} onClick={() => void agregar(a)}>
                      <span><span className="mono">{a.codigo}</span> {a.nombre}</span>
                      <span className="num">{a.precio_lpusm != null ? dinero(a.precio_lpusm) : 'sin precio'}</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="sec chico" style={{ margin: 0 }}>El precio sugerido es la lista de Profit (PRECIO_LPUSM). Ajústalo a la lista B2B.</p>
            </div>
          )}
        </>
      )}

      <Campo etiqueta="Condiciones (costo por km u hora, indexación, despacho…)">
        <textarea id="cot-cond" disabled={!editable} defaultValue={c.condiciones ?? ''} onBlur={(e) => void actualizar({ condiciones: e.target.value || null })} />
      </Campo>

      <div className="fila-entre">
        <div className="chico">
          Subtotal <b className="num">{dinero(c.subtotal, c.moneda)}</b> · Total <b className="num">{dinero(c.total, c.moneda)}</b>
          {c.aprobada_por && <span className="sec"> · aprobada por {nombreDe(usuarios, c.aprobada_por)} el {fecha(c.aprobada_at)}</span>}
          {c.motivo_rechazo && <span className="sec"> · {c.motivo_rechazo}</span>}
        </div>
        {c.documento_id && <button className="chico" onClick={() => void abrirPdf().catch((e) => setError(mensajeError(e)))}>Ver PDF</button>}
      </div>

      {tieneDescuento && !c.aprobada_por && c.estado !== 'rechazada' && (
        <div className="aviso alerta chico">Tiene descuento: antes de enviarla la debe aprobar el gerente B2B.</div>
      )}

      <div className="fila">
        {puedeEditar && c.estado === 'borrador' && tieneDescuento && (
          <button className="primario" onClick={() => void actualizar({ estado: 'pendiente_aprobacion' })}>Pedir aprobación al gerente</button>
        )}
        {puedeEditar && c.estado === 'borrador' && !tieneDescuento && (
          <button className="primario" onClick={() => void actualizar({ estado: 'enviada' })}>Marcar como enviada</button>
        )}
        {p.gerente && c.estado === 'pendiente_aprobacion' && (
          <>
            <button className="primario" onClick={() => void actualizar({ estado: 'aprobada', aprobada_por: yo!.id })}>Aprobar descuento</button>
            <input placeholder="Motivo del rechazo" value={motivoRechazo} onChange={(e) => setMotivoRechazo(e.target.value)} style={{ maxWidth: 260 }} />
            <button className="peligro" onClick={() => void actualizar({ estado: 'borrador', motivo_rechazo: motivoRechazo || 'Descuento no aprobado' })}>Devolver</button>
          </>
        )}
        {puedeEditar && c.estado === 'aprobada' && <button className="primario" onClick={() => void actualizar({ estado: 'enviada' })}>Marcar como enviada</button>}
        {puedeEditar && c.estado === 'enviada' && (
          <>
            <button onClick={() => void actualizar({ estado: 'aceptada' })}>El cliente aceptó</button>
            <button onClick={() => void actualizar({ estado: 'rechazada' })}>El cliente rechazó</button>
          </>
        )}
      </div>
      <ErrorMsg error={error} />
    </section>
  )
}
