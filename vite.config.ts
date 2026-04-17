import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import { resolve } from 'path'

const keepDevMode = process.env.REACT_GRAB_DEV === 'true';
const basePath = process.env.BASE_PATH || '/';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({ babel: { plugins: ['./plugins/babel-plugin-jsx-source-id.cjs'] } }),
    svgr(),
  ],
  base: basePath,
  resolve: {
    alias: {
      '@': resolve(__dirname, 'design-system'),
      '@amzn/rio-design-components-tokens': resolve(__dirname, 'design-tokens'),
    }
  },
  define: {
    ...(keepDevMode ? { 'process.env.NODE_ENV': JSON.stringify('development') } : {}),
    'import.meta.env.BASE_PATH': JSON.stringify(basePath),
  },
  build: {
    minify: !keepDevMode,
  }
})
