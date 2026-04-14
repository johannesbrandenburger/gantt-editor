import fs from 'node:fs'
import path from 'node:path'

const distDir = path.resolve('dist')
const srcTypesDir = path.join(distDir, 'src')
const vuePkgDir = path.join(distDir, 'vue')

const copyDir = (from, to) => {
  if (!fs.existsSync(from)) return
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const fromPath = path.join(from, entry.name)
    const toPath = path.join(to, entry.name)
    if (entry.isDirectory()) {
      copyDir(fromPath, toPath)
      continue
    }
    fs.copyFileSync(fromPath, toPath)
  }
}

fs.mkdirSync(vuePkgDir, { recursive: true })
copyDir(path.join(srcTypesDir, 'components'), path.join(vuePkgDir, 'components'))
copyDir(path.join(srcTypesDir, 'vue'), path.join(vuePkgDir, 'vue'))

const vueTypeEntry = [
  "export * from './vue/index'",
  "export { default } from './vue/index'",
  '',
].join('\n')

fs.writeFileSync(path.join(vuePkgDir, 'index.d.ts'), vueTypeEntry)
fs.writeFileSync(path.join(vuePkgDir, 'index.d.cts'), vueTypeEntry)
