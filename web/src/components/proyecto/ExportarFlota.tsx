import { useState } from 'react'
import { supabase, ok } from '../../lib/supabase'
import { numero } from '../../lib/formato'
import { ErrorMsg, Pill, mensajeError, useCarga } from '../ui'
import type { Proyecto } from '../../lib/tipos'

// Andrea (25/nov/2026): "Cuando el prospecto pasa a ser cliente se deben
// poder exportar los vehículos a la app FLOTAS y las pruebas realizadas
// de lubricantes usados". La base hace el trabajo (migración 0140,
// flota_exportar_desde_b2b); se puede repetir sin duplicar, y los
// análisis nuevos pasan solos después.
const URL_FLOTA = 'https://flota.distribuidorasarego.com'
const ETAPAS_CLIENTE = ['ganado', 'expansion']

type EnFlota = { empresa_id: string; nombre: string; activos: number; analisis: number }
type Resultado = {
  empresa_id: string
  empresa_nueva: boolean
  activos_nuevos: number
  activos_actualizados: number
  compartimientos: number
  analisis: number
}

export default function ExportarFlota({ proyecto, puedeEditar, equipos, analisis }: {
  proyecto: Proyecto
  puedeEditar: boolean
  equipos: number
  analisis: number
}) {
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<Resultado | null>(null)
  const esCliente = ETAPAS_CLIENTE.includes(proyecto.etapa)

  const { datos, recargar } = useCarga(async () => {
    const { data } = await supabase.rpc('flota_empresa_de_proyecto', { p_proyecto: proyecto.id })
    return ((data as EnFlota[] | null) ?? [])[0] ?? null
  }, [proyecto.id])
  const enFlota = datos ?? null

  if (!esCliente) {
    return (
      <div className="aviso chico">
        Cuando la cuenta llegue a <b>Cuenta ganada</b>, podrás pasar estos equipos y sus análisis de aceite a <b>Flota SAREGO</b>, la app de mantenimiento del cliente.
      </div>
    )
  }

  const exportar = async () => {
    setTrabajando(true)
    setError(null)
    try {
      const r = ok(await supabase.rpc('flota_exportar_desde_b2b', { p_proyecto: proyecto.id })) as Resultado
      setHecho(r)
      await recargar()
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <section className="tarjeta pila" style={{ borderLeft: '4px solid var(--ok)' }}>
      <div className="fila-entre">
        <div className="min0">
          <h3 style={{ margin: 0 }}>Flota SAREGO</h3>
          <p className="sec chico" style={{ margin: '4px 0 0' }}>
            El cliente lleva el mantenimiento de su flota en {URL_FLOTA.replace('https://', '')}. Al exportar pasan sus {numero(equipos)} equipos
            con sus compartimientos y lubricantes, y los {numero(analisis)} análisis de aceite usado con resultado. Los análisis nuevos llegan solos.
          </p>
        </div>
        {enFlota ? <Pill tono="ok">Ya está en Flota</Pill> : <Pill tono="ambar">Todavía no está en Flota</Pill>}
      </div>

      {enFlota && (
        <div className="fila chico">
          <span>
            Empresa <b>{enFlota.nombre}</b>: {numero(enFlota.activos)} activos · {numero(enFlota.analisis)} análisis
          </span>
          <a href={`${URL_FLOTA}/e/${enFlota.empresa_id}/activos`} target="_blank" rel="noreferrer">Ver sus activos en Flota</a>
          <a href={`${URL_FLOTA}/e/${enFlota.empresa_id}/usuarios`} target="_blank" rel="noreferrer">Invitar usuarios del cliente</a>
        </div>
      )}

      {puedeEditar && (
        <div className="fila">
          <button className={enFlota ? '' : 'primario'} disabled={trabajando || equipos === 0} onClick={() => void exportar()}>
            {trabajando ? 'Exportando…' : enFlota ? 'Actualizar en Flota' : 'Exportar a Flota SAREGO'}
          </button>
          {equipos === 0 && <span className="sec chico">Primero carga sus equipos aquí abajo.</span>}
        </div>
      )}

      {hecho && (
        <div className="aviso ok chico">
          {hecho.empresa_nueva ? 'Se creó la empresa en Flota (versión completa, beneficio de cliente SAREGO). ' : 'Empresa actualizada en Flota. '}
          {hecho.activos_nuevos} activos nuevos, {hecho.activos_actualizados} actualizados, {hecho.compartimientos} compartimientos y {hecho.analisis} análisis.
          {hecho.empresa_nueva && ' Falta invitar a los usuarios del cliente: usa "Invitar usuarios del cliente".'}
        </div>
      )}
      <ErrorMsg error={error} />
    </section>
  )
}
