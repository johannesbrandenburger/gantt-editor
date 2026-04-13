import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    component: () => import('../pages/index.vue'),
  },
  {
    path: '/small-example',
    component: () => import('../pages/small-example.vue'),
  },
  {
    path: '/performance',
    component: () => import('../pages/performance.vue'),
  },
  {
    path: '/e2e-harness',
    component: () => import('../pages/e2e-harness.vue'),
  },
  {
    path: '/features',
    component: () => import('../pages/features.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// Workaround for https://github.com/vitejs/vite/issues/11804
router.onError((err: { message: string | string[] }, to: { fullPath: string | URL }) => {
  if (err?.message?.includes?.('Failed to fetch dynamically imported module')) {
    if (localStorage.getItem('gantt-editor:dynamic-reload')) {
      console.error('Dynamic import error, reloading page did not fix it', err)
    } else {
      console.log('Reloading page to fix dynamic import error')
      localStorage.setItem('gantt-editor:dynamic-reload', 'true')
      location.assign(to.fullPath)
    }
  } else {
    console.error(err)
  }
})

router.isReady().then(() => {
  localStorage.removeItem('gantt-editor:dynamic-reload')
})

export default router
