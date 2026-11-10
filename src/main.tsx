import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// @ts-expect-error AdminApp is intentionally kept as JSX while the client remains TypeScript.
import AdminApp from './AdminApp.jsx'
import './index.css'

const RootApp = window.location.pathname.startsWith('/admin') ? AdminApp : App

createRoot(document.getElementById('root')!).render(<StrictMode><RootApp /></StrictMode>)
