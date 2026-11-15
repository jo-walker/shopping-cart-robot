# Shopping Cart Robot (Bob)

A phone web app that drives the cart. It publishes
`geometry_msgs/msg/TwistStamped` (JSON) to `/<robot>/joy_teleop/cmd_vel` through
`foxglove_bridge`, wrapped in a silly arcade UI.

## Run it

Needs Node 22.18+ (the fake robot runs TypeScript directly).

```bash
cd shopping-cart-robot
npm install
npm run dev          # prints http://<laptop-ip>:5173 — open that on the phone (same wifi)
```

Windows asks whether Node may use the network: allow it on private networks, or the
phone can't reach the laptop.

On the phone, fill in **PLAYER 1**:

| Field | Value |
|---|---|
| ENTER YOUR INITIALS | three letters, for the regret leaderboard |
| DIFFICULTY | top speed: EASY 0.5 m/s, NORMAL 1.0 m/s (default), HARD 2.0 m/s. Use EASY when strangers drive. **Stupid mode always runs at HARD**, whatever this says. |
| BRIDGE | `ws://<robot-ip>:8765` (use the IP if the phone can't resolve `.local`) |
| ROBOT NAME | the robot's namespace → topic `/<name>/joy_teleop/cmd_vel` (see the carts below) |
| HEARTBEAT TOPIC | optional: `/<robot>/joint_states` (small, steady, and on the bridge's topic whitelist; odometry isn't). Never a camera or point cloud: it streams over the same wifi as the drive commands. |
| FREE PLAY | tick it to skip the insert-coin timer |

The carts (each bridge only drives its own namespace):

| Cart | BRIDGE | ROBOT NAME | HEARTBEAT TOPIC |
|---|---|---|---|
| `rpi5-16` | `ws://10.100.139.179:8765` | `jiro` | `/jiro/joint_states` |
| `rpi5-16-2` | `ws://10.100.139.228:8765` | `taro` | `/taro/joint_states` |

`rpi5-16-2`'s bridge also lists a stray `/jiro/joy_teleop/cmd_vel` (another client advertising
it). Nothing on that cart drives from it: use `taro` there.

Then **PRESS START**. Settings are remembered on the phone.

If an established connection drops, the cart stops and the app shows **SIGNAL LOST** while it
reconnects on its own (after 0.5 s, 1.5 s, then every 3 s) until it's back or you press EXIT.
After reconnecting it stays stopped until a new touch, even if a finger is still on the stick.
A failed first connect (e.g. a wrong address) shows GAME OVER instead.

The app offers both Foxglove WebSocket subprotocol names. Newer `foxglove_bridge` builds
(like the cart's) only accept `foxglove.sdk.v1` and answer `400 Bad Request` to the older
`foxglove.websocket.v1`.

Don't drive from this app and Foxglove's Teleop panel at the same time: both publish to
`joy_teleop/cmd_vel` and the commands would interleave.

## What the robot gets

- `TwistStamped`, `frame_id: base_link`, `twist.linear.x` and `twist.angular.z`
  (positive = turn left) up to the DIFFICULTY's limits: EASY 0.5 m/s / 1.0 rad/s,
  NORMAL 1.0 / 1.5, HARD 2.0 / 2.5 (the cart's own limits are 2.29 / 3.0); stupid mode always
  uses HARD's. Other fields are 0.
- `header.stamp` comes from the **phone's** clock.
- While a finger is on the stick: about 10 messages a second.
- On release, STOP, phone locked/app switched, coin time up, or connection lost:
  one zero immediately, two more 100 ms apart, then **nothing**.
- STOP latches: moving a finger that's still on the stick does nothing until you lift
  and touch again.

**The robot must stop itself when messages stop.** If the phone loses wifi, nothing
reaches the robot, zeros included. The app relies on the controller's cmd_vel timeout
(expected ~0.5 s). If the controller also rejects old stamps, a Pi without network time
may reject every command: check its clock.

The bridge must allow client publishing (`clientPublish` capability). If it doesn't,
the app shows GAME OVER with that reason.

## Checks on the robot before the demo

```bash
ros2 topic hz   /cart/joy_teleop/cmd_vel    # ~10 Hz while driving, stops after release
ros2 topic echo /cart/joy_teleop/cmd_vel    # push up → +linear.x, push right → −angular.z
```

1. Drive, then release: exactly 3 zero messages, then silence.
2. Hold the stick and press STOP: 3 zeros, and nothing more while the finger keeps moving.
3. Turn on airplane mode mid-drive: the cart stops within ~0.5 s on its own.
4. Lock the phone mid-drive: the cart stops.
5. Compare `header.stamp` with `date +%s` on the Pi: they should be within a second.

## Test without the cart

```bash
npm run fake-robot                       # fake bridge on ws://0.0.0.0:8765, logs every command
npm run fake-robot -- --no-publish       # bridge that refuses client publishing
npm run fake-robot -- --port 9000
npm run fake-robot -- --heartbeat /cart/joint_states   # heartbeat topic (this is the default, 50 Hz)
npm run fake-robot -- --no-heartbeat
npm run fake-robot -- --sdk-only         # refuse the old subprotocol, like the real cart's bridge
```

The fake robot has the same 0.5 s "no messages → halt" watchdog and prints
`WATCHDOG HALT` when it fires. Type `p` + Enter in its terminal to pause the heartbeat
(fakes a wifi stall: the hearts drain).

## The gags

- **Insert coin:** a coin buys 30 s of driving, counted only while driving. FREE PLAY turns it off.
- **Stupid mode:** each touch rotates the controls by a random angle; a roulette wheel
  shows where "up" now goes (JACKPOT near 0°, CURSED near 180°).
- **Regret meter:** how much of your pushing went the wrong way (0% normal, 100% exactly
  backwards). Shown live, per drive, and on GAME OVER.
- **Wi-Fi hearts:** freshness of the heartbeat topic (ROBOT), or phone-side signals
  (PHONE). Display only; they never stop the cart.
- Googly eyes, popups, 8-bit sounds (SND ON/OFF), GAME OVER with CONTINUE.

## BOB-AI, the stupid-mode oracle (optional)

In stupid mode, an AI secretly picks how far to rotate the controls for each touch and roasts
the rider in 8 words of brainrot slang (never about the angle); the phone shows it in a speech
balloon and reads it aloud (SND OFF silences it). It runs inside `npm run dev` on the laptop (`/api/curse`), so
the API key never reaches the phone. Add ONE of these to `.env.local` (git-ignored):

```
GROQ_API_KEY=<free key from console.groq.com>      # preferred: free tier
ANTHROPIC_API_KEY=<your Anthropic API key>         # used only if there's no Groq key
```

Restart `npm run dev`; PLAYER 1 shows `BOB-AI STUPID-MODE ORACLE: ON (GROQ)` (or CLAUDE).
The laptop needs internet.

- The app asks for the NEXT curse ahead of time, so a touch never waits on the AI. If no
  curse is ready (slow, offline, no key) the touch uses a random angle, as before.
- The AI only chooses the rotation angle. Speed limits, STOP and the stop latch are
  untouched. A/B "cursed" games stay at 180° and don't ask the AI.
- Groq: `openai/gpt-oss-20b` (falls back to `openai/gpt-oss-120b` if Groq retires it;
  override with `GROQ_MODEL=` in `.env.local`), strict JSON schema, low reasoning effort.
  Groq's free tier is about 30 requests/minute and 1,000/day; past that, touches use random.
- Claude: `claude-opus-5-5` at low effort, structured JSON output, server-side refusal
  fallback.
- The endpoint is rate-limited (1 request/s, 600/hour) because anyone on the venue wifi can
  reach the dev server.

### The voice

Phones only let a page talk after a real tap, so **PRESS START says "BOB-AI online. Prepare to be
roasted."** That unlocks speech for the rest of the game and doubles as a speaker check. If you
don't hear it: turn the volume up, check SND ON, and on an iPhone also try flipping the
ring/silent switch to ring. Tapping SND ON/OFF also unlocks the voice (silently).

- English voice (`en-US`) even on a phone set to another language.
- A new joke cuts off the one still being read, and waits a moment after cutting it off.
- The jokes are read at the touch that uses them; "Still thinking. Random it is." isn't read.

## Amplitude (optional)

Create `.env.local` in the repo root (git-ignored) with:

```
VITE_AMPLITUDE_KEY=<your Amplitude project API key>
```

Restart `npm run dev`; PLAYER 1 shows `AMPLITUDE: ON`. The phone needs internet for
events to arrive. Without a key nothing is sent.

Each rider types their initials on PLAYER 1, and each PRESS START puts the game in an A/B
test group at random: `random` (normal stupid-mode roulette) or `cursed` (every touch is
exactly backwards). GAME OVER reveals the group. Every event carries `rider` and
`experiment`.

Events: `game_started`, `bob_connected`, `drive_ended` (regret_pct, regret_m, distance_m,
rotation_deg, rotation_bucket, reason…), `roulette_spin` (rotation_bucket, verdict),
`stop_pressed`, `coin_inserted`, `game_over`. `rotation_bucket` is the rotation rounded to
45° (`000`…`315`, or `normal` outside stupid mode), so "average regret_pct by
rotation_bucket" traces the regret curve.

## Code map

- `src/useCommandLoop.ts`: the 10 Hz send loop, stop zeros and STOP latch (safety-critical)
- `src/useFoxglove.ts`: bridge connection, advertise, publish, heartbeat subscription
- `src/speeds.ts`, `src/twistStamped.ts`: stick → speeds → message
- `src/App.tsx`: wiring; `src/screens/`, `src/components/`: the arcade UI
- `server/aiCurse.ts`: BOB-AI (`/api/curse`, laptop only)
- `scripts/fake-robot.ts`: the fake bridge
