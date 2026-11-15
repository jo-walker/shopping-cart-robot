import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Bundled, not loaded from Google Fonts: the venue wifi may have no internet.
import '@fontsource/press-start-2p'
import 'nes.css/css/nes.min.css'
import './index.css'
import App from './App.tsx'
import { initAnalytics } from './analytics'

initAnalytics() // no-op without VITE_AMPLITUDE_KEY

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
