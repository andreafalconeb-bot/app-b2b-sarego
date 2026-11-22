import { useState } from 'react'
import { supabase, ok, BUCKET } from '../../lib/supabase'
import { leerConCache } from '../../lib/offline'
import { nombreDe, useSesion } from '../../lib/sesion'
import type { Documento } from '../../lib/tipos'
import { CATEGORIAS_DOC } from '../../lib/catalogos'
import { fecha, tamano } from '../../lib/formato'
import { AvisoCache, Campo, Cargando, ErrorMsg, Pill, Selector, Vacio, mensajeError, useCarga } from '../ui'
import type { PropsPestana } from '../../pages/Proyecto'

/** Sube un archivo al expediente y lo registra. Necesita señal. */
export async function subirDocumento(opts: {
  proyectoId: string
  archivo: File
  categoria: string
  descripcion?: string | null
  muestraId?: string | null
  equipoId?: string | null
}): Promise<Documento> {
  const limpio = opts.archivo.name.normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-80)
  const ruta = `${opts.proyectoId}/${crypto.randomUUID()}-${limpio}`
  const up = await supabase.storage.from(BUCKET).upload(ruta, opts.archivo, { contentType: opts.archivo.type || undefined })
  if (up.error) throw new Error('No se pudo subir el archivo: ' + up.error.message)
  return ok(
    await supabase
      .from('b2b_documentos')
      .insert({
        proyecto_id: opts.proyectoId,
        categoria: opts.categoria,
        nombre: opts.archivo.name,
        storage_path: ruta,
        mime: opts.archivo.type || null,
        tamano_bytes: opts.archivo.size,
        descripcion: opts.descripcion ?? null,
        muestra_id: opts.muestraId ?? null,
        equipo_id: opts.equipoId ?? null,
      })
      .select('*')
      .single(),
  ) as Documento
}

export async function abrirDocumento(ruta: string) {
  const r = await supabase.storage.from(BUCKET).createSignedUrl(ruta, 600)
  if (r.error) throw new Error(r.error.message)
  window.open(r.data.signedUrl, '_blank', 'noopener')
}

export default function Documentos({ proyecto, puedeEditar }: PropsPestana) {
  const { usuarios } = useSesion()
  const [categoria, setCategoria] = useState('documento')
  const [descripcion, setDescripcion] = useState('')
  const [archivos, setArchivos] = useState<File[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState('')

  const { datos, error: errCarga, cargando, recargar } = useCarga(
    () =>
      leerConCache('docs:' + proyecto.id, async () =>
        ok(await supabase.from('b2b_documentos').select('*').eq('proyecto_id', proyecto.id).order('created_at', { ascending: false })) as Documento[],
      ),
    [proyecto.id],
  )
  const docs = (datos?.datos ?? []).filter((d) => !filtro || d.categoria === filtro)

  const subir = async () => {
    if (!archivos.length) return
    setSubiendo(true)
    setError(null)
    try {
      for (const a of archivos) await subirDocumento({ proyectoId: proyecto.id, archivo: a, categoria, descripcion: descripcion || null })
      setArchivos([])
      setDescripcion('')
      await recargar()
    } catch (e) {
      setError(navigator.onLine ? mensajeError(e) : 'Los archivos necesitan señal para subirse. Inténtalo cuando tengas conexión.')
    } finally {
      setSubiendo(false)
    }
  }

  const alternarCliente = async (d: Documento) => {
    try {
      ok(await supabase.from('b2b_documentos').update({ visible_cliente: !d.visible_cliente }).eq('id', d.id))
      await recargar()
    } catch (e) {
      setError(mensajeError(e))
    }
  }
  const borrar = async (d: Documento) => {
    try {
      await supabase.storage.from(BUCKET).remove([d.storage_path])
      ok(await supabase.from('b2b_documentos').delete().eq('id', d.id))
      await recargar()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(280px, 2fr)', alignItems: 'start' }}>
      <section className="tarjeta min0">
        <div className="fila-entre" style={{ marginBottom: 8 }}>
          <h2>Expediente</h2>
          <div style={{ width: 220 }}>
            <Selector valor={filtro} onCambio={setFiltro} opciones={CATEGORIAS_DOC} vacio="Todas las categorías" />
          </div>
        </div>
        <AvisoCache desdeCache={datos?.desdeCache ?? false} />
        <ErrorMsg error={errCarga} />
        {cargando ? (
          <Cargando />
        ) : docs.length === 0 ? (
          <Vacio>Sin documentos. Sube fichas, minutas, fotos, contratos, la carpeta de proveedor…</Vacio>
        ) : (
          <div className="tabla-wrap">
            <table>
              <thead><tr><th>Archivo</th><th>Categoría</th><th>Subido</th><th></th></tr></thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td className="min0">
                      <button className="chico" onClick={() => void abrirDocumento(d.storage_path).catch((e) => setError(mensajeError(e)))}>Abrir</button>{' '}
                      <b style={{ wordBreak: 'break-word' }}>{d.nombre}</b>
                      <div className="sec chico">{tamano(d.tamano_bytes)}{d.descripcion ? ' · ' + d.descripcion : ''}</div>
                    </td>
                    <td className="chico">
                      {CATEGORIAS_DOC[d.categoria] ?? d.categoria}
                      {d.visible_cliente && <div><Pill tono="acento">Visible al cliente</Pill></div>}
                    </td>
                    <td className="chico">{fecha(d.created_at)}<div className="sec">{nombreDe(usuarios, d.subido_por)}</div></td>
                    <td>
                      {puedeEditar && (
                        <div className="fila">
                          <button className="chico" onClick={() => void alternarCliente(d)}>{d.visible_cliente ? 'Ocultar al cliente' : 'Mostrar al cliente'}</button>
                          <button className="chico peligro" onClick={() => void borrar(d)}>Borrar</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {puedeEditar && (
        <section className="tarjeta pila">
          <h2>Subir</h2>
          <Campo etiqueta="Categoría"><Selector valor={categoria} onCambio={setCategoria} opciones={CATEGORIAS_DOC} /></Campo>
          <Campo etiqueta="Descripción (opcional)"><input id="d-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></Campo>
          <Campo etiqueta="Archivos (PDF, Word, Excel, fotos)">
            <input id="d-archivos" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.eml,.msg,.txt" onChange={(e) => setArchivos([...(e.target.files ?? [])])} />
          </Campo>
          <ErrorMsg error={error} />
          <div><button className="primario" disabled={!archivos.length || subiendo} onClick={() => void subir()}>{subiendo ? 'Subiendo…' : `Subir ${archivos.length || ''}`}</button></div>
          <p className="sec chico" style={{ margin: 0 }}>Los archivos son privados: solo los ve quien tiene acceso al proyecto. "Mostrar al cliente" los deja ver en su portal.</p>
        </section>
      )}
    </div>
  )
}
