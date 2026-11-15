import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { AppRouter } from './AppRouter'
import { registerSW } from 'virtual:pwa-register'

// Busca versiones nuevas de la app cada 30 minutos y cada vez que se vuelve a abrir.
// Cuando encuentra una, la instala y recarga la página sola.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registro) {
    if (!registro) return
    const buscar = () => { if (navigator.onLine) registro.update().catch(() => {}) }
    window.setInterval(buscar, 30 * 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') buscar()
    })
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
)
