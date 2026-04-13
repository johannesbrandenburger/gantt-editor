import Vue from '@vitejs/plugin-vue'
import VueRouter from 'unplugin-vue-router/vite'
import { libInjectCss } from 'vite-plugin-lib-inject-css'
import istanbul from 'vite-plugin-istanbul'

// Utilities
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    libInjectCss(),
    VueRouter({
      dts: 'src/typed-router.d.ts',
    }),
    Vue(),
    istanbul({
      include: 'src/**',
      extension: ['.js', '.ts', '.vue'],
      requireEnv: true,
      cypress: false,
      forceBuildInstrument: false,
    }),
  ],
  build: {
    lib: {
      entry: 'src/vue/index.ts',
      name: 'GanttEditorVueComponent',
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
      formats: ['es', 'cjs']
    },
    cssCodeSplit: false, 
    outDir: 'dist/vue',
    assetsDir: '',
    rollupOptions: {
      external: ['vue'],
      output: {
        globals: {
          vue: 'Vue',
        },
        exports: 'named',
        assetFileNames: 'style.css',
      }
    },
    emitAssets: true,
  },
  optimizeDeps: {
    exclude: [
      'vue-router',
      'unplugin-vue-router/runtime',
      'unplugin-vue-router/data-loaders',
      'unplugin-vue-router/data-loaders/basic',
    ],
  },
  define: { 'process.env': {} },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('src', import.meta.url)),
    },
    extensions: [
      '.js',
      '.json',
      '.jsx',
      '.mjs',
      '.ts',
      '.tsx',
      '.vue',
    ],
  },
  server: {
    port: 4000,
  },
})
