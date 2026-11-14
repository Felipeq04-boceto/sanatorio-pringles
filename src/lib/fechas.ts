// Fechas en hora de Argentina.
// new Date().toISOString() devuelve la fecha en UTC, que desde las 21 h
// ya es el día siguiente. Para "hoy" usar siempre estas funciones.

const ZONA = 'America/Argentina/Buenos_Aires'

/** Fecha local (AAAA-MM-DD) de un instante; por defecto, ahora. */
export function fechaLocal(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: ZONA })
}

/** Hoy en Argentina, como AAAA-MM-DD. */
export function hoyLocal(): string {
  return fechaLocal()
}

/** Suma (o resta) días a una fecha AAAA-MM-DD. */
export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + dias))
  return t.toISOString().slice(0, 10)
}
