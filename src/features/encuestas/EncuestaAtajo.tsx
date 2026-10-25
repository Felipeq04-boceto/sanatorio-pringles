import { Navigate, useParams, useSearchParams } from 'react-router-dom'

// Links cortos para mandar por WhatsApp o email:
//   /e/internacion   /e/consultorio   /e/laboratorio   /e/rayos
//   /e/ecografia     /e/kinesiologia  /e/guardia       /e/administracion
// Para email, agregar ?c=email al final (por defecto se registra como WhatsApp).
const DESTINOS: Record<string, string> = {
  internacion: 'tipo=internacion',
  consultorio: 'servicio=consultorio',
  laboratorio: 'servicio=laboratorio',
  rayos: 'servicio=rayos',
  ecografia: 'servicio=ecografia',
  kinesiologia: 'servicio=kinesiologia',
  guardia: 'servicio=guardia',
  administracion: 'servicio=administracion',
}

export default function EncuestaAtajo() {
  const { destino = '' } = useParams()
  const [params] = useSearchParams()
  const clave = destino.toLowerCase()
  const base = DESTINOS[clave]
  const canal = params.get('c') === 'email' ? 'email' : 'whatsapp'
  // Si el atajo no existe, se abre la encuesta general y pregunta el tipo de atención
  return <Navigate to={base ? `/encuesta?${base}&canal=${canal}` : '/encuesta?canal=link'} replace />
}
