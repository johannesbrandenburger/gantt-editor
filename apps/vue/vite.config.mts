import Vue from '@vitejs/plugin-vue'
import istanbul from 'vite-plugin-istanbul'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    Vue(),
    istanbul({
      include: ['apps/vue/src/**', 'src/**'],
      extension: ['.js', '.ts', '.vue'],
      requireEnv: true,
      cypress: false,
      forceBuildInstrument: false,
    }),
  ],
  define: { 'process.env': {} },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../../src', import.meta.url)),
      '@app': fileURLToPath(new URL('./src', import.meta.url)),
    },
    extensions: ['.js', '.json', '.jsx', '.mjs', '.ts', '.tsx', '.vue'],
  },
  server: {
    port: 4000,
  },
})
