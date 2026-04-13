import { createBrowserRouter } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { SmallExamplePage } from './pages/SmallExamplePage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />,
  },
  {
    path: '/small-example',
    element: <SmallExamplePage />,
  },
])
