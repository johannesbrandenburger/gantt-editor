import Vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// The repository name when deployed to GitHub Pages.
// Override with BASE_URL env var if the repo is renamed or hosted elsewhere.
const BASE_URL = process.env.BASE_URL ?? '/gantt-editor-vue-component/'

export default defineConfig(({ command }) => ({
  plugins: [Vue()],
  base: command === 'build' ? BASE_URL : '/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../src', import.meta.url)),
    },
    extensions: ['.js', '.json', '.jsx', '.mjs', '.ts', '.tsx', '.vue'],
  },
  server: {
    port: 4100,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
}))
