/**
 * plugins/index.ts
 *
 * Automatically included in `./src/main.ts`
 */

import router from '../router'

// Types
import type { App } from 'vue'

export function registerPlugins (app: App) {
  app
    .use(router)
}
