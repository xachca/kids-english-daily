import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const basePath = process.env.BASE_PATH || '/kids-english-daily/'

export default defineConfig({
  base: basePath,
  plugins: [react()],
  server: { port: 5173 },
})