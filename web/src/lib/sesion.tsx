import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Etapa, Rol, UsuarioB2B } from './tipos'
import { leerConCache } from './offline'

interface Sesion {
  cargando: boolean
  session: Session | null
  yo: { id: string; nombre: string; rol: Rol | null; esAdmin: boolean } | null
  usuarios: UsuarioB2B[]
  etapas: Etapa[]
  recargar: () => Promise<void>
  salir: () => Promise<void>
}

const Ctx = createContext<Sesion | null>(null)

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [cargando, setCargando] = useState(true)
  const [yo, setYo] = useState<Sesion['yo']>(null)
  const [usuarios, setUsuarios] = useState<UsuarioB2B[]>([])
  const [etapas, setEtapas] = useState<Etapa[]>([])

  const cargarPerfil = useCallback(async (s: Session | null) => {
    if (!s) {
      setYo(null)
      setCargando(false)
      return
    }
    try {
      const { datos } = await leerConCache('perfil:' + s.user.id, async () => {
        const [perfil, b2b, us, et] = await Promise.all([
          supabase.from('profiles').select('nombre_completo, role').eq('id', s.user.id).maybeSingle(),
          supabase.from('b2b_usuarios').select('rol, activo').eq('user_id', s.user.id).maybeSingle(),
          supabase.rpc('b2b_listar_usuarios'),
          supabase.from('b2b_etapas').select('*').eq('activa', true).order('orden'),
        ])
        for (const r of [perfil, b2b, us, et]) if (r.error) throw new Error(r.error.message)
        return { perfil: perfil.data, b2b: b2b.data, usuarios: us.data ?? [], etapas: et.data ?? [] }
      })
      const role = (datos.perfil?.role as string | undefined) ?? ''
      setYo({
        id: s.user.id,
        nombre: (datos.perfil?.nombre_completo as string | undefined) ?? s.user.email ?? '',
        rol: datos.b2b?.activo ? (datos.b2b.rol as Rol) : null,
        esAdmin: role === 'admin' || role === 'admin_oficina_principal',
      })
      setUsuarios(datos.usuarios as UsuarioB2B[])
      setEtapas(datos.etapas as Etapa[])
    } catch {
      setYo({ id: s.user.id, nombre: s.user.email ?? '', rol: null, esAdmin: false })
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      void cargarPerfil(data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      setSession(s)
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') void cargarPerfil(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [cargarPerfil])

  const valor: Sesion = {
    cargando,
    session,
    yo,
    usuarios,
    etapas,
    recargar: () => cargarPerfil(session),
    salir: async () => {
      await supabase.auth.signOut()
    },
  }
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useSesion(): Sesion {
  const c = useContext(Ctx)
  if (!c) throw new Error('useSesion fuera de ProveedorSesion')
  return c
}

/** Permisos derivados del rol B2B (espejo de las funciones SQL). */
export function usePermisos() {
  const { yo } = useSesion()
  const rol = yo?.rol
  const admin = yo?.esAdmin ?? false
  return {
    gestion: admin || rol === 'gerente' || rol === 'oficina',
    gerente: admin || rol === 'gerente',
    ingeniero: rol === 'ingeniero',
    laboratorio: rol === 'laboratorio',
    leeTodo: admin || ['gerente', 'oficina', 'laboratorio', 'credito', 'gerencia_general'].includes(rol ?? ''),
    soloLectura: rol === 'credito' || rol === 'gerencia_general',
  }
}

export function nombreDe(usuarios: UsuarioB2B[], id: string | null | undefined): string {
  if (!id) return '—'
  return usuarios.find((u) => u.user_id === id)?.nombre ?? '—'
}
