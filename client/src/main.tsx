import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Apply stored theme immediately to prevent flash of wrong theme
const storedTheme = localStorage.getItem('pms-theme');
const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
const initialTheme = storedTheme === 'light' || storedTheme === 'dark'
  ? storedTheme
  : prefersDark ? 'dark' : 'dark';
document.documentElement.setAttribute('data-theme', initialTheme);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
