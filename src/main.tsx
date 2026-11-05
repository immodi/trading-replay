import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { FadeCalculatorPage } from './components/fade/FadeCalculatorPage.tsx'

const path = window.location.pathname.replace(/\/+$/, '')
const isFadeCalculator = path === '/fade-calculator'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isFadeCalculator ? <FadeCalculatorPage /> : <App />}
  </StrictMode>,
)
