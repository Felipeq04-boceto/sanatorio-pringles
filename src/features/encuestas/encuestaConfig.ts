// Configuración de la encuesta de satisfacción.
// Para agregar, quitar o reordenar preguntas se edita solo este archivo.

export type TipoAtencion = 'internacion' | 'ambulatorio';
export type Valor = string | number;
export type Respuestas = Record<string, Valor | undefined>;

export interface Opcion {
  valor: string;
  etiqueta: string;
}

interface Base {
  id: string;
  texto: string;
  ayuda?: string;
  mostrarSi?: (r: Respuestas) => boolean;
}

export type Pregunta =
  | (Base & { tipo: 'opcion'; opciones: Opcion[] })
  | (Base & { tipo: 'escala'; permiteNA?: boolean })
  | (Base & { tipo: 'sino'; incluirNoRecuerdo?: boolean })
  | (Base & { tipo: 'nps' })
  | (Base & { tipo: 'texto'; placeholder?: string })
  | (Base & { tipo: 'contacto' });

export const INSTITUCION = 'Sanatorio Integral de la Comunidad';
export const TELEFONO_CONSULTAS = '2922 450238';

// Claves que no van dentro del JSON "respuestas" sino en columnas propias
export const CLAVES_COLUMNA = ['respondente', 'tipo_atencion', 'csat', 'nps', 'destacar', 'mejorar'];
export const CLAVE_SERVICIO: Record<TipoAtencion, string> = {
  ambulatorio: 'amb_servicio',
  internacion: 'int_sector',
};

const esServicio = (r: Respuestas, ...servicios: string[]) =>
  servicios.includes(String(r.amb_servicio));

// ---------------------------------------------------------------------
// Inicio (común)
// ---------------------------------------------------------------------
export const INICIO: Pregunta[] = [
  {
    id: 'respondente',
    tipo: 'opcion',
    texto: '¿Quién responde la encuesta?',
    opciones: [
      { valor: 'paciente', etiqueta: 'Soy el paciente' },
      { valor: 'familiar', etiqueta: 'Soy familiar o acompañante' },
    ],
  },
  {
    id: 'tipo_atencion',
    tipo: 'opcion',
    texto: '¿Qué tipo de atención recibió?',
    ayuda: 'Si ingresó por guardia y quedó internado, elegí internación.',
    opciones: [
      { valor: 'internacion', etiqueta: 'Estuvo internado' },
      { valor: 'ambulatorio', etiqueta: 'Consulta, guardia, estudio o práctica sin internación' },
    ],
  },
];

// ---------------------------------------------------------------------
// Rama ambulatoria
// ---------------------------------------------------------------------
export const AMBULATORIO: Pregunta[] = [
  {
    id: 'amb_servicio',
    tipo: 'opcion',
    texto: '¿Qué servicio utilizó?',
    opciones: [
      { valor: 'consultorio', etiqueta: 'Consultorio externo' },
      { valor: 'guardia', etiqueta: 'Guardia' },
      { valor: 'laboratorio', etiqueta: 'Laboratorio' },
      { valor: 'rayos', etiqueta: 'Rayos' },
      { valor: 'ecografia', etiqueta: 'Ecografía' },
      { valor: 'kinesiologia', etiqueta: 'Kinesiología' },
      { valor: 'administracion', etiqueta: 'Administración' },
      { valor: 'otro', etiqueta: 'Otro' },
    ],
  },
  {
    id: 'amb_turno',
    tipo: 'escala',
    texto: 'Facilidad para conseguir el turno',
    mostrarSi: (r) => !esServicio(r, 'guardia', 'administracion'),
  },
  { id: 'amb_recepcion', tipo: 'escala', texto: 'Atención en recepción' },
  { id: 'amb_espera', tipo: 'escala', texto: 'Tiempo de espera hasta ser atendido' },
  {
    id: 'amb_trato_profesional',
    tipo: 'escala',
    texto: 'Trato y amabilidad del profesional que lo atendió',
    mostrarSi: (r) => !esServicio(r, 'administracion'),
  },
  {
    id: 'amb_informacion',
    tipo: 'escala',
    texto: 'Claridad de la explicación sobre su problema de salud o su estudio',
    mostrarSi: (r) => !esServicio(r, 'administracion'),
  },
  {
    id: 'adm_trato',
    tipo: 'escala',
    texto: 'Trato y amabilidad del personal administrativo',
    mostrarSi: (r) => esServicio(r, 'administracion'),
  },
  {
    id: 'adm_claridad',
    tipo: 'escala',
    texto: 'Claridad de la información sobre su trámite (autorizaciones, pagos, documentación)',
    mostrarSi: (r) => esServicio(r, 'administracion'),
  },
  {
    id: 'adm_resuelto',
    tipo: 'sino',
    texto: '¿Pudieron resolver su trámite?',
    mostrarSi: (r) => esServicio(r, 'administracion'),
  },
  {
    id: 'amb_enfermeria',
    tipo: 'escala',
    texto: 'Atención de enfermería o de los técnicos',
    permiteNA: true,
    mostrarSi: (r) => esServicio(r, 'guardia', 'laboratorio', 'rayos', 'ecografia', 'otro'),
  },
  { id: 'amb_limpieza', tipo: 'escala', texto: 'Limpieza y comodidad de las instalaciones' },
  { id: 'amb_privacidad', tipo: 'escala', texto: 'Respeto por su privacidad e intimidad' },
  {
    id: 'seg_identificacion',
    tipo: 'sino',
    incluirNoRecuerdo: true,
    texto: '¿Le confirmaron su nombre y sus datos antes del estudio, la extracción, el procedimiento o la medicación?',
    mostrarSi: (r) => esServicio(r, 'guardia', 'laboratorio', 'rayos', 'ecografia', 'kinesiologia'),
  },
  {
    id: 'seg_higiene_manos',
    tipo: 'sino',
    incluirNoRecuerdo: true,
    texto: '¿Vio al personal higienizarse las manos antes de atenderlo?',
    mostrarSi: (r) => !esServicio(r, 'administracion'),
  },
  {
    id: 'amb_resultados',
    tipo: 'escala',
    texto: 'Facilidad para recibir o retirar los resultados',
    permiteNA: true,
    mostrarSi: (r) => esServicio(r, 'laboratorio', 'rayos', 'ecografia'),
  },
  {
    id: 'amb_indicaciones',
    tipo: 'escala',
    texto: 'Al irse, ¿le quedó claro qué hacer después? (tratamiento, estudios, próximo control)',
    mostrarSi: (r) => !esServicio(r, 'administracion'),
  },
];

// ---------------------------------------------------------------------
// Rama internación
// ---------------------------------------------------------------------
export const INTERNACION: Pregunta[] = [
  {
    id: 'int_estado',
    tipo: 'opcion',
    texto: '¿El paciente sigue internado o ya recibió el alta?',
    opciones: [
      { valor: 'internado', etiqueta: 'Sigue internado' },
      { valor: 'alta', etiqueta: 'Ya recibió el alta' },
    ],
  },
  {
    id: 'int_habitacion',
    tipo: 'texto',
    texto: 'Si querés que te visitemos ahora, ¿en qué habitación estás?',
    placeholder: 'Número de habitación (opcional)',
    mostrarSi: (r) => r.int_estado === 'internado',
  },
  {
    id: 'int_sector',
    tipo: 'opcion',
    texto: '¿En qué sector estuvo internado?',
    opciones: [
      { valor: 'clinica_medica', etiqueta: 'Clínica médica' },
      { valor: 'cirugia', etiqueta: 'Cirugía' },
      { valor: 'terapia_intensiva', etiqueta: 'Terapia intensiva' },
      { valor: 'maternidad', etiqueta: 'Maternidad' },
      { valor: 'pediatria', etiqueta: 'Pediatría' },
      { valor: 'otro', etiqueta: 'Otro' },
    ],
  },
  {
    id: 'int_dias',
    tipo: 'opcion',
    texto: '¿Cuántos días lleva o duró la internación?',
    opciones: [
      { valor: '1-2', etiqueta: '1 a 2 días' },
      { valor: '3-7', etiqueta: '3 a 7 días' },
      { valor: '7+', etiqueta: 'Más de 7 días' },
    ],
  },
  {
    id: 'int_ingreso',
    tipo: 'opcion',
    texto: '¿Cómo fue el ingreso?',
    opciones: [
      { valor: 'programado', etiqueta: 'Programado' },
      { valor: 'guardia', etiqueta: 'Por guardia' },
    ],
  },
  { id: 'int_ingreso_tramites', tipo: 'escala', texto: 'Agilidad y trato en el ingreso y los trámites' },
  { id: 'int_enfermeria_trato', tipo: 'escala', texto: 'Trato y amabilidad del personal de enfermería' },
  { id: 'int_respuesta_llamado', tipo: 'escala', texto: 'Rapidez de respuesta cuando llamó o necesitó ayuda' },
  { id: 'int_medicos', tipo: 'escala', texto: 'Trato y dedicación de los médicos' },
  {
    id: 'int_informacion',
    tipo: 'escala',
    texto: 'Claridad de la información sobre el diagnóstico, los estudios y el tratamiento',
  },
  { id: 'int_info_familia', tipo: 'escala', texto: 'Información brindada a la familia' },
  { id: 'int_dolor', tipo: 'escala', texto: 'Control del dolor y del malestar', permiteNA: true },
  { id: 'int_limpieza', tipo: 'escala', texto: 'Limpieza de la habitación y del baño' },
  { id: 'int_descanso', tipo: 'escala', texto: 'Comodidad y descanso (ruido, luz, cama)' },
  { id: 'int_comidas', tipo: 'escala', texto: 'Calidad, temperatura y variedad de las comidas', permiteNA: true },
  { id: 'int_privacidad', tipo: 'escala', texto: 'Respeto por la privacidad y la intimidad' },
  {
    id: 'seg_identificacion',
    tipo: 'sino',
    incluirNoRecuerdo: true,
    texto: '¿Le confirmaron su nombre y sus datos (o revisaron su pulsera) antes de cada procedimiento, estudio o medicación?',
  },
  {
    id: 'seg_higiene_manos',
    tipo: 'sino',
    incluirNoRecuerdo: true,
    texto: '¿Vio al personal higienizarse las manos antes de atenderlo?',
  },
  {
    id: 'alta_indicaciones',
    tipo: 'escala',
    texto: 'Al alta, ¿le explicaron con claridad la medicación, los cuidados y cuándo volver a control?',
    mostrarSi: (r) => r.int_estado === 'alta',
  },
  {
    id: 'alta_sabe_a_quien_llamar',
    tipo: 'sino',
    texto: '¿Sabía a quién llamar si tenía dudas o síntomas después del alta?',
    mostrarSi: (r) => r.int_estado === 'alta',
  },
];

// ---------------------------------------------------------------------
// Cierre (común)
// ---------------------------------------------------------------------
export const CIERRE: Pregunta[] = [
  { id: 'csat', tipo: 'escala', texto: 'En general, ¿qué tan satisfecho quedó con la atención?' },
  {
    id: 'nps',
    tipo: 'nps',
    texto: 'Del 0 al 10, ¿qué probabilidad hay de que recomiende el sanatorio a un familiar o amigo?',
  },
  {
    id: 'destacar',
    tipo: 'texto',
    texto: '¿Hay alguna persona del equipo que quiera destacar? ¿Por qué?',
    placeholder: 'Nombre o sector, y qué hizo bien',
  },
  {
    id: 'mejorar',
    tipo: 'texto',
    texto: '¿Qué deberíamos mejorar?',
    placeholder: 'Contanos lo que haya fallado o lo que cambiarías',
  },
  { id: 'contacto', tipo: 'contacto', texto: '¿Querés que nos comuniquemos con vos?' },
];

export const SERVICIOS_AMBULATORIOS: string[] = (() => {
  const p = AMBULATORIO[0];
  return p.tipo === 'opcion' ? p.opciones.map((o) => o.valor) : [];
})();

export function armarPreguntas(
  r: Respuestas,
  tipoPrecargado?: TipoAtencion,
  servicioPrecargado?: string,
): Pregunta[] {
  const tipo = (tipoPrecargado ?? r.tipo_atencion) as TipoAtencion | undefined;
  const inicio = tipoPrecargado ? INICIO.filter((p) => p.id !== 'tipo_atencion') : INICIO;
  const ramaBase = tipo === 'internacion' ? INTERNACION : tipo === 'ambulatorio' ? AMBULATORIO : [];
  const rama = servicioPrecargado ? ramaBase.filter((p) => p.id !== 'amb_servicio') : ramaBase;
  const cierre = tipo ? CIERRE : [];
  return [...inicio, ...rama, ...cierre].filter((p) => !p.mostrarSi || p.mostrarSi(r));
}
