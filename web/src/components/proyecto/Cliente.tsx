import { useEffect, useState } from 'react'
import { supabase, ok } from '../../lib/supabase'
import { usePermisos } from '../../lib/sesion'
import { dinero, fecha, fechaHora, numero } from '../../lib/formato'
import type { Proyecto } from '../../lib/tipos'
import type { PropsPestana } from '../../pages/Proyecto'
import { Campo, Cargando, ErrorMsg, Modal, Pill, Vacio, mensajeError, useCarga } from '../ui'

// Clientes activos (Andrea, 25/nov/2026): la app también da seguimiento a
// los clientes. Se ACTIVA con el código del ERP; desde ahí la base programa
// la agenda de contacto (cada 30 días y revisión cada 90) y crea su
// empresa en Flota SAREGO, la use o no el cliente (migración 0141).
const URL_FLOTA = 'https://flota.distribuidorasarego.com'

interface CandidatoErp {
  cliente_erp_id: string
  codigo: string
  nombre: string
  rif: string | null
  ciudad: string | null
  direccion: string | null
  inactivo: boolean
  vendedor: string | null
  similitud: number
  ligado_a: string | null
}

interface ResumenErp {
  codigo: string
  nombre: string
  rif: string | null
  direccion: string | null
  ciudad: string | null
  telefono: string | null
  email: string | null
  inactivo: boolean
  vendedor_erp: { codigo: string; nombre: string; telefono: string | null } | null
  asesor_retail: { nombre: string | null; frecuencia_visita_dias: number | null } | null
  compras: { ultima: string | null; monto_90d: number; monto_12m: number; por_mes: { mes: string; monto: number }[] } | null
  cartera: { documentos: number; saldo: number; vencido: number; por_vencer: number; max_dias_mora: number } | null
  ultimo_cobro: { fecha: string; monto: number; moneda: string | null } | null
  flota: {
    empresa_id: string
    plan: string
    activa: boolean
    ultima_sincronizacion_at: string | null
    usuarios_cliente: number
    activos: number
  } | null
}

/** Busca la coincidencia en el ERP y activa la cuenta como cliente. */
export function ActivarCliente({ proyecto, abierto, onCerrar, onListo }: {
  proyecto: Proyecto
  abierto: boolean
  onCerrar: () => void
  onListo: () => void
}) {
  const sugerido = proyecto.codigo_erp ?? proyecto.semilla?.cliente_erp?.codigo ?? ''
  const [texto, setTexto] = useState('')
  const [candidatos, setCandidatos] = useState<CandidatoErp[]>([])
  const [buscando, setBuscando] = useState(false)
  const [elegido, setElegido] = useState<CandidatoErp | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const buscar = async (t: string) => {
    setError(null)
    if (t.trim().length < 3) return setCandidatos([])
    setBuscando(true)
    try {
      const r = ok(await supabase.rpc('b2b_buscar_cliente_erp', { p_texto: t.trim() })) as CandidatoErp[] | null
      setCandidatos(r ?? [])
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setBuscando(false)
    }
  }

  // Al abrir: busca por el código que ya trae (semilla) o por el nombre
  useEffect(() => {
    if (!abierto) return
    const inicial = sugerido || proyecto.rif || proyecto.nombre_comercial || proyecto.razon_social
    setTexto(inicial)
    setElegido(null)
    setAviso(null)
    void buscar(inicial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  const activar = async () => {
    if (!elegido) return
    setGuardando(true)
    setError(null)
    try {
      const r = ok(await supabase.rpc('b2b_activar_cliente', { p_proyecto: proyecto.id, p_codigo: elegido.codigo })) as {
        flota_error: string | null
      }
      if (r?.flota_error) {
        setAviso('El cliente quedó activo, pero no se pudo crear su empresa en Flota: ' + r.flota_error + ' Puedes repetirlo desde Equipos y muestras.')
      } else {
        onListo()
      }
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Activar como cliente"
      onCerrar={onCerrar}
      pie={
        aviso ? (
          <button className="primario" onClick={onListo}>Entendido</button>
        ) : (
          <>
            <button onClick={onCerrar}>Cancelar</button>
            <button className="primario" disabled={!elegido || guardando || !!elegido.ligado_a} onClick={() => void activar()}>
              {guardando ? 'Activando…' : elegido ? `Activar con ${elegido.codigo}` : 'Elige el cliente del ERP'}
            </button>
          </>
        )
      }
    >
      {aviso ? (
        <div className="aviso alerta">{aviso}</div>
      ) : (
        <>
          <p className="chico" style={{ margin: 0 }}>
            Busca el cliente en el ERP (Profit) por su <b>código</b>, su <b>RIF</b> o su <b>nombre</b> y elige la coincidencia. Al activarlo:
          </p>
          <ul className="chico" style={{ margin: '0 0 0 18px', padding: 0 }}>
            <li>la cuenta pasa a <b>Cuenta ganada</b> y queda ligada a su ficha del ERP (compras, cartera y cobros);</li>
            <li>se programa la agenda: un contacto cada 30 días y una revisión de resultados cada 90;</li>
            <li>se crea su empresa en <b>Flota SAREGO</b> con sus equipos y análisis, la use o no el cliente.</li>
          </ul>
          <Campo etiqueta="Código, RIF o nombre en el ERP">
            <input
              id="act-buscar"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void buscar(texto)}
              onBlur={() => void buscar(texto)}
              placeholder="507450392, J-12345678-9 o nombre"
            />
          </Campo>
          {buscando ? (
            <Cargando />
          ) : candidatos.length === 0 ? (
            <Vacio>{texto.trim().length < 3 ? 'Escribe al menos 3 letras.' : 'No hay coincidencias en el ERP. Revisa el código en Profit.'}</Vacio>
          ) : (
            <div className="tabla-wrap">
              <table>
                <thead><tr><th></th><th>Código</th><th>Cliente en el ERP</th><th>Vendedor</th><th>Coincide</th></tr></thead>
                <tbody>
                  {candidatos.map((c) => (
                    <tr key={c.cliente_erp_id} className="clic" onClick={() => setElegido(c)}>
                      <td><input type="radio" name="erp" checked={elegido?.cliente_erp_id === c.cliente_erp_id} onChange={() => setElegido(c)} aria-label={'Elegir ' + c.nombre} /></td>
                      <td className="mono">{c.codigo}</td>
                      <td>
                        <b>{c.nombre}</b>
                        <div className="sec chico">{[c.rif, c.ciudad, c.direccion].filter(Boolean).join(' · ') || '—'}</div>
                        <div className="fila">
                          {c.inactivo && <Pill tono="alerta">Inactivo en el ERP</Pill>}
                          {c.ligado_a && <Pill tono="critico">Ya activo en {c.ligado_a}</Pill>}
                        </div>
                      </td>
                      <td className="chico">{c.vendedor ?? '—'}</td>
                      <td className="num">{Math.round(c.similitud * 100)} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {elegido?.ligado_a && <div className="aviso alerta">Ese cliente ya está activo en {elegido.ligado_a}. Trabaja en esa cuenta.</div>}
        </>
      )}
      <ErrorMsg error={error} />
    </Modal>
  )
}

/** Pestaña "Cliente": ERP en solo lectura, agenda y Flota. */
export default function ClientePestana({ proyecto, puedeEditar, recargarProyecto }: PropsPestana) {
  const p = usePermisos()
  const [activar, setActivar] = useState(false)
  const [quitar, setQuitar] = useState(false)

  const { datos, error, cargando } = useCarga(async () => {
    if (!proyecto.cliente_activo_at) return null
    return ok(await supabase.rpc('b2b_cliente_erp_resumen', { p_proyecto: proyecto.id })) as ResumenErp | null
  }, [proyecto.id, proyecto.cliente_activo_at])

  if (!proyecto.cliente_activo_at) {
    return (
      <div className="tarjeta">
        <h2>Todavía no es cliente activo</h2>
        <p className="sec">
          Cuando compre (o si ya compra en Profit), actívalo con su código del ERP para darle seguimiento como cliente: agenda de contacto automática, compras, cartera y su empresa en Flota SAREGO.
        </p>
        {puedeEditar && <button className="primario" onClick={() => setActivar(true)}>Activar como cliente</button>}
        <ActivarCliente proyecto={proyecto} abierto={activar} onCerrar={() => setActivar(false)} onListo={() => { setActivar(false); void recargarProyecto() }} />
      </div>
    )
  }

  const r = datos
  return (
    <div className="pila">
      <div className="grid grid-2">
        <div className="tarjeta">
          <div className="fila-entre">
            <h2>Ficha en el ERP</h2>
            {r?.inactivo && <Pill tono="alerta">Inactivo en el ERP</Pill>}
          </div>
          {cargando ? <Cargando /> : error ? <ErrorMsg error={error} /> : !r ? <Vacio>No se encontró la ficha del ERP.</Vacio> : (
            <dl className="datos">
              <dt>Código</dt><dd className="mono">{r.codigo}</dd>
              <dt>Nombre</dt><dd>{r.nombre}</dd>
              <dt>RIF</dt><dd>{r.rif ?? '—'}</dd>
              <dt>Dirección</dt><dd>{[r.direccion, r.ciudad].filter(Boolean).join(', ') || '—'}</dd>
              <dt>Teléfono</dt><dd>{r.telefono ?? '—'}</dd>
              <dt>Vendedor en el ERP</dt><dd>{r.vendedor_erp ? `${r.vendedor_erp.nombre} (${r.vendedor_erp.codigo})` : '—'}</dd>
              <dt>Asesor de la app retail</dt>
              <dd>
                {r.asesor_retail?.nombre ?? '—'}
                {r.asesor_retail?.frecuencia_visita_dias ? <span className="sec chico"> · visita cada {r.asesor_retail.frecuencia_visita_dias} días</span> : null}
              </dd>
              <dt>Activo desde</dt><dd>{fecha(proyecto.cliente_activo_at)}</dd>
            </dl>
          )}
          <p className="sec chico" style={{ marginBottom: 0 }}>
            El vendedor retail sigue con sus visitas y pedidos; aquí se llevan los proyectos, equipos, muestras y cotizaciones.
          </p>
        </div>

        <Agenda proyecto={proyecto} puedeEditar={puedeEditar} recargarProyecto={recargarProyecto} />
      </div>

      {r && (
        <div className="grid grid-2">
          <div className="tarjeta">
            <h2>Compras</h2>
            <div className="grid grid-3">
              <Dato t="Últimos 90 días" v={dinero(r.compras?.monto_90d ?? 0)} />
              <Dato t="Últimos 12 meses" v={dinero(r.compras?.monto_12m ?? 0)} />
              <Dato t="Última compra" v={fecha(r.compras?.ultima)} />
            </div>
            <BarrasMes datos={r.compras?.por_mes ?? []} />
          </div>
          <div className="tarjeta">
            <h2>Cartera y cobros</h2>
            <div className="grid grid-3">
              <Dato t="Saldo" v={dinero(r.cartera?.saldo ?? 0)} />
              <Dato t="Vencido" v={dinero(r.cartera?.vencido ?? 0)} alerta={(r.cartera?.vencido ?? 0) > 0} />
              <Dato t="Mora máxima" v={(r.cartera?.max_dias_mora ?? 0) + ' días'} alerta={(r.cartera?.max_dias_mora ?? 0) > 0} />
            </div>
            <p className="chico sec" style={{ marginBottom: 0 }}>
              {numero(r.cartera?.documentos ?? 0)} documento(s) con saldo · último cobro: {r.ultimo_cobro ? `${fecha(r.ultimo_cobro.fecha)}, ${dinero(r.ultimo_cobro.monto)}` : '—'}
            </p>
          </div>
        </div>
      )}

      {r && (
        <div className="tarjeta">
          <div className="fila-entre">
            <h2>Flota SAREGO</h2>
            {r.flota && <a href={URL_FLOTA} target="_blank" rel="noreferrer">Abrir Flota SAREGO ↗</a>}
          </div>
          {!r.flota ? (
            <p className="sec">Todavía no tiene empresa en Flota. Créala desde <b>Equipos y muestras → Llevar a Flota</b>.</p>
          ) : (
            <>
              <div className="grid grid-3">
                <Dato t="Activos en Flota" v={numero(r.flota.activos)} />
                <Dato t="Usuarios del cliente" v={r.flota.usuarios_cliente ? numero(r.flota.usuarios_cliente) : 'No la usa todavía'} />
                <Dato t="Última sincronización" v={r.flota.ultima_sincronizacion_at ? fechaHora(r.flota.ultima_sincronizacion_at) : '—'} />
              </div>
              <p className="chico sec" style={{ marginBottom: 0 }}>
                {r.flota.usuarios_cliente
                  ? 'El cliente usa Flota: lo que cargue (lecturas, fallas, cambios de aceite) lo ves en su empresa.'
                  : 'El cliente puede no usarla: SAREGO la alimenta con sus equipos y análisis de aceite. Invítalo desde Flota cuando quiera usarla.'}
              </p>
            </>
          )}
        </div>
      )}

      {p.gestion && (
        <div className="fila" style={{ justifyContent: 'flex-end' }}>
          <button className="chico" onClick={() => setQuitar(true)}>Quitar activación</button>
        </div>
      )}
      <QuitarActivacion proyecto={proyecto} abierto={quitar} onCerrar={() => setQuitar(false)} onListo={() => { setQuitar(false); void recargarProyecto() }} />
    </div>
  )
}

function Dato({ t, v, alerta }: { t: string; v: string; alerta?: boolean }) {
  return (
    <div>
      <div className="sec chico">{t}</div>
      <div style={{ fontWeight: 600, color: alerta ? 'var(--critico)' : undefined }}>{v}</div>
    </div>
  )
}

function BarrasMes({ datos }: { datos: { mes: string; monto: number }[] }) {
  if (!datos.length) return <p className="sec chico">Sin compras en los últimos 12 meses.</p>
  const max = Math.max(...datos.map((d) => d.monto), 1)
  return (
    <div className="fila" style={{ alignItems: 'flex-end', gap: 4, height: 90, marginTop: 12 }} aria-label="Compras por mes">
      {datos.map((d) => (
        <div key={d.mes} title={`${d.mes}: ${dinero(d.monto)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{ width: '100%', background: 'var(--acento)', borderRadius: 3, height: Math.max(2, (d.monto / max) * 70) }} />
          <span className="sec" style={{ fontSize: '.65rem' }}>{d.mes.slice(5)}</span>
        </div>
      ))}
    </div>
  )
}

function Agenda({ proyecto, puedeEditar, recargarProyecto }: PropsPestana) {
  const [dc, setDc] = useState(String(proyecto.dias_contacto))
  const [dr, setDr] = useState(String(proyecto.dias_revision))
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const cambio = Number(dc) !== proyecto.dias_contacto || Number(dr) !== proyecto.dias_revision
  const hoy = new Date().toISOString().slice(0, 10)

  const guardar = async () => {
    const c = Number(dc)
    const v = Number(dr)
    if (!(c >= 7 && c <= 180)) return setError('El contacto va cada 7 a 180 días.')
    if (!(v >= 30 && v <= 365)) return setError('La revisión va cada 30 a 365 días.')
    setGuardando(true)
    setError(null)
    try {
      ok(await supabase.from('b2b_proyectos').update({ dias_contacto: c, dias_revision: v }).eq('id', proyecto.id))
      await recargarProyecto()
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setGuardando(false)
    }
  }

  const proxima = (f: string | null) =>
    !f ? '—' : f < hoy ? <span style={{ color: 'var(--critico)', fontWeight: 600 }}>{fecha(f)} (vencido)</span> : fecha(f)

  return (
    <div className="tarjeta">
      <h2>Agenda de contacto</h2>
      <p className="sec chico">
        Automática: queda como compromiso del responsable. Cada gestión que registras corre el próximo contacto; al cumplir uno, sale el siguiente.
      </p>
      <dl className="datos">
        <dt>Próximo contacto</dt><dd>{proxima(proyecto.proximo_contacto)}</dd>
        <dt>Próxima revisión de resultados</dt><dd>{proxima(proyecto.proxima_revision)}</dd>
      </dl>
      <div className="grid grid-2">
        <Campo etiqueta="Contacto cada (días)">
          <input id="ag-contacto" type="number" min={7} max={180} value={dc} disabled={!puedeEditar} onChange={(e) => setDc(e.target.value)} />
        </Campo>
        <Campo etiqueta="Revisión cada (días)">
          <input id="ag-revision" type="number" min={30} max={365} value={dr} disabled={!puedeEditar} onChange={(e) => setDr(e.target.value)} />
        </Campo>
      </div>
      {puedeEditar && cambio && (
        <button className="primario chico" disabled={guardando} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar frecuencia'}</button>
      )}
      <ErrorMsg error={error} />
    </div>
  )
}

function QuitarActivacion({ proyecto, abierto, onCerrar, onListo }: { proyecto: Proyecto; abierto: boolean; onCerrar: () => void; onListo: () => void }) {
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const quitar = async () => {
    setError(null)
    try {
      ok(await supabase.rpc('b2b_desactivar_cliente', { p_proyecto: proyecto.id, p_motivo: motivo }))
      setMotivo('')
      onListo()
    } catch (e) {
      setError(mensajeError(e))
    }
  }
  return (
    <Modal
      abierto={abierto}
      titulo="Quitar activación"
      onCerrar={onCerrar}
      pie={<><button onClick={onCerrar}>Cancelar</button><button className="primario" disabled={motivo.trim().length < 5} onClick={() => void quitar()}>Quitar</button></>}
    >
      <p className="chico" style={{ margin: 0 }}>Para corregir una activación equivocada. Se cancela la agenda; la cuenta y su empresa en Flota no se borran.</p>
      <Campo etiqueta="Motivo *"><input id="qa-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Código equivocado, no era cliente…" /></Campo>
      <ErrorMsg error={error} />
    </Modal>
  )
}
