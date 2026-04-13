import { createBrowserRouter } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { E2eHarnessPage } from './pages/E2eHarnessPage'
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
  {
    path: '/e2e-harness',
    element: <E2eHarnessPage />,
  },
])
