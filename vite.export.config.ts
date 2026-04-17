import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import { writeFileSync, readdirSync, mkdirSync, unlinkSync, existsSync } from 'fs'
import { resolve } from 'path'

const frameEntry = process.env.FRAME_ENTRY
const tempEntry = '.frame-export-entry.jsx'

export default defineConfig({
  plugins: [
    react(),
    svgr(),
    {
      name: 'frame-entry',
      buildStart() {
        if (!frameEntry) throw new Error('FRAME_ENTRY env var is required')
        writeFileSync(tempEntry, `
import { createRoot } from 'react-dom/client'
import ExportRoot from './src/ExportRoot'
import Frame from './${frameEntry}'
createRoot(document.getElementById('root')).render(<ExportRoot><Frame /></ExportRoot>)
`)
      },
      closeBundle() {
        if (existsSync(tempEntry)) unlinkSync(tempEntry)
      },
    },
    {
      name: 'generate-export-html',
      closeBundle() {
        mkdirSync('dist-export', { recursive: true })
        const assets = existsSync('dist-export/assets') ? readdirSync('dist-export/assets') : []
        const cssFiles = assets.filter(f => f.endsWith('.css'))
        const cssLinks = cssFiles.map(f => `    <link rel="stylesheet" href="./assets/${f}" />`).join('\n')
        writeFileSync('dist-export/index.html', `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Prototype</title>
    <link rel="stylesheet" href="https://static.rio.amazon.dev/styles/fonts/index.css">
${cssLinks}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./assets/main.js"></script>
  </body>
</html>`)
      },
    },
  ],
  base: './',
  build: {
    outDir: 'dist-export',
    rollupOptions: {
      input: { main: resolve(process.cwd(), tempEntry) },
      output: { entryFileNames: 'assets/[name].js' },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'design-system'),
      '@amzn/rio-design-components-tokens': resolve(__dirname, 'design-tokens'),
    },
  },
  define: {
    'import.meta.env.BASE_PATH': JSON.stringify('/'),
  },
})
