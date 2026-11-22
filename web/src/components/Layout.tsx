import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { usePermisos, useSesion } from '../lib/sesion'
import { supabase } from '../lib/supabase'
import { alCambiarCola, pendientes, procesarCola } from '../lib/offline'
import { ROLES } from '../lib/catalogos'

export default function Layout() {
  const { yo, salir } = useSesion()
  const p = usePermisos()
  const [noLeidas, setNoLeidas] = useState(0)
  const [enCola, setEnCola] = useState(0)
  const [online, setOnline] = useState(navigator.onLine)
  const [msgCola, setMsgCola] = useState<string | null>(null)

  useEffect(() => {
    const contar = async () => {
      const { count } = await supabase.from('b2b_notificaciones').select('id', { count: 'exact', head: true }).eq('leida', false)
      setNoLeidas(count ?? 0)
    }
    void contar()
    const t = setInterval(contar, 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const actualizar = async () => setEnCola((await pendientes()).length)
    void actualizar()
    void procesarCola()
    const quitar = alCambiarCola(() => void actualizar())
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      quitar()
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const enviarCola = async () => {
    const r = await procesarCola()
    setMsgCola(
      r.errores.length
        ? `No se pudieron guardar ${r.errores.length}: ${r.errores.join(' · ')}`
        : r.enviadas
          ? `Se guardaron ${r.enviadas} cambios hechos sin señal.`
          : 'Todavía no hay señal para enviar los cambios.',
    )
  }

  return (
    <>
      <header className="cabecera">
        <Link to="/" className="logo">
          <img src="/favicon.svg" alt="" width={26} height={26} /> SAREGO B2B
        </Link>
        <nav>
          <NavLink to="/" end>Inicio</NavLink>
          <NavLink to="/prospectos">Prospectos</NavLink>
          {p.gestion && <NavLink to="/semillas">Semillas</NavLink>}
          <NavLink to="/muestras">Muestras</NavLink>
          <NavLink to="/kits">Kits</NavLink>
          {p.gerente && <NavLink to="/equipo">Equipo</NavLink>}
        </nav>
        <div className="usuario">
          {!online && <span className="pill alerta">Sin señal</span>}
          {enCola > 0 && (
            <button className="cola" onClick={() => void enviarCola()} title="Cambios hechos sin señal, pendientes de enviar">
              {enCola} sin enviar
            </button>
          )}
          <Link to="/notificaciones" className="campana" aria-label={`Notificaciones: ${noLeidas} sin leer`}>
            🔔{noLeidas > 0 && <b>{noLeidas}</b>}
          </Link>
          <span className="ocultar-movil">
            {yo?.nombre} · {yo?.rol ? ROLES[yo.rol] : 'Administrador'}
          </span>
          <button className="chico" onClick={() => void salir()}>Salir</button>
        </div>
      </header>
      <main className="contenido">
        {msgCola && (
          <div className="aviso" style={{ marginBottom: 12 }} onClick={() => setMsgCola(null)}>
            {msgCola}
          </div>
        )}
        <Outlet />
      </main>
    </>
  )
}
