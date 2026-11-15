// Fake robot: a Foxglove WebSocket server that accepts client-published cmd_vel
// and logs it, with the same 0.5 s "no messages → halt" watchdog a real controller has.
//
//   npm run fake-robot                 # ws://0.0.0.0:8765, clientPublish enabled
//   npm run fake-robot -- --no-publish # server WITHOUT clientPublish (tests the app's check)
//   npm run fake-robot -- --port 9000
//   npm run fake-robot -- --heartbeat /cart/joint_states   # heartbeat topic, 50 Hz (this is the default)
//   npm run fake-robot -- --no-heartbeat
//   npm run fake-robot -- --sdk-only     # like the real cart's bridge: only "foxglove.sdk.v1"
// While it runs, type p + Enter to pause/resume the heartbeat (fakes a wifi stall for the hearts).
import foxglove from '@foxglove/ws-protocol' // CommonJS package: named imports fail in Node
import { WebSocketServer } from 'ws'

const { FoxgloveServer } = foxglove
const args = process.argv.slice(2)
const argValue = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined)
const port = Number(argValue('--port')) || 8765
const allowPublish = !args.includes('--no-publish')
// Default matches the real cart: its foxglove_bridge whitelists joint_states (odometry isn't
// exposed), and joint_state_broadcaster publishes at the controller rate (50 Hz).
const heartbeatTopic =
  args.includes('--no-heartbeat') ? null : (argValue('--heartbeat') ?? '/cart/joint_states')
const WATCHDOG_MS = 500
const HEARTBEAT_HZ = 50
// Newer foxglove_bridge (Foxglove SDK) speaks the same messages under this subprotocol name.
const SDK_PROTOCOL = 'foxglove.sdk.v1'
const sdkOnly = args.includes('--sdk-only')

const server = new FoxgloveServer({
  name: 'fake-robot',
  capabilities: allowPublish ? ['clientPublish'] : [],
  supportedEncodings: ['json'],
})

const log = (...parts: unknown[]) =>
  console.log(new Date().toISOString().slice(11, 23), ...parts)

let lastMsgAt = 0
let moving = false

server.on('advertise', (ch) =>
  log(`ADVERTISE id=${ch.id} topic=${ch.topic} schemaName=${ch.schemaName} encoding=${ch.encoding}`),
)
server.on('unadvertise', ({ channelId }) => log(`UNADVERTISE id=${channelId}`))
server.on('message', ({ channel, data }) => {
  const msg = JSON.parse(Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8'))
  const lin = msg.twist.linear.x as number
  const ang = msg.twist.angular.z as number
  const ageMs = Date.now() - (msg.header.stamp.sec * 1000 + msg.header.stamp.nanosec / 1e6)
  lastMsgAt = Date.now()
  moving = lin !== 0 || ang !== 0
  log(`MSG ${channel.topic} linear.x=${lin.toFixed(3)} angular.z=${ang.toFixed(3)} frame=${msg.header.frame_id} stampAge=${ageMs.toFixed(0)}ms`)
})
server.on('error', (err) => log('SERVER ERROR', err))

// Heartbeat: something the robot publishes regularly (like joint_states), so the app's
// Wi-Fi hearts can tell how fresh the link is. Only subscribed clients receive it.
let heartbeatPaused = false
if (heartbeatTopic) {
  const channelId = server.addChannel({
    topic: heartbeatTopic,
    encoding: 'json',
    schemaName: 'sensor_msgs/msg/JointState',
    schema: '',
  })
  setInterval(() => {
    if (heartbeatPaused) return
    const now = Date.now()
    const payload = Buffer.from(
      JSON.stringify({
        header: { stamp: { sec: Math.floor(now / 1000), nanosec: (now % 1000) * 1e6 }, frame_id: '' },
        name: ['rear_left_wheel_joint', 'rear_right_wheel_joint'],
        position: [0, 0],
        velocity: [0, 0],
        effort: [],
      }),
    )
    server.sendMessage(channelId, BigInt(now) * 1_000_000n, payload)
  }, 1000 / HEARTBEAT_HZ)
  server.on('subscribe', (id) => {
    if (id === channelId) log(`SUBSCRIBE ${heartbeatTopic}`)
  })
  server.on('unsubscribe', (id) => {
    if (id === channelId) log(`UNSUBSCRIBE ${heartbeatTopic}`)
  })
  process.stdin.on('data', (d) => {
    if (d.toString().trim() !== 'p') return
    heartbeatPaused = !heartbeatPaused
    log(`HEARTBEAT ${heartbeatPaused ? 'PAUSED' : 'RESUMED'} (${heartbeatTopic})`)
  })
}

// Watchdog: a moving robot that hears nothing for 0.5 s halts on its own.
setInterval(() => {
  if (moving && Date.now() - lastMsgAt > WATCHDOG_MS) {
    moving = false
    log(`WATCHDOG HALT: no cmd_vel for ${WATCHDOG_MS} ms → speeds set to 0`)
  }
}, 50)

const wss = new WebSocketServer({
  port,
  // Prefer the newer name like the real bridge.
  handleProtocols: (protocols) =>
    protocols.has(SDK_PROTOCOL) ? SDK_PROTOCOL : server.handleProtocols(protocols),
  // --sdk-only: refuse the handshake exactly like the real cart's bridge does.
  verifyClient: sdkOnly
    ? (info, accept) => {
        const offered = String(info.req.headers['sec-websocket-protocol'] ?? '').split(',').map((p) => p.trim())
        if (offered.includes(SDK_PROTOCOL)) accept(true)
        else accept(false, 400, 'Missing expected sec-websocket-protocol header')
      }
    : undefined,
})
wss.on('listening', () =>
  log(
    `fake-robot listening on ws://0.0.0.0:${port} (clientPublish ${allowPublish ? 'ON' : 'OFF'}, ` +
      `heartbeat ${heartbeatTopic ? `${heartbeatTopic} @ ${HEARTBEAT_HZ} Hz; type p + Enter to pause` : 'OFF'})`,
  ),
)
wss.on('error', (err) => {
  console.error(`fake-robot failed to start: ${err.message}`)
  process.exit(1)
})
wss.on('connection', (conn, req) => {
  const name = `${req.socket.remoteAddress}:${req.socket.remotePort}`
  log(`CONNECT ${name}`)
  conn.on('close', () => log(`DISCONNECT ${name}`))
  server.handleConnection(conn, name)
})
