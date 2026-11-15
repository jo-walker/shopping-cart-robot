// BOB-AI: the steering oracle. Runs inside the Vite dev server (laptop), so API keys never
// reach the phone. The phone POSTs a little context to /api/curse and gets back how many
// degrees to rotate the controls for its NEXT touch, plus a sentence to say aloud.
//
// Provider: Groq (free tier) when GROQ_API_KEY is set, else Claude when ANTHROPIC_API_KEY is.
// The AI only ever picks a rotation angle. Speed limits, STOP and the stop latch live in the
// app and are untouched; if this endpoint fails, the app falls back to a random angle.
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { z } from 'zod'

const CLAUDE_MODEL = 'claude-opus-5-5'
// Groq's production gpt-oss models (the llama-3.x ones were shut down on 2026-08-16).
const GROQ_MODELS = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b']
const GROQ_URL = 'https://api.groq.com/openai/v1'
const MIN_GAP_MS = 1000 // anyone on the venue wifi can reach the dev server: rate-limit it
const MAX_PER_HOUR = 600

const CurseSchema = z.object({
  rotation_deg: z.number().int().describe('How far to rotate the controls, 0-359. 0 = normal, 180 = backwards.'),
  reason: z.string().describe('A brainrot roast of the rider, 8 words max, no numbers or degrees.'),
})
type CurseAnswer = { rotation_deg: number; reason: string; model: string }

const INSTRUCTIONS = `You are BOB-AI, the steering oracle of Bob, a motorized shopping cart at a hackathon for stupid ideas.
Before each ride you secretly decide how many degrees to rotate the rider's joystick controls: 0 means normal, 90 means pushing forward spins the cart, 180 means everything is backwards.
"reason" is NOT about the rotation: it is a quick roast of the rider in brainrot slang, inspired by meaningless details like their initials, difficulty, past regret or the time of day.
Rules for "reason": 8 words max. Never mention degrees, angles, numbers or the rotation. Family-friendly (no swearing, nothing sexual, nothing about bodies), no emojis or hashtags. Talk to the rider as "you", but don't start with "You're". A phone reads it aloud, so short and punchy wins.
Pick a rotation at least 30 degrees away from the previous one so riders never get comfortable.`

export type CurseContext = {
  rider?: string
  difficulty?: string
  drives?: number
  regret_pct?: number
  previous?: { rotation_deg: number; regret_pct: number }[]
}

// Each call is independent, so the model would reach for the same words every time: hand it two
// at random instead.
const SLANG = ['skibidi', 'rizz', 'sigma', 'Ohio', 'aura', 'NPC', 'cooked', 'fanum tax', 'delulu', "it's giving",
  'no cap', 'fr fr', 'mid', 'bussin', 'goated', 'main character', 'lowkey', 'ate', 'touch grass', 'ratio',
  'sus', 'bruh', 'L', 'W', 'opp', 'yapping', 'rent free', 'side quest']

function pickSlang(n: number) {
  const pool = [...SLANG]
  return Array.from({ length: n }, () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
}

function riderInfo(ctx: CurseContext) {
  const now = new Date()
  const local_time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
  const slang = pickSlang(2).map((w) => `"${w}"`).join(' and ')
  return `Rider info: ${JSON.stringify({ ...ctx, local_time })}\nChoose the rotation for their next touch. Build the roast around ${slang}.`
}

// ---------- Groq (OpenAI-compatible REST) ----------
async function askGroq(key: string, model: string, ctx: CurseContext, baseUrl: string): Promise<CurseAnswer> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      model,
      // gpt-oss: Groq recommends putting all instructions in the user message, no system prompt.
      messages: [
        {
          role: 'user',
          content: `${INSTRUCTIONS}\n\nReply with JSON: {"rotation_deg": integer 0-359, "reason": string}.\n\n${riderInfo(ctx)}`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'curse',
          strict: true,
          schema: {
            type: 'object',
            properties: { rotation_deg: { type: 'integer' }, reason: { type: 'string' } },
            required: ['rotation_deg', 'reason'],
            additionalProperties: false,
          },
        },
      },
      reasoning_effort: 'low',
      include_reasoning: false,
      max_completion_tokens: 1024,
      temperature: 1,
    }),
  })
  if (!res.ok) {
    const err = new Error(`groq ${model} ${res.status}: ${(await res.text()).slice(0, 200)}`)
    ;(err as Error & { status?: number }).status = res.status
    throw err
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const parsed = CurseSchema.safeParse(JSON.parse(data.choices?.[0]?.message?.content ?? 'null'))
  if (!parsed.success) throw new Error(`groq ${model}: answer did not match the schema`)
  return { ...parsed.data, model }
}

// ---------- Claude (Anthropic SDK) ----------
async function askClaude(client: Anthropic, ctx: CurseContext): Promise<CurseAnswer> {
  const response = await client.beta.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default', // a declined request is re-run on Anthropic's recommended fallback
    output_config: { effort: 'low', format: betaZodOutputFormat(CurseSchema) },
    system: INSTRUCTIONS,
    messages: [{ role: 'user', content: riderInfo(ctx) }],
  })
  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    throw new Error(`no usable answer (stop_reason ${response.stop_reason})`)
  }
  return { ...response.parsed_output, model: response.model }
}

// ---------- HTTP plumbing ----------
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 4000) reject(new Error('body too large'))
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

/** Only pass through the few fields we expect, trimmed, so the prompt can't be stuffed. */
function sanitize(raw: unknown): CurseContext {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : undefined)
  const prev = Array.isArray(r.previous) ? r.previous.slice(-3) : []
  return {
    rider: typeof r.rider === 'string' ? r.rider.replace(/[^A-Z]/g, '').slice(0, 3) : undefined,
    difficulty: typeof r.difficulty === 'string' ? r.difficulty.replace(/[^a-z]/g, '').slice(0, 8) : undefined,
    drives: num(r.drives),
    regret_pct: num(r.regret_pct),
    previous: prev.map((p) => {
      const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>
      return { rotation_deg: num(o.rotation_deg) ?? 0, regret_pct: num(o.regret_pct) ?? 0 }
    }),
  }
}

export type AiKeys = {
  groqKey?: string
  groqModel?: string
  /** Testing only: point at a fake Groq server. */
  groqBaseUrl?: string
  anthropicKey?: string
}

export function aiCursePlugin(keys: AiKeys): Plugin {
  const groqKey = keys.groqKey || process.env.GROQ_API_KEY
  const anthropicKey = keys.anthropicKey || process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN
  const provider = groqKey ? 'groq' : anthropicKey ? 'claude' : null
  const groqModels = [...new Set([keys.groqModel, ...GROQ_MODELS].filter((m): m is string => Boolean(m)))]
  const groqBaseUrl = keys.groqBaseUrl || GROQ_URL
  let groqModelIndex = 0
  let client: Anthropic | null = null
  let lastCallAt = 0
  let hourStart = Date.now()
  let callsThisHour = 0

  async function curse(ctx: CurseContext): Promise<CurseAnswer> {
    if (provider === 'groq') {
      // If a model has been retired (Groq returns 400/404), move on to the next one.
      for (;;) {
        try {
          return await askGroq(groqKey!, groqModels[groqModelIndex], ctx, groqBaseUrl)
        } catch (err) {
          const status = (err as { status?: number }).status
          if ((status === 400 || status === 404) && groqModelIndex < groqModels.length - 1) {
            groqModelIndex++
            continue
          }
          throw err
        }
      }
    }
    client ??= new Anthropic({ apiKey: anthropicKey, timeout: 20_000, maxRetries: 1 })
    return askClaude(client, ctx)
  }

  return {
    name: 'bob-ai-curse',
    configureServer(server) {
      if (provider) server.config.logger.info(`[bob-ai] oracle on: ${provider}`)
      server.middlewares.use('/api/curse', async (req, res) => {
        if (req.method === 'GET') {
          return send(res, 200, {
            configured: Boolean(provider),
            provider,
            model: provider === 'groq' ? groqModels[groqModelIndex] : provider ? CLAUDE_MODEL : null,
          })
        }
        if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
        if (!provider) return send(res, 503, { error: 'no GROQ_API_KEY or ANTHROPIC_API_KEY in .env.local' })

        const t = Date.now()
        if (t - hourStart > 3_600_000) {
          hourStart = t
          callsThisHour = 0
        }
        if (t - lastCallAt < MIN_GAP_MS || callsThisHour >= MAX_PER_HOUR) {
          return send(res, 429, { error: 'slow down' })
        }
        lastCallAt = t
        callsThisHour++

        try {
          const ctx = sanitize(JSON.parse((await readBody(req)) || '{}'))
          const answer = await curse(ctx)
          const deg = ((Math.round(answer.rotation_deg) % 360) + 360) % 360
          send(res, 200, { rotation_deg: deg, reason: answer.reason.slice(0, 200), model: answer.model })
        } catch (err) {
          server.config.logger.warn(`[bob-ai] ${err instanceof Error ? err.message : String(err)}`)
          send(res, 502, { error: 'the oracle is unwell' })
        }
      })
    },
  }
}
