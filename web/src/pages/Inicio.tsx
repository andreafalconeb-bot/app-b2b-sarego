import { Link } from 'react-router-dom'
import { supabase, ok } from '../lib/supabase'
import { leerConCache } from '../lib/offline'
import { nombreDe, usePermisos, useSesion } from '../lib/sesion'
import type { Asignacion, Compromiso, Proyecto } from '../lib/tipos'
import { PARTE_COMPROMISO } from '../lib/catalogos'
import { fecha, hoyISO, sumarDias } from '../lib/formato'
import { AvisoCache, Cargando, ErrorMsg, Pill, Vacio, useCarga } from '../components/ui'
import { TablaProyectos } from './Prospectos'

interface Datos {
  proyectos: Proyecto[]
  compromisos: (Compromiso & { b2b_proyectos: { razon_social: string; nombre_comercial: string | null } | null })[]
  traspasos: Asignacion[]
  actividades: { autor_id: string | null; tipo: string; resultado: string | null; fecha: string }[]
  cotizaciones: { estado: string; created_at: string }[]
  pilotosEnCurso: number
  muestras: { estado: string; semaforo_final: string | null }[]
}

const CONTACTOS = ['llamada', 'whatsapp', 'correo', 'visita', 'reunion', 'linkedin']

export default function Inicio() {
  const { yo, usuarios } = useSesion()
  const p = usePermisos()
  const lunes = (() => {
    const d = new Date()
    const dia = (d.getDay() + 6) % 7
    return sumarDias(hoyISO(), -dia)
  })()
  const hace30 = sumarDias(hoyISO(), -30)

  const { datos, error, cargando } = useCarga(
    () =>
      leerConCache('inicio:' + yo?.id, async (): Promise<Datos> => {
        const [pr, cp, tr, ac, co, pi, mu] = await Promise.all([
          supabase.from('b2b_proyectos_resumen').select('*').not('etapa', 'in', '(perdido)'),
          supabase
            .from('b2b_compromisos')
            .select('*, b2b_proyectos(razon_social, nombre_comercial)')
            .eq('estado', 'pendiente')
            .lte('vence', sumarDias(hoyISO(), 7))
            .order('vence'),
          p.gestion ? supabase.from('b2b_asignaciones').select('*').eq('estado', 'pendiente') : Promise.resolve({ data: [], error: null }),
          supabase.from('b2b_actividades').select('autor_id, tipo, resultado, fecha').eq('automatica', false).gte('fecha', hace30),
          supabase.from('b2b_cotizaciones').select('estado, created_at').gte('created_at', lunes),
          supabase.from('b2b_pilotos').select('id', { count: 'exact', head: true }).eq('estado', 'en_curso'),
          supabase.from('b2b_muestras').select('estado, semaforo_final').not('estado', 'in', '(cerrada,anulada)'),
        ])
        return {
          proyectos: ok(pr) as Proyecto[],
          compromisos: ok(cp) as Datos['compromisos'],
          traspasos: ok(tr) as Asignacion[],
          actividades: ok(ac) as Datos['actividades'],
          cotizaciones: ok(co) as Datos['cotizaciones'],
          pilotosEnCurso: pi.count ?? 0,
          muestras: ok(mu) as Datos['muestras'],
        }
      }),
    [yo?.id, p.gestion],
  )

  if (cargando) return <Cargando />
  if (error || !datos) return <ErrorMsg error={error} />
  const d = datos.datos

  const activos = d.proyectos.filter((x) => x.etapa !== 'mas_adelante')
  const mios = p.leeTodo ? activos : activos.filter((x) => x.responsable_id === yo?.id || !p.ingeniero)
  const estancados = mios.filter((x) => x.estancado)
  const sinAsignar = activos.filter((x) => !x.responsable_id)
  const conAlerta = mios.filter((x) => x.estancado || x.compromisos_vencidos > 0 || x.muestras_criticas_abiertas > 0)
  const misCompromisos = d.compromisos.filter((c) => p.leeTodo ? true : c.responsable_id === yo?.id)
  const vencidos = misCompromisos.filter((c) => c.vence && c.vence < hoyISO())
  const criticas = d.muestras.filter((m) => m.semaforo_final === 'critico' && m.estado !== 'comunicada').length
  const porInterpretar = d.muestras.filter((m) => m.estado === 'resultado_cargado').length

  // Curso 06, módulo 6: en los primeros 90 días se mide la actividad
  const semana = d.actividades.filter((a) => a.fecha >= lunes)
  const indicadores = [
    { t: 'Cuentas cargadas', v: d.proyectos.filter((x) => x.created_at >= lunes).length },
    { t: 'Contactos registrados', v: semana.filter((a) => CONTACTOS.includes(a.tipo)).length },
    { t: 'Diagnósticos en sitio', v: semana.filter((a) => a.tipo === 'diagnostico').length },
    { t: 'Cotizaciones hechas', v: d.cotizaciones.length },
    { t: 'Pilotos en marcha', v: d.pilotosEnCurso },
    { t: 'Cuentas ganadas', v: d.proyectos.filter((x) => x.etapa === 'ganado' || x.etapa === 'expansion').length },
  ]

  const porPersona = new Map<string, number>()
  for (const a of d.actividades) if (a.autor_id) porPersona.set(a.autor_id, (porPersona.get(a.autor_id) ?? 0) + 1)
  const ranking = usuarios
    .filter((u) => ['ingeniero', 'oficina'].includes(u.rol) && u.activo)
    .map((u) => ({ u, n: porPersona.get(u.user_id) ?? 0, activos: activos.filter((x) => x.responsable_id === u.user_id).length }))
    .sort((a, b) => b.n - a.n)

  return (
    <div className="pila" style={{ gap: 16 }}>
      <AvisoCache desdeCache={datos.desdeCache} />
      <div className="titulo-pagina" style={{ marginBottom: 0 }}>
        <div>
          <h1>Hola, {yo?.nombre.split(' ')[0]}</h1>
          <div className="sec chico">{p.leeTodo ? 'Vista de todo el equipo B2B' : 'Tus cuentas y lo que te compartieron'}</div>
        </div>
        <Link to="/prospectos" className="boton primario">Ver prospectos</Link>
      </div>

      <div className="grid grid-4">
        <Metrica v={mios.length} t={p.leeTodo ? 'Proyectos activos' : 'Mis proyectos activos'} a="/prospectos" />
        <Metrica v={estancados.length} t="Estancados (sin gestión a tiempo)" tono={estancados.length ? 'alerta' : undefined} a="/prospectos" />
        <Metrica v={vencidos.length} t="Compromisos vencidos" tono={vencidos.length ? 'alerta' : undefined} />
        <Metrica v={criticas} t="Muestras críticas sin comunicar" tono={criticas ? 'critico' : undefined} a="/muestras" />
        {p.gestion && <Metrica v={sinAsignar.length} t="En la oficina (sin ingeniero)" a="/prospectos" />}
        {p.gestion && <Metrica v={d.traspasos.length} t="Traspasos por aprobar" tono={d.traspasos.length ? 'alerta' : undefined} />}
        {(p.laboratorio || p.gestion || p.ingeniero) && <Metrica v={porInterpretar} t="Muestras por interpretar" a="/muestras" />}
      </div>

      {p.gestion && d.traspasos.length > 0 && (
        <section className="tarjeta pila">
          <h2>Traspasos por aprobar</h2>
          {d.traspasos.map((t) => {
            const pr = d.proyectos.find((x) => x.id === t.proyecto_id)
            return (
              <div key={t.id} className="fila-entre">
                <span>
                  <Link to={`/proyecto/${t.proyecto_id}?p=equipo`}>{pr?.codigo} · {pr?.nombre_comercial || pr?.razon_social}</Link>: de {nombreDe(usuarios, t.de_user_id)} a {nombreDe(usuarios, t.a_user_id)}
                </span>
                <span className="sec chico">{t.motivo}</span>
              </div>
            )
          })}
        </section>
      )}

      <section className="tarjeta pila">
        <div className="fila-entre">
          <h2>Esta semana</h2>
          <a className="chico" href="https://academia.distribuidorasarego.com/curso/prospeccion-corporativa#módulo-6-métricas-y-metas-de-los-primeros-90-días" target="_blank" rel="noreferrer">
            Indicadores del curso 06, módulo 6
          </a>
        </div>
        <div className="grid grid-3">
          {indicadores.map((i) => (
            <div key={i.t} className="metrica">
              <div className="v">{i.v}</div>
              <div className="e">{i.t}</div>
            </div>
          ))}
        </div>
        <span className="sec chico">Las metas por indicador se configuran más adelante.</span>
      </section>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <section className="tarjeta pila">
          <h2>Compromisos de los próximos 7 días</h2>
          {misCompromisos.length === 0 ? (
            <Vacio>Nada pendiente.</Vacio>
          ) : (
            misCompromisos.slice(0, 15).map((c) => (
              <Link key={c.id} to={`/proyecto/${c.proyecto_id}?p=compromisos`} className="fila-entre" style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px solid var(--borde)', paddingBottom: 6 }}>
                <span className="min0">
                  {c.descripcion}
                  <div className="sec chico">
                    {c.b2b_proyectos?.nombre_comercial || c.b2b_proyectos?.razon_social} · {PARTE_COMPROMISO[c.parte]}
                    {p.leeTodo && ' · ' + nombreDe(usuarios, c.responsable_id)}
                  </div>
                </span>
                <span className="num chico">{c.vence && c.vence < hoyISO() ? <Pill tono="alerta">{fecha(c.vence)}</Pill> : fecha(c.vence)}</span>
              </Link>
            ))
          )}
        </section>

        {p.leeTodo ? (
          <section className="tarjeta pila">
            <h2>Actividad por persona, últimos 30 días</h2>
            <p className="sec chico" style={{ margin: 0 }}>Gestiones registradas, no prospectos cargados (curso 08, módulo 6).</p>
            <table>
              <thead><tr><th>Persona</th><th>Gestiones</th><th>Proyectos</th></tr></thead>
              <tbody>
                {ranking.map((r) => (
                  <tr key={r.u.user_id}>
                    <td>{r.u.nombre}</td>
                    <td className="num">{r.n}</td>
                    <td className="num">{r.activos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : (
          <section className="tarjeta pila">
            <h2>Mis gestiones, últimos 30 días</h2>
            <div className="metrica"><div className="v">{porPersona.get(yo?.id ?? '') ?? 0}</div><div className="e">Lo que se mide es cuántas veces vuelves a cada cuenta, no cuántas cargas.</div></div>
          </section>
        )}
      </div>

      <section className="tarjeta">
        <h2 style={{ marginBottom: 8 }}>Proyectos con alertas</h2>
        {conAlerta.length === 0 ? <Vacio>Todo al día.</Vacio> : <div className="tabla-wrap"><TablaProyectos proyectos={conAlerta} /></div>}
      </section>
    </div>
  )
}

function Metrica({ v, t, tono, a }: { v: number; t: string; tono?: 'alerta' | 'critico'; a?: string }) {
  const c = (
    <div className={'metrica' + (tono ? ' ' + tono : '')}>
      <div className="v">{v}</div>
      <div className="e">{t}</div>
    </div>
  )
  return a ? <Link to={a} style={{ color: 'inherit', textDecoration: 'none' }}>{c}</Link> : c
}
