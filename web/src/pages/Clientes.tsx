import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, ok } from '../lib/supabase'
import { leerConCache } from '../lib/offline'
import { usePermisos, useSesion } from '../lib/sesion'
import type { Proyecto } from '../lib/tipos'
import { SEGMENTOS, etiqueta } from '../lib/catalogos'
import { fecha, hoyISO, sumarDias } from '../lib/formato'
import { ordenZona, zonaDe } from '../lib/zonas'
import { AvisoCache, Cargando, Campo, ErrorMsg, Pill, Selector, Vacio, useCarga } from '../components/ui'

// Clientes activos (Andrea, 25/nov/2026): seguimiento de los que ya
// compran. Sin visitas de ruta (eso es la app retail): ventas por
// proyecto, con agenda de contacto automática (migración 0141).
export default function Clientes() {
  const { usuarios } = useSesion()
  const p = usePermisos()
  const nav = useNavigate()
  const [texto, setTexto] = useState('')
  const [responsable, setResponsable] = useState('')
  const [zona, setZona] = useState('')
  const [agenda, setAgenda] = useState('')

  const { datos, error, cargando } = useCarga(
    () =>
      leerConCache('clientes', async () =>
        ok(
          await supabase
            .from('b2b_proyectos_resumen')
            .select('*')
            .not('cliente_activo_at', 'is', null)
            .order('proximo_contacto', { ascending: true, nullsFirst: false }),
        ) as Proyecto[],
      ),
    [],
  )
  const clientes = datos?.datos ?? []
  const hoy = hoyISO()
  const enSemana = sumarDias(hoy, 7)
  const zonaPorId = useMemo(() => new Map(clientes.map((x) => [x.id, zonaDe(x.lat, x.lng)])), [clientes])
  const zonas = useMemo(() => [...new Set(zonaPorId.values())].sort((a, b) => ordenZona(a) - ordenZona(b)), [zonaPorId])

  const proximo = (x: Proyecto) => [x.proximo_contacto, x.proxima_revision].filter(Boolean).sort()[0] ?? null

  const filtrados = clientes.filter((x) => {
    const t = texto.trim().toLowerCase()
    if (t && !`${x.razon_social} ${x.nombre_comercial ?? ''} ${x.rif ?? ''} ${x.codigo} ${x.codigo_erp ?? ''}`.toLowerCase().includes(t)) return false
    if (responsable === 'sin' ? !!x.responsable_id : responsable && x.responsable_id !== responsable) return false
    if (zona && zonaPorId.get(x.id) !== zona) return false
    const pr = proximo(x)
    if (agenda === 'vencidos' && !(pr && pr < hoy)) return false
    if (agenda === 'semana' && !(pr && pr <= enSemana)) return false
    return true
  })

  const vencidos = clientes.filter((x) => (proximo(x) ?? '9999') < hoy).length
  const semana = clientes.filter((x) => (proximo(x) ?? '9999') <= enSemana).length
  const ingenieros = usuarios.filter((u) => u.rol === 'ingeniero')

  const celdaFecha = (f: string | null) =>
    !f ? <span className="sec">—</span> : f < hoy ? <Pill tono="critico">{fecha(f)}</Pill> : f <= enSemana ? <Pill tono="alerta">{fecha(f)}</Pill> : fecha(f)

  return (
    <>
      <div className="titulo-pagina">
        <div>
          <h1>Clientes activos</h1>
          <div className="sec chico">
            {clientes.length} cliente(s) · {vencidos} con contacto vencido · {semana} para esta semana
            {!p.leeTodo && ' · ves tus clientes y los que te compartieron'}
          </div>
        </div>
      </div>

      <div className="tarjeta" style={{ marginBottom: 12 }}>
        <div className="grid grid-4">
          <Campo etiqueta="Buscar">
            <input id="cl-buscar" placeholder="Nombre, RIF, código ERP o P-0001" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </Campo>
          {p.leeTodo && (
            <Campo etiqueta="Responsable">
              <select id="cl-resp" value={responsable} onChange={(e) => setResponsable(e.target.value)}>
                <option value="">Todos</option>
                <option value="sin">Sin asignar</option>
                {ingenieros.map((u) => <option key={u.user_id} value={u.user_id}>{u.nombre}</option>)}
              </select>
            </Campo>
          )}
          <Campo etiqueta="Zona">
            <Selector valor={zona} onCambio={setZona} opciones={Object.fromEntries(zonas.map((z) => [z, z]))} vacio="Todas" />
          </Campo>
          <Campo etiqueta="Agenda">
            <Selector valor={agenda} onCambio={setAgenda} opciones={{ vencidos: 'Vencidos', semana: 'Esta semana (y vencidos)' }} vacio="Todos" />
          </Campo>
        </div>
      </div>

      <AvisoCache desdeCache={datos?.desdeCache ?? false} />
      <ErrorMsg error={error} />
      {cargando ? (
        <Cargando />
      ) : clientes.length === 0 ? (
        <div className="tarjeta">
          <Vacio>Todavía no hay clientes activos. Abre un prospecto y usa "Activar como cliente" con su código del ERP.</Vacio>
        </div>
      ) : (
        <div className="tarjeta tabla-wrap">
          {filtrados.length === 0 ? <Vacio>No hay clientes con estos filtros.</Vacio> : (
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Código ERP</th>
                  <th>Zona</th>
                  <th>Responsable</th>
                  <th>Próximo contacto</th>
                  <th>Próxima revisión</th>
                  <th>Última gestión</th>
                  <th>Alertas</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((x) => (
                  <tr key={x.id} className="clic" onClick={() => nav('/proyecto/' + x.id + '?p=cliente')}>
                    <td>
                      <b>{x.nombre_comercial || x.razon_social}</b>
                      <div className="sec chico">{x.codigo} · {etiqueta(SEGMENTOS, x.segmento)}</div>
                    </td>
                    <td className="mono">{x.codigo_erp ?? '—'}</td>
                    <td className="chico">{zonaPorId.get(x.id)}</td>
                    <td>{x.responsable_nombre ?? <span className="sec">Sin asignar</span>}</td>
                    <td className="num">{celdaFecha(x.proximo_contacto)}</td>
                    <td className="num">{celdaFecha(x.proxima_revision)}</td>
                    <td className="num">{fecha(x.ultima_gestion_at)}</td>
                    <td>
                      <div className="fila">
                        {x.compromisos_vencidos > 0 && <Pill tono="alerta">{x.compromisos_vencidos} compromiso(s)</Pill>}
                        {x.muestras_criticas_abiertas > 0 && <Pill tono="critico">Muestra crítica</Pill>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  )
}
