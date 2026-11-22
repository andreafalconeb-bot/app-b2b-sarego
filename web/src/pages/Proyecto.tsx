import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase, ok } from '../lib/supabase'
import { leerConCache } from '../lib/offline'
import { usePermisos, useSesion } from '../lib/sesion'
import type { Proyecto } from '../lib/tipos'
import { SEGMENTOS, SUCURSALES, LINEAS, etiqueta } from '../lib/catalogos'
import { correoExpediente } from '../lib/formato'
import { AvisoCache, Cargando, ErrorMsg, Pill, useCarga } from '../components/ui'
import Resumen from '../components/proyecto/Resumen'
import LineaTiempo from '../components/proyecto/LineaTiempo'
import Decisores from '../components/proyecto/Decisores'
import Compromisos from '../components/proyecto/Compromisos'
import Documentos from '../components/proyecto/Documentos'
import EquiposMuestras from '../components/proyecto/EquiposMuestras'
import Cotizaciones from '../components/proyecto/Cotizaciones'
import Pilotos from '../components/proyecto/Pilotos'
import EquipoTrabajo from '../components/proyecto/EquipoTrabajo'

export interface Miembro {
  user_id: string
  rol_en_proyecto: 'colaborador' | 'seguidor'
}

export interface PropsPestana {
  proyecto: Proyecto
  puedeEditar: boolean
  recargarProyecto: () => Promise<void>
}

const PESTANAS = [
  ['resumen', 'Resumen'],
  ['linea', 'Línea de tiempo'],
  ['decisores', 'Decisores'],
  ['compromisos', 'Compromisos'],
  ['documentos', 'Documentos'],
  ['equipos', 'Equipos y muestras'],
  ['cotizaciones', 'Cotizaciones'],
  ['pilotos', 'Pilotos y mediciones'],
  ['equipo', 'Responsable y equipo'],
] as const

export default function ProyectoPagina() {
  const { id } = useParams()
  const { yo, etapas } = useSesion()
  const p = usePermisos()
  const [params, setParams] = useSearchParams()
  const pestana = params.get('p') ?? 'resumen'
  const [copiado, setCopiado] = useState(false)

  const { datos, error, cargando, recargar } = useCarga(
    () =>
      leerConCache('proyecto:' + id, async () => {
        const [pr, mi] = await Promise.all([
          supabase.from('b2b_proyectos_resumen').select('*').eq('id', id!).maybeSingle(),
          supabase.from('b2b_proyecto_miembros').select('user_id, rol_en_proyecto').eq('proyecto_id', id!),
        ])
        return { proyecto: ok(pr) as Proyecto | null, miembros: (ok(mi) ?? []) as Miembro[] }
      }),
    [id],
  )

  if (cargando) return <Cargando />
  if (error) return <ErrorMsg error={error} />
  const proyecto = datos?.datos.proyecto
  if (!proyecto) {
    return (
      <div className="tarjeta">
        <h1>Proyecto no disponible</h1>
        <p className="sec">No existe o no tienes acceso. Si debes trabajarlo, pídele al gerente que te lo comparta.</p>
        <Link to="/prospectos">Volver a prospectos</Link>
      </div>
    )
  }
  const miembros = datos!.datos.miembros
  const soyMiembro = miembros.find((m) => m.user_id === yo?.id)
  const puedeEditar =
    !p.soloLectura &&
    (p.gestion || p.laboratorio || proyecto.responsable_id === yo?.id || soyMiembro?.rol_en_proyecto === 'colaborador')

  const etapasFlujo = etapas.filter((e) => e.fase !== 'cierre')
  const idxActual = etapasFlujo.findIndex((e) => e.codigo === proyecto.etapa)
  const correo = correoExpediente(proyecto.numero)
  const props: PropsPestana = { proyecto, puedeEditar, recargarProyecto: recargar }

  const copiarCorreo = async () => {
    try {
      await navigator.clipboard.writeText(correo)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      /* el texto queda visible para copiarlo a mano */
    }
  }

  return (
    <>
      <AvisoCache desdeCache={datos?.desdeCache ?? false} />
      <div className="tarjeta" style={{ marginBottom: 12 }}>
        <div className="fila-entre">
          <div className="min0">
            <div className="fila">
              <span className="mono sec">{proyecto.codigo}</span>
              <Pill tono={proyecto.etapa_fase === 'oficina' ? 'ambar' : proyecto.etapa === 'perdido' ? 'critico' : 'acento'}>{proyecto.etapa_nombre}</Pill>
              {proyecto.estancado && <Pill tono="alerta">Estancado</Pill>}
              {proyecto.muestras_criticas_abiertas > 0 && <Pill tono="critico">{proyecto.muestras_criticas_abiertas} muestra(s) crítica(s)</Pill>}
              {!puedeEditar && <Pill>Solo lectura</Pill>}
            </div>
            <h1 style={{ marginTop: 4 }}>{proyecto.nombre_comercial || proyecto.razon_social}</h1>
            <div className="sec chico">
              {proyecto.nombre_comercial ? proyecto.razon_social + ' · ' : ''}
              {proyecto.rif ?? 'Sin RIF'} · {etiqueta(SEGMENTOS, proyecto.segmento)} · {etiqueta(SUCURSALES, proyecto.sucursal)}
              {proyecto.lineas.length ? ' · ' + proyecto.lineas.map((l) => LINEAS[l] ?? l).join(', ') : ''}
            </div>
          </div>
          <div className="pila" style={{ alignItems: 'flex-end' }}>
            <span className="chico">
              Responsable: <b>{proyecto.responsable_nombre ?? 'Oficina de prospectación'}</b>
            </span>
            <span className="chico sec" title="Pon esta dirección en copia (CC) y el correo queda en el expediente">
              Correo del expediente: <span className="mono">{correo}</span>{' '}
              <button className="chico" onClick={() => void copiarCorreo()}>{copiado ? 'Copiado' : 'Copiar'}</button>
            </span>
          </div>
        </div>
        <div className="avance" style={{ marginTop: 12 }} aria-label="Avance por etapas">
          {etapasFlujo.map((e, i) => (
            <span key={e.codigo} title={e.nombre} className={i < idxActual ? 'hecha' : i === idxActual ? 'actual' : ''} />
          ))}
        </div>
      </div>

      <div className="pestanas" role="tablist">
        {PESTANAS.map(([k, v]) => (
          <button key={k} role="tab" aria-selected={pestana === k} className={pestana === k ? 'activa' : ''} onClick={() => setParams({ p: k }, { replace: true })}>
            {v}
          </button>
        ))}
      </div>

      {pestana === 'resumen' && <Resumen {...props} />}
      {pestana === 'linea' && <LineaTiempo {...props} />}
      {pestana === 'decisores' && <Decisores {...props} />}
      {pestana === 'compromisos' && <Compromisos {...props} />}
      {pestana === 'documentos' && <Documentos {...props} />}
      {pestana === 'equipos' && <EquiposMuestras {...props} />}
      {pestana === 'cotizaciones' && <Cotizaciones {...props} />}
      {pestana === 'pilotos' && <Pilotos {...props} />}
      {pestana === 'equipo' && <EquipoTrabajo {...props} miembros={miembros} />}
    </>
  )
}
