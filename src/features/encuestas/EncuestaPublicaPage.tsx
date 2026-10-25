import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase'; // TODO: ajustar a la ruta real del cliente Supabase
import {
  armarPreguntas,
  CLAVE_SERVICIO,
  CLAVES_COLUMNA,
  INSTITUCION,
  SERVICIOS_AMBULATORIOS,
  TELEFONO_CONSULTAS,
  type Pregunta,
  type Respuestas,
  type TipoAtencion,
  type Valor,
} from './encuestaConfig';

type Estado = 'inicio' | 'preguntas' | 'enviando' | 'gracias' | 'usada' | 'error';

const CARAS = [
  { v: 1, cara: '😞', etiqueta: 'Muy malo' },
  { v: 2, cara: '🙁', etiqueta: 'Malo' },
  { v: 3, cara: '😐', etiqueta: 'Regular' },
  { v: 4, cara: '🙂', etiqueta: 'Bueno' },
  { v: 5, cara: '😄', etiqueta: 'Excelente' },
];

const esTipo = (v: string | null): v is TipoAtencion => v === 'internacion' || v === 'ambulatorio';

export default function EncuestaPublicaPage() {
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';
  const canal = params.get('canal') ?? (token ? '' : 'qr_general');
  const lugar = params.get('lugar') ?? '';
  const servicioUrl = params.get('servicio');
  const servicioPrecargado =
    servicioUrl && SERVICIOS_AMBULATORIOS.includes(servicioUrl) ? servicioUrl : undefined;
  const tipoUrl = params.get('tipo');
  // Un servicio ambulatorio en el QR implica atención ambulatoria
  const tipoPrecargado: TipoAtencion | undefined = servicioPrecargado
    ? 'ambulatorio'
    : esTipo(tipoUrl)
      ? tipoUrl
      : undefined;

  const [estado, setEstado] = useState<Estado>('inicio');
  const [indice, setIndice] = useState(0);
  const [resp, setResp] = useState<Respuestas>(servicioPrecargado ? { amb_servicio: servicioPrecargado } : {});
  const [contacto, setContacto] = useState({ nombre: '', telefono: '', email: '', consiente: false });
  const [trampa, setTrampa] = useState(''); // campo oculto anti-spam
  const [mensajeError, setMensajeError] = useState('');

  const preguntas = useMemo(
    () => armarPreguntas(resp, tipoPrecargado, servicioPrecargado),
    [resp, tipoPrecargado, servicioPrecargado],
  );
  const actual: Pregunta | undefined = preguntas[indice];
  const progreso = preguntas.length ? Math.round((indice / preguntas.length) * 100) : 0;

  const responder = (id: string, valor: Valor, avanzar = true) => {
    setResp((prev) => ({ ...prev, [id]: valor }));
    if (avanzar) window.setTimeout(() => setIndice((i) => i + 1), 220);
  };

  const enviar = async () => {
    if (trampa) {
      setEstado('gracias');
      return;
    }
    const tipo = (tipoPrecargado ?? resp.tipo_atencion) as TipoAtencion;
    const idsVisibles = new Set(preguntas.map((p) => p.id));
    const respuestas: Respuestas = {};
    Object.entries(resp).forEach(([k, v]) => {
      const visible = idsVisibles.has(k) || (k === 'amb_servicio' && !!servicioPrecargado);
      if (!CLAVES_COLUMNA.includes(k) && visible && v !== undefined) respuestas[k] = v;
    });

    setEstado('enviando');
    const { error } = await supabase.rpc('enviar_encuesta', {
      p_datos: {
        token: token || null,
        canal,
        lugar,
        tipo,
        respondente: resp.respondente,
        servicio: resp[CLAVE_SERVICIO[tipo]],
        respuestas,
        csat: resp.csat,
        nps: resp.nps,
        destacar: resp.destacar ?? '',
        mejorar: resp.mejorar ?? '',
        contacto_nombre: contacto.nombre,
        contacto_telefono: contacto.telefono,
        contacto_email: contacto.email,
        consentimiento_contacto: contacto.consiente,
      },
    });

    if (!error) return setEstado('gracias');
    if (error.message.includes('ENCUESTA_YA_RESPONDIDA')) return setEstado('usada');
    setMensajeError('No se pudo enviar la encuesta. Revisá tu conexión y tocá "Enviar encuesta" de nuevo.');
    setEstado('error');
  };

  return (
    <main className="enc">
      <style>{ESTILOS}</style>
      <div className="enc-marco">
        <header className="enc-cabecera">
          <img className="enc-logo" src="/logo-sanatorio.png" alt={INSTITUCION} />
          {estado === 'preguntas' && (
            <div className="enc-barra" role="progressbar" aria-valuenow={progreso} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${progreso}%` }} />
            </div>
          )}
        </header>

        {estado === 'inicio' && (
          <section className="enc-pantalla">
            <h1>El Sanatorio te escucha</h1>
            <p className="enc-texto">
              Queremos saber cómo te sentiste con la atención que recibiste, vos o tu familiar. Lo que nos cuentes lo
              lee la Dirección y lo usamos para mejorar cada día: el trato, los tiempos, la información y la comodidad.
            </p>
            <p className="enc-texto">
              Son unas pocas preguntas, te lleva unos 3 minutos y no te pedimos tu nombre. Contanos lo bueno y también
              lo que no salió bien.
            </p>
            <button className="enc-principal" onClick={() => setEstado('preguntas')}>
              Empezar encuesta
            </button>
          </section>
        )}

        {estado === 'preguntas' && actual && (
          <section className="enc-pantalla" key={actual.id + indice}>
            <h2>{actual.texto}</h2>
            {actual.ayuda && <p className="enc-ayuda">{actual.ayuda}</p>}

            {actual.tipo === 'opcion' && (
              <div className="enc-lista">
                {actual.opciones.map((o) => (
                  <button
                    key={o.valor}
                    className={`enc-opcion ${resp[actual.id] === o.valor ? 'elegida' : ''}`}
                    onClick={() => responder(actual.id, o.valor)}
                  >
                    {o.etiqueta}
                  </button>
                ))}
              </div>
            )}

            {actual.tipo === 'escala' && (
              <>
                <div className="enc-caras">
                  {CARAS.map((c) => (
                    <button
                      key={c.v}
                      className={`enc-cara nivel-${c.v} ${resp[actual.id] === c.v ? 'elegida' : ''}`}
                      onClick={() => responder(actual.id, c.v)}
                      aria-label={`${c.v}: ${c.etiqueta}`}
                    >
                      <span className="emoji" aria-hidden="true">{c.cara}</span>
                      <span className="rotulo">{c.etiqueta}</span>
                    </button>
                  ))}
                </div>
                {actual.permiteNA && (
                  <button className="enc-secundario" onClick={() => responder(actual.id, 'na')}>
                    No corresponde
                  </button>
                )}
              </>
            )}

            {actual.tipo === 'sino' && (
              <div className="enc-lista enc-lista-horizontal">
                {[
                  { v: 'si', t: 'Sí' },
                  { v: 'no', t: 'No' },
                  ...(actual.incluirNoRecuerdo ? [{ v: 'no_recuerdo', t: 'No recuerdo' }] : []),
                ].map((o) => (
                  <button
                    key={o.v}
                    className={`enc-opcion ${resp[actual.id] === o.v ? 'elegida' : ''}`}
                    onClick={() => responder(actual.id, o.v)}
                  >
                    {o.t}
                  </button>
                ))}
              </div>
            )}

            {actual.tipo === 'nps' && (
              <>
                <div className="enc-nps">
                  {Array.from({ length: 11 }, (_, n) => (
                    <button
                      key={n}
                      className={resp.nps === n ? 'elegida' : ''}
                      onClick={() => responder('nps', n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="enc-nps-extremos">
                  <span>Nada probable</span>
                  <span>Muy probable</span>
                </div>
              </>
            )}

            {actual.tipo === 'texto' && (
              <>
                <textarea
                  rows={5}
                  maxLength={2000}
                  placeholder={actual.placeholder}
                  value={String(resp[actual.id] ?? '')}
                  onChange={(e) => responder(actual.id, e.target.value, false)}
                />
                <button className="enc-principal" onClick={() => setIndice((i) => i + 1)}>
                  {resp[actual.id] ? 'Continuar' : 'Omitir'}
                </button>
              </>
            )}

            {actual.tipo === 'contacto' && (
              <>
                <p className="enc-texto">Es opcional. Si lo dejás en blanco, no guardamos ningún dato tuyo.</p>
                <label className="enc-campo">
                  Nombre
                  <input value={contacto.nombre} onChange={(e) => setContacto({ ...contacto, nombre: e.target.value })} />
                </label>
                <label className="enc-campo">
                  Teléfono
                  <input
                    inputMode="tel"
                    value={contacto.telefono}
                    onChange={(e) => setContacto({ ...contacto, telefono: e.target.value })}
                  />
                </label>
                <label className="enc-campo">
                  Email
                  <input
                    type="email"
                    value={contacto.email}
                    onChange={(e) => setContacto({ ...contacto, email: e.target.value })}
                  />
                </label>
                <label className="enc-oculto" aria-hidden="true">
                  Sitio web
                  <input tabIndex={-1} autoComplete="off" value={trampa} onChange={(e) => setTrampa(e.target.value)} />
                </label>
                <label className="enc-consentimiento">
                  <input
                    type="checkbox"
                    checked={contacto.consiente}
                    onChange={(e) => setContacto({ ...contacto, consiente: e.target.checked })}
                  />
                  Acepto que el sanatorio use estos datos solo para comunicarse conmigo sobre esta encuesta
                  (Ley 25.326).
                </label>
                <button className="enc-principal" onClick={enviar}>
                  Enviar encuesta
                </button>
              </>
            )}

            {indice > 0 && (
              <button className="enc-volver" onClick={() => setIndice((i) => Math.max(0, i - 1))}>
                Volver a la pregunta anterior
              </button>
            )}
          </section>
        )}

        {estado === 'enviando' && (
          <section className="enc-pantalla">
            <h2>Enviando tu encuesta…</h2>
          </section>
        )}

        {estado === 'gracias' && (
          <section className="enc-pantalla">
            <h1>¡Gracias!</h1>
            {resp.int_estado === 'internado' && (
              <p className="enc-texto">
                Tu respuesta le llega al equipo del sanatorio. Si necesitás ayuda ahora, usá el timbre o avisá a
                enfermería.
              </p>
            )}
            <p className="enc-texto">
              Cada respuesta la lee la Dirección del sanatorio y la usamos para mejorar. Si tenés dudas sobre tu
              salud, comunicate al {TELEFONO_CONSULTAS}.
            </p>
          </section>
        )}

        {estado === 'usada' && (
          <section className="enc-pantalla">
            <h2>Esta encuesta ya fue respondida</h2>
            <p className="enc-texto">Recibimos tus respuestas. Gracias por tu tiempo.</p>
          </section>
        )}

        {estado === 'error' && (
          <section className="enc-pantalla">
            <h2>La encuesta no se envió</h2>
            <p className="enc-texto">{mensajeError}</p>
            <button className="enc-principal" onClick={enviar}>
              Enviar encuesta
            </button>
          </section>
        )}
      </div>
    </main>
  );
}

const ESTILOS = `
@import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap');
.enc {
  --tinta: #1C2B36; --papel: #FFFFFF; --fondo: #EFF4F3; --petroleo: #3A6B67;
  --petroleo-suave: #DCE9E7; --linea: #C5D6D3;
  min-height: 100vh; background: var(--fondo); color: var(--tinta);
  font-family: 'Atkinson Hyperlegible', system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 18px; line-height: 1.5; padding: 16px;
}
.enc * { box-sizing: border-box; }
.enc-marco { max-width: 560px; margin: 0 auto; }
.enc-cabecera { padding: 8px 4px 20px; }
.enc-logo { display: block; width: 190px; max-width: 60%; height: auto; margin: 0 0 16px; }
.enc-barra { height: 6px; background: var(--petroleo-suave); border-radius: 3px; overflow: hidden; }
.enc-barra span { display: block; height: 100%; background: var(--petroleo); transition: width .3s ease; }
.enc-pantalla { background: var(--papel); border-radius: 20px; padding: 28px 22px; border: 1px solid var(--linea); }
.enc h1 { font-size: 34px; line-height: 1.15; margin: 0 0 14px; }
.enc h2 { font-size: 25px; line-height: 1.25; margin: 0 0 18px; }
.enc-texto { margin: 0 0 22px; max-width: 60ch; }
.enc-ayuda { margin: -8px 0 18px; color: #4A5B66; font-size: 16px; }
.enc button { font: inherit; color: inherit; cursor: pointer; }
.enc button:focus-visible, .enc input:focus-visible, .enc textarea:focus-visible {
  outline: 3px solid var(--petroleo); outline-offset: 2px;
}
.enc-principal {
  width: 100%; min-height: 56px; border: 0; border-radius: 14px;
  background: var(--petroleo); color: #fff !important; font-weight: 700; margin-top: 8px;
}
.enc-secundario, .enc-volver {
  display: block; margin: 14px auto 0; background: none; border: 0;
  text-decoration: underline; color: #4A5B66 !important; font-size: 16px; padding: 10px;
}
.enc-lista { display: grid; gap: 10px; }
.enc-lista-horizontal { grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); }
.enc-opcion {
  min-height: 56px; text-align: left; padding: 14px 16px; border-radius: 12px;
  border: 2px solid var(--linea); background: var(--papel);
}
.enc-lista-horizontal .enc-opcion { text-align: center; }
.enc-opcion.elegida { border-color: var(--petroleo); background: var(--petroleo-suave); }
.enc-caras { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
.enc-cara {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 14px 2px 10px; border-radius: 16px; border: 2px solid transparent;
}
.enc-cara .emoji { font-size: 40px; line-height: 1; }
.enc-cara .rotulo { font-size: 13px; line-height: 1.2; text-align: center; }
.enc-cara.nivel-1 { background: #F6DCD6; }
.enc-cara.nivel-2 { background: #F8E7D2; }
.enc-cara.nivel-3 { background: #F3EFD3; }
.enc-cara.nivel-4 { background: #DDEEDD; }
.enc-cara.nivel-5 { background: #CFE8DF; }
.enc-cara.elegida { border-color: var(--tinta); transform: scale(1.06); }
.enc-nps { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
.enc-nps button {
  min-height: 52px; border-radius: 10px; border: 2px solid var(--linea);
  background: var(--papel); font-weight: 700;
}
.enc-nps button.elegida { background: var(--petroleo); border-color: var(--petroleo); color: #fff; }
.enc-nps-extremos { display: flex; justify-content: space-between; font-size: 14px; color: #4A5B66; margin-top: 8px; }
.enc textarea, .enc input:not([type=checkbox]) {
  width: 100%; font: inherit; padding: 12px 14px; border-radius: 12px;
  border: 2px solid var(--linea); background: var(--papel); color: var(--tinta);
}
.enc-campo { display: block; margin-bottom: 14px; font-size: 16px; font-weight: 700; }
.enc-campo input { margin-top: 6px; font-weight: 400; }
.enc-consentimiento { display: flex; gap: 10px; align-items: flex-start; font-size: 15px; margin: 6px 0 16px; }
.enc-consentimiento input { width: 22px; height: 22px; margin-top: 2px; flex: none; }
.enc-oculto { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
@media (min-width: 480px) { .enc-nps { grid-template-columns: repeat(11, 1fr); } }
@media (prefers-reduced-motion: reduce) {
  .enc-barra span { transition: none; }
  .enc-cara.elegida { transform: none; }
}
`;
