import { Link } from 'react-router-dom'
import { supabase, ok } from '../lib/supabase'
import type { Notificacion } from '../lib/tipos'
import { fechaHora } from '../lib/formato'
import { Cargando, ErrorMsg, Vacio, useCarga } from '../components/ui'

export default function Notificaciones() {
  const { datos, error, cargando, recargar } = useCarga(
    async () => ok(await supabase.from('b2b_notificaciones').select('*').order('created_at', { ascending: false }).limit(200)) as Notificacion[],
    [],
  )
  const marcarTodas = async () => {
    await supabase.from('b2b_notificaciones').update({ leida: true }).eq('leida', false)
    await recargar()
  }
  const marcar = async (n: Notificacion) => {
    if (!n.leida) await supabase.from('b2b_notificaciones').update({ leida: true }).eq('id', n.id)
  }
  return (
    <>
      <div className="titulo-pagina">
        <h1>Notificaciones</h1>
        <button onClick={() => void marcarTodas()}>Marcar todas como leídas</button>
      </div>
      <ErrorMsg error={error} />
      <section className="tarjeta">
        {cargando ? (
          <Cargando />
        ) : !datos?.length ? (
          <Vacio>Sin notificaciones. Te llegan cuando te asignan un proyecto, te mencionan o hay un traspaso por aprobar.</Vacio>
        ) : (
          <ul className="linea">
            {datos.map((n) => (
              <li key={n.id} style={{ fontWeight: n.leida ? 400 : 600 }}>
                <span className="ico">{n.leida ? '·' : '●'}</span>
                <div className="min0">
                  <div className="fila-entre">
                    {n.proyecto_id ? (
                      <Link to={'/proyecto/' + n.proyecto_id + (n.tipo === 'mencion' ? '?p=linea' : n.tipo.startsWith('traspaso') ? '?p=equipo' : '')} onClick={() => void marcar(n)}>
                        {n.titulo}
                      </Link>
                    ) : (
                      <span>{n.titulo}</span>
                    )}
                    <span className="sec chico">{fechaHora(n.created_at)}</span>
                  </div>
                  {n.cuerpo && <p className="chico" style={{ fontWeight: 400 }}>{n.cuerpo}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
