import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    'react/index': 'src/react/index.ts',
    'angular/index': 'src/angular/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  tsconfig: 'tsconfig.wrappers.json',
  outDir: 'dist',
  target: 'es2022',
  sourcemap: true,
  clean: false,
  splitting: false,
  external: ['react', 'react-dom', '@angular/core', '@angular/common'],
})
