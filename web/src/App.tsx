import { Navigate, Route, Routes } from 'react-router-dom'
import { useSesion } from './lib/sesion'
import { configFaltante } from './lib/supabase'
import Layout from './components/Layout'
import Login from './pages/Login'
import Inicio from './pages/Inicio'
import Prospectos from './pages/Prospectos'
import Semillas from './pages/Semillas'
import ProyectoPagina from './pages/Proyecto'
import Muestras from './pages/Muestras'
import MuestraPagina from './pages/Muestra'
import QrPunto from './pages/QrPunto'
import Kits from './pages/Kits'
import Equipo from './pages/Equipo'
import Notificaciones from './pages/Notificaciones'
import { Cargando } from './components/ui'

export default function App() {
  const { cargando, session, yo, salir } = useSesion()

  if (configFaltante) {
    return (
      <div className="contenido">
        <div className="aviso error">Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (mismo proyecto Supabase que la app retail).</div>
      </div>
    )
  }
  if (cargando) return <Cargando />
  if (!session) return <Login />
  if (!yo?.rol && !yo?.esAdmin) {
    return (
      <div className="contenido" style={{ maxWidth: 520 }}>
        <div className="tarjeta pila">
          <h1>Sin acceso a la app B2B</h1>
          <p className="sec">Tu cuenta ({session.user.email}) existe, pero todavía no tiene un rol B2B. Pídele al gerente B2B que te dé acceso desde la sección Equipo.</p>
          <div><button onClick={() => void salir()}>Salir</button></div>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Inicio />} />
        <Route path="/prospectos" element={<Prospectos />} />
        <Route path="/semillas" element={<Semillas />} />
        <Route path="/proyecto/:id" element={<ProyectoPagina />} />
        <Route path="/muestras" element={<Muestras />} />
        <Route path="/muestra/:id" element={<MuestraPagina />} />
        <Route path="/qr/:token" element={<QrPunto />} />
        <Route path="/kits" element={<Kits />} />
        <Route path="/equipo" element={<Equipo />} />
        <Route path="/notificaciones" element={<Notificaciones />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
