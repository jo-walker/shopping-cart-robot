import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { aiCursePlugin } from './server/aiCurse.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Server-side only: these keys have no VITE_ prefix, so they are never sent to the phone.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      aiCursePlugin({
        groqKey: env.GROQ_API_KEY || undefined,
        groqModel: env.GROQ_MODEL || undefined,
        groqBaseUrl: env.GROQ_BASE_URL || undefined,
        anthropicKey: env.ANTHROPIC_API_KEY || undefined,
      }),
    ],
  }
})
