import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useGameStore } from './store/useGameStore'

// dev-only debug handle for console/automation play-testing
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__mc = useGameStore

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
