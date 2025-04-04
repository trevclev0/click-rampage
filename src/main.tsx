import { StrictMode } from 'react'

import { createRoot } from 'react-dom/client'

import './index.css'
import App from './App.tsx'

const appRoot = document.getElementById('root') as HTMLElement;

createRoot(appRoot).render(
  <StrictMode>
    <App />
  </StrictMode>
)
