export const TIPO_LICENCIA: Record<string, string> = {
  vacaciones: 'Vacaciones', enfermedad: 'Enfermedad', maternidad: 'Maternidad',
  paternidad: 'Paternidad', estudio: 'Estudio', duelo: 'Duelo',
  sin_goce: 'Sin goce de sueldo', otra: 'Otra',
}

export const TIPO_MEDIACION: Record<string, string> = {
  laboral: 'Conflicto laboral',
  interpersonal: 'Conflicto interpersonal',
  disciplinario: 'Disciplinario',
  reclamo: 'Reclamo',
  evento_adverso: 'Evento adverso',
  disconformidad: 'Disconformidad',
  otro: 'Otro',
}

export const ESTADO_MED_BADGE: Record<string, 'amber' | 'blue' | 'green' | 'slate'> = {
  abierto: 'amber', en_proceso: 'blue', cerrado: 'green', derivado: 'slate',
}

export const ESTADO_MED_LABEL: Record<string, string> = {
  abierto: 'Abierto', en_proceso: 'En proceso', cerrado: 'Cerrado', derivado: 'Derivado',
}
