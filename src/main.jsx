import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import TermDecoderApp from './TermDecoderApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TermDecoderApp variant="web" />
  </StrictMode>,
)
