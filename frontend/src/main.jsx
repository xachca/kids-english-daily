import React from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Daily from './pages/Daily.jsx'
import Games from './pages/Games.jsx'
import Story from './pages/Story.jsx'
import Parent from './pages/Parent.jsx'

const router = createBrowserRouter([
  { path: '/', element: <Home/> },
  { path: '/daily/:date?', element: <Daily/> },
  { path: '/games/:date?', element: <Games/> },
  { path: '/story/:date?', element: <Story/> },
  { path: '/parent/:date?', element: <Parent/> },
], { basename: import.meta.env.BASE_URL })

createRoot(document.getElementById('root')).render(<RouterProvider router={router} />)