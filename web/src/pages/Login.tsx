import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { ErrorMsg } from '../components/ui'

export default function Login() {
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const entrar = async (e: FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: clave })
    if (error) setError(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message)
    setEnviando(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <form className="tarjeta pila" style={{ width: 'min(380px, 100%)', gap: 14 }} onSubmit={entrar}>
        <div className="fila">
          <img src="/favicon.svg" alt="" width={40} height={40} />
          <div>
            <h1>SAREGO B2B</h1>
            <div className="sec chico">Prospección corporativa y análisis de aceite</div>
          </div>
        </div>
        <p className="sec chico" style={{ margin: 0 }}>Entra con el mismo usuario y contraseña de la app retail.</p>
        <label className="campo">
          <span>Correo</span>
          <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="campo">
          <span>Contraseña</span>
          <input id="clave" type="password" autoComplete="current-password" required value={clave} onChange={(e) => setClave(e.target.value)} />
        </label>
        <ErrorMsg error={error} />
        <button className="primario" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  )
}
