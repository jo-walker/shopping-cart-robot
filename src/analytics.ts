import * as amplitude from '@amplitude/analytics-browser'

// Put VITE_AMPLITUDE_KEY=<your project API key> in .env.local at the repo root (git-ignored)
// and restart the dev server. Without a key, analytics is simply off.
// Browser API keys are meant to be public; .env.local just keeps it out of git.
const KEY: string | undefined = import.meta.env.VITE_AMPLITUDE_KEY

let on = false

export function initAnalytics() {
  if (on || !KEY) return
  try {
    amplitude.init(KEY, {
      // Only the events we send ourselves, plus sessions: no click, form or page-view capture.
      autocapture: {
        sessions: true,
        pageViews: false,
        formInteractions: false,
        fileDownloads: false,
        attribution: false,
        elementInteractions: false,
        pageUrlEnrichment: false, // don't attach the page URL (your laptop's LAN address) to every event
      },
      remoteConfig: { fetchRemoteConfig: false },
      flushIntervalMillis: 1000, // shows up in Live Events within a second or two
    })
    on = true
  } catch {
    /* analytics must never break the app */
  }
}

export const analyticsOn = () => on

/** Added to every event (e.g. rider initials, experiment group) until changed. */
let context: Record<string, unknown> = {}
export function setAnalyticsContext(next: Record<string, unknown>) {
  context = next
}

/** Fire-and-forget. Always called AFTER any stop/start, never before. */
export function track(event: string, props?: Record<string, unknown>) {
  if (!on) return
  try {
    amplitude.track(event, { ...context, ...props })
  } catch {
    /* ignore */
  }
}
