import { defineConfig } from 'tsup'

const base = {
  format: ['esm', 'cjs'],
  dts: true,
  tsconfig: 'tsconfig.wrappers.json',
  target: 'es2022',
  sourcemap: true,
  clean: false,
  splitting: false,
}

export default defineConfig([
  {
    ...base,
    entry: {
      index: 'src/react/index.ts',
    },
    outDir: 'dist/react',
    external: ['react', 'react-dom'],
  },
  {
    ...base,
    entry: {
      index: 'src/angular/index.ts',
    },
    outDir: 'dist/angular',
    external: ['@angular/core', '@angular/common'],
  },
])
