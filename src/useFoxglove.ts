import { useCallback, useEffect, useRef, useState } from 'react'
import { FoxgloveClient, type IWebSocket } from '@foxglove/ws-protocol'
import type { TwistStamped } from './twistStamped'

export type ConnStatus =
  | { kind: 'disconnected'; reason?: string }
  | { kind: 'connecting' }
  | { kind: 'connected'; topic: string }
  | { kind: 'error'; message: string }

export const ROBOT_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
export const topicFor = (robotName: string) => `/${robotName}/joy_teleop/cmd_vel`

const CONNECT_TIMEOUT_MS = 5000
const encoder = new TextEncoder()
// Newer foxglove_bridge builds (on the Foxglove SDK, like the real cart's) only accept
// "foxglove.sdk.v1" and answer 400 to anything else; older ones only "foxglove.websocket.v1".
// Offer both, newest first; the server picks the one it speaks. Same message format either way.
const SUBPROTOCOLS = ['foxglove.sdk.v1', FoxgloveClient.SUPPORTED_SUBPROTOCOL]
const isZero = (m: TwistStamped) => m.twist.linear.x === 0 && m.twist.angular.z === 0

/** off: no heartbeat topic set · missing: set, but the bridge doesn't have it · subscribed: listening */
export type HeartbeatState = 'off' | 'missing' | 'subscribed'

/** Raw link-health signals, read from refs (cheap enough to poll). */
export type LinkSignals = {
  bufferedAmount: number
  dropped: number
  heartbeat: HeartbeatState
  /** performance.now() when a heartbeat message last arrived, or null if never. */
  heardAt: number | null
}

/**
 * Connection to a Foxglove bridge that publishes TwistStamped on /<robot>/joy_teleop/cmd_vel,
 * and optionally listens to one robot topic as a heartbeat for the Wi-Fi hearts.
 * `onConnectionLost` fires if an established connection drops (so the caller can latch STOP
 * and start reconnecting); `onConnected` fires each time a connection is ready to publish.
 */
export function useFoxglove(onConnectionLost: () => void, onConnected?: () => void) {
  const [status, setStatus] = useState<ConnStatus>({ kind: 'disconnected' })
  const [serverStatus, setServerStatus] = useState<string | null>(null)
  const [stats, setStats] = useState<{ sent: number; dropped: number; last: TwistStamped | null }>(
    { sent: 0, dropped: 0, last: null },
  )

  const clientRef = useRef<FoxgloveClient | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const channelRef = useRef<number | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const droppedRef = useRef(0)
  // Heartbeat messages can arrive at 50 Hz on a real robot: they only ever touch refs,
  // never state, so they can't re-render the play screen.
  const hbStateRef = useRef<HeartbeatState>('off')
  const hbChannelRef = useRef<number | null>(null)
  const hbSubRef = useRef<number | null>(null)
  const hbHeardAtRef = useRef<number | null>(null)
  const onLostRef = useRef(onConnectionLost)
  const onConnectedRef = useRef(onConnected)
  useEffect(() => {
    onLostRef.current = onConnectionLost
    onConnectedRef.current = onConnected
  })

  /** Forget the current client WITHOUT touching status; its late events are then ignored. */
  const release = useCallback(() => {
    clearTimeout(timeoutRef.current)
    const client = clientRef.current
    clientRef.current = null
    wsRef.current = null
    channelRef.current = null
    hbChannelRef.current = null
    hbSubRef.current = null
    hbHeardAtRef.current = null
    client?.close()
  }, [])

  const disconnect = useCallback(() => {
    release()
    setStatus({ kind: 'disconnected' })
  }, [release])

  const connect = useCallback(
    (url: string, robotName: string, heartbeatTopic = '') => {
      release()
      setServerStatus(null)
      setStats({ sent: 0, dropped: 0, last: null }) // counters are per connection
      droppedRef.current = 0
      hbStateRef.current = heartbeatTopic ? 'missing' : 'off'
      const topic = topicFor(robotName)

      let ws: WebSocket
      try {
        ws = new WebSocket(url, SUBPROTOCOLS)
      } catch (err) {
        setStatus({ kind: 'error', message: `Bad address: ${(err as Error).message}` })
        return
      }
      // Cast: the library's IWebSocket typing predates TS 5.7's stricter ArrayBuffer generics;
      // the browser WebSocket is exactly what it expects at runtime.
      const client = new FoxgloveClient({ ws: ws as unknown as IWebSocket })
      clientRef.current = client
      wsRef.current = ws
      setStatus({ kind: 'connecting' })

      // Every handler checks this, so a previous socket's late events can't clobber state.
      const isCurrent = () => clientRef.current === client
      const fail = (message: string) => {
        if (!isCurrent()) return
        release()
        setStatus({ kind: 'error', message })
      }

      timeoutRef.current = setTimeout(() => fail(`No answer from ${url} after 5 s`), CONNECT_TIMEOUT_MS)

      client.on('serverInfo', (info) => {
        if (!isCurrent()) return
        clearTimeout(timeoutRef.current)
        if (!info.capabilities.includes('clientPublish')) {
          fail(`"${info.name}" does not accept client messages (no clientPublish capability)`)
          return
        }
        channelRef.current = client.advertise({
          topic,
          encoding: 'json',
          schemaName: 'geometry_msgs/msg/TwistStamped',
        })
        setStatus({ kind: 'connected', topic })
        onConnectedRef.current?.()
      })

      // Heartbeat: subscribe to the robot topic once the bridge advertises it.
      client.on('advertise', (channels) => {
        if (!isCurrent() || !heartbeatTopic || hbSubRef.current !== null) return
        const ch = channels.find((c) => c.topic === heartbeatTopic)
        if (!ch) return
        hbChannelRef.current = ch.id
        hbSubRef.current = client.subscribe(ch.id)
        hbStateRef.current = 'subscribed'
      })
      client.on('unadvertise', (ids) => {
        if (!isCurrent() || hbChannelRef.current === null || !ids.includes(hbChannelRef.current)) return
        hbChannelRef.current = null
        hbSubRef.current = null
        hbHeardAtRef.current = null
        hbStateRef.current = 'missing'
      })
      client.on('message', (event) => {
        // Arrival time on THIS device's clock: no dependence on the robot's clock being right.
        if (isCurrent() && event.subscriptionId === hbSubRef.current) hbHeardAtRef.current = performance.now()
      })

      // How a real bridge reports problems, e.g. a rejected advertise.
      client.on('status', (s) => {
        if (isCurrent()) setServerStatus(`${['info', 'warning', 'error'][s.level] ?? s.level}: ${s.message}`)
      })

      // A failed connect fires 'error' then 'close'; the close must not hide the error.
      client.on('error', () => {
        if (isCurrent() && channelRef.current === null) fail(`Could not connect to ${url}`)
      })

      client.on('close', (event) => {
        if (!isCurrent()) return
        const wasConnected = channelRef.current !== null
        release()
        setStatus({ kind: 'disconnected', reason: `Connection lost (code ${event.code})` })
        if (wasConnected) onLostRef.current()
      })
    },
    [release],
  )

  /** Called by the send loop every 100 ms. Never throws; counts what it couldn't send. */
  const send = useCallback((msg: TwistStamped) => {
    const client = clientRef.current
    const ws = wsRef.current
    const channelId = channelRef.current
    const open = client && ws && channelId !== null && ws.readyState === WebSocket.OPEN
    // If the socket is backing up, skip motion commands so they don't pile up and arrive late.
    // Zeros are never skipped: the last thing to arrive should be a stop.
    if (!open || (!isZero(msg) && ws.bufferedAmount > 0)) {
      droppedRef.current += 1
      setStats((s) => ({ ...s, dropped: s.dropped + 1 }))
      return
    }
    client.sendMessage(channelId, encoder.encode(JSON.stringify(msg)))
    setStats((s) => ({ ...s, sent: s.sent + 1, last: msg }))
  }, [])

  const linkSignals = useCallback(
    (): LinkSignals => ({
      bufferedAmount: wsRef.current?.bufferedAmount ?? 0,
      dropped: droppedRef.current,
      heartbeat: hbStateRef.current,
      heardAt: hbHeardAtRef.current,
    }),
    [],
  )

  useEffect(() => release, [release]) // close on unmount

  return { status, serverStatus, stats, connect, disconnect, send, linkSignals }
}
