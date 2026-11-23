// Etiquetas legibles para los valores guardados en la base (migración
// 0119 del repo app-retail-lubricantes). Un solo lugar para no repetirlas.
type Mapa = Record<string, string>

export const ROLES: Mapa = {
  gerente: 'Gerente B2B',
  oficina: 'Oficina de prospectación',
  ingeniero: 'Ingeniero',
  laboratorio: 'Coordinación de muestras',
  credito: 'Crédito y cobranza',
  gerencia_general: 'Gerencia general',
  cliente: 'Cliente (portal)',
}

export const SEGMENTOS: Mapa = {
  transporte_flotas: 'Transporte y flotas',
  construccion: 'Construcción y maquinaria pesada',
  mineria: 'Minería y canteras',
  manufactura: 'Manufactura / planta industrial',
  alimentos_bebidas: 'Alimentos y bebidas',
  generacion_electrica: 'Generación eléctrica',
  petroleo_gas: 'Petróleo y gas',
  agroindustria: 'Agroindustria',
  marina_puertos: 'Marina / puertos',
  sector_publico: 'Gobierno / entes públicos',
  otro: 'Otro',
}

export const LINEAS: Mapa = { lubricantes: 'Lubricantes', grasas: 'Grasas', neumaticos: 'Neumáticos' }

export const FUENTES: Mapa = {
  google_places: 'Google Maps',
  gremios_camaras: 'Cámaras y gremios',
  listas_industria: 'Listas por industria',
  referido_cliente: 'Referido de cliente',
  ferias_eventos: 'Ferias y eventos',
  red_grupo: 'Red del grupo (Profit)',
  calle: 'La calle (camión rotulado)',
  linkedin: 'LinkedIn',
  anuncios_empleo: 'Anuncios de empleo',
  proveedor_no_competidor: 'Proveedor no competidor',
  retail: 'Asesor retail',
  otro: 'Otro',
}

// '03' lo asignó la app B2B: Ciudad Bolívar no tiene código en el ERP
// (Andrea, 23/nov/2026: "tenemos sucursal para el B2B también en Ciudad Bolívar").
export const SUCURSALES: Mapa = { '01': 'Caracas', '02': 'Valencia', '03': 'Ciudad Bolívar' }

// Curso 06, módulo 2: un buen prospecto cumple 4 de estos 5
export const CRITERIOS = [
  { campo: 'crit_consumo', texto: '30 o más vehículos o equipos pesados, o planta que consume lubricante cada mes' },
  { campo: 'crit_divisas', texto: 'Paga en divisas o acepta indexación a la tasa BCV del día de pago' },
  { campo: 'crit_dolor', texto: 'Dolor visible: paradas, cauchos que no rinden, aceite dudoso, proveedor que falla' },
  { campo: 'crit_zona', texto: 'Está en Caracas, Valencia, Maracay, Ciudad Bolívar o Guayana, o en una ruta que ya se despacha' },
  { campo: 'crit_decisor', texto: 'Se puede llegar al decisor técnico (jefe de mantenimiento o de flota)' },
] as const

export const TIPOS_ACTIVIDAD: Mapa = {
  llamada: 'Llamada',
  whatsapp: 'WhatsApp',
  correo: 'Correo',
  visita: 'Visita',
  reunion: 'Reunión',
  linkedin: 'LinkedIn',
  nota: 'Nota',
  diagnostico: 'Diagnóstico',
  cambio_etapa: 'Cambio de etapa',
  asignacion: 'Asignación',
  documento: 'Documento',
  muestra: 'Muestra',
  cotizacion: 'Cotización',
  compromiso: 'Compromiso',
}

// Los que registra una persona (los demás los genera la app)
export const TIPOS_GESTION = ['llamada', 'whatsapp', 'correo', 'visita', 'reunion', 'linkedin', 'diagnostico', 'nota'] as const

// Curso 08, módulo 4
export const RESULTADOS: Mapa = {
  no_disponible: 'Encargado no disponible',
  se_resistio: 'Se resistió',
  interesado: 'Interesado',
  pidio_informacion: 'Pidió información',
  agendo_reunion: 'Agendó reunión',
  convertido: 'Convertido',
  descartado: 'Descartado',
}

export const ROL_DECISION: Mapa = {
  tecnico: 'Técnico (jefe de flota o mantenimiento)',
  compras: 'Compras',
  aprobador: 'Aprueba (operaciones o finanzas)',
  influenciador: 'Influye (mecánico o jefe de taller)',
  otro: 'Otro',
}

// Curso 06, módulo 3: qué le importa a cada uno y qué le llevas
export const ARGUMENTO_DECISOR: Mapa = {
  tecnico: 'Que el equipo no se pare. Llévale diagnóstico, ficha técnica, análisis de aceite y rendimiento por km.',
  compras: 'Precio, crédito, tres cotizaciones y papeles en regla. Llévale oferta clara, registro de proveedor completo y condiciones de pago.',
  aprobador: 'Costo total y riesgo. Llévale costo por km o por hora de equipo comparado con lo que paga hoy.',
  influenciador: 'Que el producto no le dé problemas y que alguien le responda. Llévale capacitación, visitas y acceso directo.',
  otro: '',
}

export const RELACION: Mapa = {
  sin_contacto: 'Sin contacto',
  contactado: 'Contactado',
  aliado: 'Aliado',
  neutral: 'Neutral',
  opositor: 'Opositor',
}

export const PARTE_COMPROMISO: Mapa = {
  nosotros: 'Nuestro con el cliente',
  cliente: 'Del cliente',
  interno: 'Interno del equipo',
}

export const CATEGORIAS_DOC: Mapa = {
  documento: 'Documento',
  foto: 'Foto',
  cotizacion: 'Cotización',
  contrato: 'Contrato / acuerdo / NDA',
  ficha_tecnica: 'Ficha técnica',
  homologacion: 'Homologación OEM',
  minuta: 'Minuta de reunión',
  informe: 'Informe',
  auditoria_lubricacion: 'Auditoría de lubricación',
  carta_lubricacion: 'Carta de lubricación',
  carpeta_proveedor: 'Carpeta de proveedor',
  caso_exito: 'Caso de éxito / ahorro',
  analisis_aceite: 'Análisis de aceite',
  correo_adjunto: 'Adjunto de correo',
  otro: 'Otro',
}

// Agrupados por familia (el orden es el de los selectores). Maquinaria
// pesada: lista de Andrea, 23/nov/2026 (migración 0122).
export const GRUPOS_EQUIPO: { grupo: string; tipos: Mapa }[] = [
  {
    grupo: 'Vehículos',
    // Andrea, 23/nov/2026: flotas de carros, pickups y autobuses medianos y
    // grandes (migración 0124).
    tipos: {
      carro: 'Carro',
      pickup: 'Pickup',
      camion: 'Camión',
      autobus_mediano: 'Autobús mediano',
      autobus_grande: 'Autobús grande',
      cisterna: 'Cisterna',
    },
  },
  {
    grupo: 'Maquinaria pesada',
    tipos: {
      camion_articulado: 'Camión articulado',
      camion_roquero: 'Camión roquero',
      cargador_frontal: 'Cargador frontal',
      excavadora: 'Excavadora',
      retroexcavadora: 'Retroexcavadora',
      motoniveladora: 'Motoniveladora',
      compactadora_asfalto: 'Compactadora de asfalto',
      compactadora_tierra: 'Compactadora de tierra',
      tractor: 'Tractor',
      montacargas: 'Montacargas',
      maquinaria_pesada: 'Otra maquinaria pesada',
    },
  },
  {
    grupo: 'Planta y equipos fijos',
    tipos: {
      generador: 'Generador',
      compresor: 'Compresor',
      sistema_hidraulico: 'Sistema hidráulico',
      reductor: 'Reductor',
      turbina: 'Turbina',
      transformador: 'Transformador',
      bomba: 'Bomba',
    },
  },
  { grupo: 'Otro', tipos: { otro: 'Otro' } },
]

// Tipos de antes de la migración 0124: se siguen mostrando en equipos ya
// cargados, pero ya no se ofrecen para elegir.
const TIPOS_ANTERIORES: Mapa = { vehiculo_liviano: 'Vehículo liviano (otro)', autobus: 'Autobús (sin tamaño)' }

export const TIPOS_EQUIPO: Mapa = Object.assign({}, ...GRUPOS_EQUIPO.map((g) => g.tipos), TIPOS_ANTERIORES)

/** Grupos que cuentan como vehículos o como equipos en la composición de la flota. */
export const GRUPOS_FLOTA = GRUPOS_EQUIPO.filter((g) => g.grupo !== 'Otro')

// Migración 0123: componentes de maquinaria pesada (Andrea, 23/nov/2026)
export const COMPONENTES: Mapa = {
  motor: 'Motor',
  transmision: 'Transmisión (caja)',
  caja_transferencia: 'Caja de transferencia',
  convertidor_par: 'Convertidor de par',
  diferencial: 'Diferencial',
  mando_final: 'Mando final',
  mando_final_delantero: 'Mando final delantero',
  mando_final_trasero: 'Mando final trasero',
  sistema_giro: 'Sistema de giro (swing)',
  motor_traslacion: 'Motor de traslación',
  hidraulico: 'Hidráulico',
  reductor: 'Reductor',
  compresor: 'Compresor',
  turbina: 'Turbina',
  transformador: 'Transformador',
  cojinete: 'Cojinete / rodamiento',
  otro: 'Otro',
}

// Flujo de la muestra, en orden
export const ESTADOS_MUESTRA: { codigo: string; nombre: string }[] = [
  { codigo: 'programada', nombre: 'Programada' },
  { codigo: 'kit_entregado', nombre: 'Kit entregado' },
  { codigo: 'tomada', nombre: 'Tomada' },
  { codigo: 'enviada', nombre: 'Enviada al laboratorio' },
  { codigo: 'recibida_lab', nombre: 'Recibida por el laboratorio' },
  { codigo: 'resultado_cargado', nombre: 'Resultado cargado' },
  { codigo: 'interpretada', nombre: 'Interpretada' },
  { codigo: 'comunicada', nombre: 'Comunicada al cliente' },
  { codigo: 'cerrada', nombre: 'Cerrada' },
]
export const NOMBRE_ESTADO_MUESTRA: Mapa = Object.fromEntries(
  [...ESTADOS_MUESTRA.map((e) => [e.codigo, e.nombre]), ['anulada', 'Anulada']],
)

export const SEMAFORO: Mapa = { normal: 'Normal', precaucion: 'Precaución', critico: 'Crítico' }

export const ESTADOS_COTIZACION: Mapa = {
  borrador: 'Borrador',
  pendiente_aprobacion: 'Pendiente de aprobación',
  aprobada: 'Aprobada',
  enviada: 'Enviada',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  vencida: 'Vencida',
}

export const ESTADOS_PILOTO: Mapa = {
  planificado: 'Planificado',
  en_curso: 'En curso',
  exitoso: 'Exitoso',
  no_exitoso: 'No exitoso',
  cancelado: 'Cancelado',
}

export const TIPOS_MEDICION: Mapa = {
  profundidad_banda: 'Profundidad de banda (mm)',
  presion: 'Presión (psi)',
  odometro: 'Odómetro (km)',
  horometro: 'Horómetro (h)',
  intervalo_cambio: 'Intervalo de cambio',
  consumo_aceite: 'Consumo de aceite',
  costo: 'Costo',
  otro: 'Otro',
}

export const GRUPOS_PARAMETRO: Mapa = {
  viscosidad: 'Viscosidad',
  acidez_basicidad: 'Acidez / basicidad',
  desgaste: 'Metales de desgaste',
  contaminacion: 'Contaminantes',
  aditivos: 'Aditivos',
  agua: 'Agua',
  particulas: 'Partículas',
  condicion: 'Condición del aceite',
}

export function etiqueta(mapa: Mapa, v: string | null | undefined): string {
  if (!v) return '—'
  return mapa[v] ?? v
}
