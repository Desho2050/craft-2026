/**
 * Live security test for the MP relay (needs `npm run dev:mp` running).
 * Three headless clients: an observer, an attacker, and a victim standing in
 * the attacker's aim path.
 *
 *   node scripts/mp-security-test.mjs
 */
import WebSocket from 'ws'

const SEED = `sec-${Date.now()}`
const URL = 'ws://localhost:8768'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function client(id) {
  const ws = new WebSocket(URL)
  const got = []
  ws.on('message', (raw) => got.push(JSON.parse(String(raw))))
  return {
    ws,
    got,
    blocks: (filter = () => true) => got.filter((m) => m.t === 'block' && filter(m)),
    ready: new Promise((res) => ws.on('open', res)),
    join: () => ws.send(JSON.stringify({ t: 'join', id, name: id, skin: 'steve', seed: SEED })),
    state: (x, y, z, yaw, pitch) => ws.send(JSON.stringify({ t: 'state', id, x, y, z, yaw, pitch })),
    block: (x, y, z, b) => ws.send(JSON.stringify({ t: 'block', x, y, z, b })),
  }
}

let failures = 0
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) failures++
}

const obs = client('observer')
const atk = client('attacker')
const vic = client('victim')
await Promise.all([obs.ready, atk.ready, vic.ready])
obs.join()
atk.join()
vic.join()
await sleep(400)

// attacker feet (100.5, 40, 100.5), eye (100.5, 41.62, 100.5), yaw=0 pitch=-0.3
// -> look dir ≈ (0, -0.295, -0.955): the attacker faces -z
atk.state(100.5, 40, 100.5, 0, -0.3)
vic.state(100.5, 40, 96.5, 0, 0) // four blocks ahead of the attacker
await sleep(150)

/* 1. legitimate in-reach edit */
atk.block(100, 41, 99, 3)
await sleep(250)
check('in-reach edit reaches the observer', obs.blocks((m) => m.x === 100 && m.y === 41 && m.z === 99 && m.b === 3).length === 1)
check('in-reach edit is not bounced back', atk.blocks((m) => m.x === 100 && m.z === 99).length === 0)

/* 2. teleport cheat — 90 blocks away */
atk.block(100, 41, 190, 5)
await sleep(250)
check('out-of-reach edit never broadcasts', obs.blocks((m) => m.x === 100 && m.z === 190).length === 0)
check('out-of-reach edit bounces authoritative air', atk.blocks((m) => m.z === 190 && m.b === 0).length === 1)

/* 3. burying the victim — passes reach, must fail the overlap gate */
atk.block(100, 40, 96, 12)
await sleep(250)
check('bury attempt is not broadcast', obs.blocks((m) => m.y === 40 && m.z === 96).length === 0)
check('bury attempt is bounced to the attacker', atk.blocks((m) => m.y === 40 && m.z === 96 && m.b === 0).length === 1)

/* 4. malformed frames */
atk.block(100, 999, 99, 3)
atk.block(100.5, 41, 99, 3)
atk.block(100, 41, 99, 250)
await sleep(250)
check('malformed edits are dropped entirely', obs.blocks((m) => m.y === 999 || m.b === 250 || !Number.isInteger(m.x)).length === 0)

/* 5. flood: 200 in-reach edits in one burst */
for (let i = 0; i < 200; i++) atk.block(97 + (i % 7), 40 + (i % 4), 99, 3)
await sleep(700)
const accepted = obs.blocks((m) => m.z === 99 && m.b === 3 && m.x >= 97 && m.x <= 103).length
check(`flood limited by the rate bucket (accepted ${accepted} of 200)`, accepted > 0 && accepted <= 40)

/* 6. state sync still flows with the new pitch field */
check('state carries pitch', obs.got.some((m) => m.t === 'state' && m.id === 'attacker' && typeof m.pitch === 'number'))

obs.ws.close()
atk.ws.close()
vic.ws.close()
console.log(failures === 0 ? '\nRELAY SECURITY: ALL PASS' : `\nRELAY SECURITY: ${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
