import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://chwcytrexetekcryndqy.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNod2N5dHJleGV0ZWtjcnluZHF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MTc2MTQsImV4cCI6MjA5Mjk5MzYxNH0.t5sIBevnObkVtsxJ1aIdo2Tyo9wq_CboWJSjBvcL6vc'
const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

// ── Tipos base ──────────────────────────────────────────────
export type UserRole = 
  'admin' | 
  'rrhh' | 
  'empleado' | 
  'administrativo' |
  'enfermeria' | 
  'instrumentadora' |
  'referente_empleados' |
  'referente_enfermeria' |
  'referente_instrumentadores' |
  'mediador' |
  'lectura'

export type Usuario = {
  id: string
  nombre: string
  apellido: string
  email: string
  rol: UserRole
  activo: boolean
  created_at: string
}

export type Sector = {
  id: string
  nombre: string
  descripcion: string | null
}

export type Cargo = {
  id: string
  nombre: string
  categoria: string | null
  salario_base: number | null
}

export type EmpleadoEstado = 'activo' | 'licencia' | 'suspendido' | 'egresado'
export type TipoContrato = 'planta_permanente' | 'contrato' | 'guardia' | 'pasantia' | 'otro'

export type Empleado = {
  id: string
  legajo: string
  nombre: string
  apellido: string
  dni: string
  cuil: string | null
  fecha_nacimiento: string | null
  email: string | null
  telefono: string | null
  direccion: string | null
  sector_id: string | null
  cargo_id: string | null
  tipo_contrato: TipoContrato | null
  fecha_ingreso: string
  fecha_egreso: string | null
  estado: EmpleadoEstado
  foto_url: string | null
  created_at: string
  updated_at: string
  // Joins
  sectores?: Sector
  cargos?: Cargo
}

export type TipoTurno = 'manana' | 'tarde' | 'noche' | 'guardia_24' | 'guardia_12' | 'franco'
export type EstadoTurno = 'programado' | 'presente' | 'ausente' | 'justificado' | 'feriado'

export type Turno = {
  id: string
  empleado_id: string
  fecha: string
  hora_entrada_programada: string | null
  hora_salida_programada: string | null
  hora_entrada_real: string | null
  hora_salida_real: string | null
  tipo_turno: TipoTurno | null
  estado: EstadoTurno
  observaciones: string | null
  es_reemplazo: boolean | null
  reemplaza_empleado_id: string | null
  empleados?: Pick<Empleado, 'nombre' | 'apellido' | 'legajo'>
}

export type TipoLicencia = 'vacaciones' | 'enfermedad' | 'maternidad' | 'paternidad' | 'estudio' | 'duelo' | 'sin_goce' | 'otra'
export type EstadoLicencia = 'pendiente' | 'aprobada' | 'rechazada' | 'cancelada' | 'archivada'

export type Licencia = {
  id: string
  empleado_id: string
  tipo_licencia: TipoLicencia
  fecha_inicio: string
  fecha_fin: string
  dias_tomados: number
  motivo: string | null
  estado: EstadoLicencia
  aprobado_por: string | null
  created_at: string
  empleados?: Pick<Empleado, 'nombre' | 'apellido' | 'legajo'>
}

export type Capacitacion = {
  id: string
  nombre: string
  descripcion: string | null
  institucion: string | null
  horas: number | null
  tipo: 'obligatoria' | 'optativa' | 'certificacion' | 'recertificacion' | null
}

export type Mediacion = {
  id: string
  empleado_id: string
  tipo_conflicto: string | null
  fecha: string
  descripcion: string | null
  intervinientes: string | null
  resolucion: string | null
  estado: 'abierto' | 'en_proceso' | 'cerrado' | 'derivado'
  mediador_id: string | null
  confidencial: boolean
  created_at: string
  empleados?: Pick<Empleado, 'nombre' | 'apellido' | 'legajo'>
}

// ── Tipos de Insumos ───────────────────────────────────────
export type CategoriaInsumo = {
  id: string
  nombre: string
  tipo: 'gas_medicinal' | 'medicamento' | 'descartable' | 'limpieza' | 'equipamiento' | 'otro'
  descripcion: string | null
}

export type Proveedor = {
  id: string
  razon_social: string
  cuit: string | null
  contacto_nombre: string | null
  contacto_telefono: string | null
  contacto_email: string | null
  direccion: string | null
  categoria: string | null
  estado: 'activo' | 'inactivo' | 'suspendido'
  notas: string | null
}

export type Insumo = {
  id: string
  nombre: string
  descripcion: string | null
  categoria_id: string
  unidad_medida: string
  stock_actual: number
  stock_minimo: number
  stock_maximo: number | null
  ubicacion: string | null
  requiere_serie: boolean
  controlado: boolean
  estado: 'activo' | 'descontinuado' | 'sin_stock'
  categorias_insumo?: CategoriaInsumo
}

export type TipoGas = 'oxigeno' | 'co2' | 'oxido_nitroso' | 'aire_medicinal' | 'nitrogeno' | 'mezcla'
export type EstadoTubo = 'disponible' | 'en_uso' | 'vacio' | 'en_recarga' | 'baja' | 'revision'

export type TuboGas = {
  id: string
  insumo_id: string
  numero_serie: string
  tipo_gas: TipoGas
  capacidad_m3: number | null
  estado_tubo: EstadoTubo
  proveedor_id: string | null
  fecha_vencimiento: string | null
  fecha_ultimo_recambio: string | null
  ubicacion_actual: string | null
  observaciones: string | null
  proveedores?: Pick<Proveedor, 'razon_social'>
  insumos?: Pick<Insumo, 'nombre'>
}

export type MovimientoStock = {
  id: string
  insumo_id: string
  tipo_movimiento: 'entrada' | 'salida' | 'ajuste' | 'devolucion' | 'vencimiento' | 'baja'
  cantidad: number
  stock_anterior: number
  stock_posterior: number
  fecha: string
  proveedor_id: string | null
  remito_numero: string | null
  precio_unitario: number | null
  registrado_por: string | null
  observaciones: string | null
  insumos?: Pick<Insumo, 'nombre' | 'unidad_medida'>
}

export type AlertaStock = {
  id: string
  insumo_id: string
  tipo_alerta: 'stock_minimo' | 'stock_cero' | 'vencimiento_proximo' | 'tubo_vencido' | 'sin_proveedor'
  mensaje: string
  fecha_generacion: string
  resuelta: boolean
  insumos?: Pick<Insumo, 'nombre' | 'stock_actual' | 'unidad_medida' | 'stock_minimo'>
}
