export type Rol = 'gerente' | 'oficina' | 'ingeniero' | 'laboratorio' | 'credito' | 'gerencia_general' | 'cliente'

export interface UsuarioB2B {
  user_id: string
  nombre: string
  rol: Rol
  sucursal: string | null
  zonas: string[]
  especialidades: string[]
  activo: boolean
}

export interface Etapa {
  codigo: string
  orden: number
  nombre: string
  fase: 'oficina' | 'ingenieria' | 'cierre'
  descripcion: string | null
  curso_modulo: string | null
  curso_url: string | null
  activa: boolean
  es_terminal: boolean
}

export interface Proyecto {
  id: string
  numero: number
  codigo: string
  razon_social: string
  nombre_comercial: string | null
  rif: string | null
  segmento: string | null
  lineas: string[]
  sucursal: string | null
  ciudad: string | null
  direccion: string | null
  lat: number | null
  lng: number | null
  telefono: string | null
  email: string | null
  web: string | null
  fuente: string | null
  fuente_detalle: string | null
  google_place_id: string | null
  num_vehiculos: number | null
  num_equipos: number | null
  consumo_litros_anual: number | null
  potencial_usd_anual: number | null
  proveedor_actual: string | null
  marca_actual: string | null
  dolor: string | null
  crit_consumo: boolean
  crit_divisas: boolean
  crit_dolor: boolean
  crit_zona: boolean
  crit_decisor: boolean
  puntaje: number
  etapa: string
  etapa_nombre: string
  etapa_fase: string
  etapa_orden: number
  motivo_perdida: string | null
  motivo_perdida_detalle: string | null
  responsable_id: string | null
  responsable_nombre: string | null
  asignado_at: string | null
  ultima_gestion_at: string | null
  proxima_gestion: string | null
  created_at: string
  cliente_erp_id: string | null
  // Cliente activo (migración 0141): se activa con el código del ERP
  codigo_erp: string | null
  cliente_activo_at: string | null
  activado_por: string | null
  dias_contacto: number
  dias_revision: number
  proximo_contacto: string | null
  proxima_revision: string | null
  // Composición de la flota: {tipo de equipo: cantidad} (migración 0124)
  flota: Record<string, number>
  semilla: Semilla | null
  ia_prioridad: 'alta' | 'media' | 'baja' | 'descartar' | null
  ia_resumen: string | null
  ia_nivel: 'preliminar' | 'completa' | null
  ia_actualizado_at: string | null
  estancado: boolean
  compromisos_vencidos: number
  muestras_criticas_abiertas: number
}

export interface Actividad {
  id: string
  proyecto_id: string
  tipo: string
  resultado: string | null
  contacto_id: string | null
  titulo: string | null
  descripcion: string | null
  fecha: string
  proxima_gestion: string | null
  autor_id: string | null
  automatica: boolean
  metadata: Record<string, unknown>
  pendiente?: boolean
}

export interface Contacto {
  id: string
  proyecto_id: string
  nombre: string
  cargo: string | null
  rol_decision: string
  relacion: string
  telefono: string | null
  email: string | null
  linkedin: string | null
  notas: string | null
}

export interface Compromiso {
  id: string
  proyecto_id: string
  parte: 'nosotros' | 'cliente' | 'interno'
  descripcion: string
  responsable_id: string | null
  vence: string | null
  estado: 'pendiente' | 'cumplido' | 'cancelado'
  cumplido_at: string | null
  muestra_id: string | null
  automatico: boolean
  agenda: 'contacto' | 'revision' | null
  recordar_whatsapp: boolean
  recordar_calendar: boolean
}

export interface Documento {
  id: string
  proyecto_id: string
  categoria: string
  nombre: string
  storage_path: string
  mime: string | null
  tamano_bytes: number | null
  descripcion: string | null
  muestra_id: string | null
  visible_cliente: boolean
  subido_por: string | null
  created_at: string
}

export interface Equipo {
  id: string
  proyecto_id: string
  sede: string | null
  codigo_cliente: string | null
  tipo: string
  marca: string | null
  modelo: string | null
  anio: number | null
  placa_serial: string | null
  horometro: number | null
  odometro: number | null
  notas: string | null
  activo: boolean
}

export interface PuntoMuestreo {
  id: string
  equipo_id: string
  proyecto_id: string
  componente: string
  descripcion: string | null
  lubricante_actual: string | null
  capacidad_litros: number | null
  frecuencia_horas: number | null
  frecuencia_dias: number | null
  proxima_muestra: string | null
  qr_token: string
  activo: boolean
}

export type EstadoMuestra =
  | 'programada' | 'kit_entregado' | 'tomada' | 'enviada' | 'recibida_lab'
  | 'resultado_cargado' | 'interpretada' | 'comunicada' | 'cerrada' | 'anulada'

export type Semaforo = 'normal' | 'precaucion' | 'critico'

export interface Muestra {
  id: string
  numero: number
  punto_id: string
  equipo_id: string
  proyecto_id: string
  estado: EstadoMuestra
  fecha_programada: string | null
  fecha_toma: string | null
  tomada_por: string | null
  horas_equipo: number | null
  km_equipo: number | null
  horas_aceite: number | null
  km_aceite: number | null
  relleno_litros: number | null
  lubricante: string | null
  kit_id: string | null
  laboratorio: string
  numero_lab: string | null
  guia_envio: string | null
  fecha_envio: string | null
  fecha_recepcion_lab: string | null
  fecha_resultado: string | null
  semaforo_lab: Semaforo | null
  semaforo_limites: Semaforo | null
  semaforo_final: Semaforo | null
  interpretacion: string | null
  recomendacion: string | null
  comunicada_at: string | null
  facturable: boolean
  notas: string | null
  created_at: string
}

export interface Parametro {
  codigo: string
  nombre: string
  unidad: string | null
  grupo: string
  orden: number
}

export interface Resultado {
  id?: string
  muestra_id: string
  parametro_codigo: string
  valor: number | null
  valor_texto: string | null
  unidad: string | null
  semaforo: Semaforo | null
  origen: string
}

export interface Kit {
  id: string
  codigo: string
  laboratorio: string
  lote: string | null
  estado: 'disponible' | 'entregado' | 'usado' | 'anulado'
  entregado_a: string | null
  entregado_at: string | null
  notas: string | null
}

export interface Cotizacion {
  id: string
  numero: number
  proyecto_id: string
  origen: 'app' | 'profit'
  numero_profit: string | null
  moneda: 'USD' | 'VES_BCV'
  plazo_dias: number
  valida_hasta: string | null
  condiciones: string | null
  subtotal: number
  descuento_pct: number
  total: number
  estado: string
  aprobada_por: string | null
  aprobada_at: string | null
  motivo_rechazo: string | null
  documento_id: string | null
  created_at: string
}

export interface CotizacionItem {
  id: string
  cotizacion_id: string
  orden: number
  articulo_codigo: string | null
  descripcion: string
  cantidad: number
  unidad: string | null
  precio_lista: number
  descuento_pct: number
  precio: number
  total: number
}

export interface Piloto {
  id: string
  proyecto_id: string
  linea: string
  alcance: string
  metrica_acordada: string
  linea_base: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  estado: string
  resultado: string | null
}

export interface Medicion {
  id: string
  proyecto_id: string
  piloto_id: string | null
  equipo_id: string | null
  fecha: string
  tipo: string
  posicion: string | null
  valor: number
  unidad: string | null
  notas: string | null
}

export interface Comentario {
  id: string
  proyecto_id: string
  autor_id: string
  texto: string
  menciones: string[]
  created_at: string
}

export interface Asignacion {
  id: string
  proyecto_id: string
  tipo: string
  de_user_id: string | null
  a_user_id: string | null
  motivo: string | null
  nota_traspaso: string | null
  estado: 'pendiente' | 'aplicada' | 'rechazada'
  solicitado_por: string | null
  created_at: string
}

export interface Notificacion {
  id: string
  proyecto_id: string | null
  tipo: string
  titulo: string
  cuerpo: string | null
  leida: boolean
  created_at: string
}

export type SiNo = 'si' | 'no' | 'desconocido'

/** Resultado de la investigación con IA (Edge Function b2b-investigar). */
export interface ResultadoIA {
  existe: 'si' | 'no' | 'dudoso'
  resumen: string
  segmento: string | null
  actividad: string
  tiene_flota_o_planta: SiNo
  flota_estimada: string | null
  evidencia_flota: string | null
  lineas_interes: string[]
  ciudad: string | null
  web: string | null
  redes: { red: string; url: string }[]
  telefonos: string[]
  correos: string[]
  contactos: { nombre: string; cargo: string | null; fuente_url: string | null }[]
  senales: { tipo: string; detalle: string; fuente_url: string | null }[]
  criterios: { consumo: SiNo; divisas: SiNo; dolor: SiNo; zona: SiNo; decisor: SiNo }
  marcas_que_usa: string[]
  prioridad: 'alta' | 'media' | 'baja' | 'descartar'
  razon_prioridad: string
  primer_mensaje: string
}

export interface Investigacion {
  id: string
  proyecto_id: string
  tipo: 'preliminar' | 'completa'
  estado: 'ok' | 'error'
  resultado: ResultadoIA | null
  fuentes: { url: string; titulo: string }[]
  error: string | null
  modelo: string
  busquedas: number
  tokens_entrada: number
  tokens_salida: number
  costo_usd: number
  solicitado_por: string | null
  created_at: string
}

/** Lo que trajo el generador de semillas al importar (b2b_proyectos.semilla). */
export interface Semilla {
  terminos: string[]
  centro: { lat: number; lng: number } | null
  radio_m: number | null
  sucursal: string | null
  buscado_por: string | null
  buscado_at: string
  google: {
    place_id: string
    nombre: string
    direccion: string | null
    telefono: string | null
    rating: number | null
    maps_uri: string | null
    lat: number | null
    lng: number | null
  }
  cliente_erp: ClienteErpSemilla | null
}

export interface ClienteErpSemilla {
  codigo: string
  nombre: string
  clasificacion: string
  similitud: number
  direccion: string | null
  lat: number | null
  lng: number | null
}
