/**
 * Dev probe: joins an MP room as a second player and logs every message,
 * so relay behavior can be verified without a second browser.
 *
 * node scripts/mp-probe.mjs [seed] [--send-block x,y,z,b] [--teleport-edit]
 *   --send-block    place/break a block after standing (reported state) next to it
 *   --teleport-edit cheat simulation: edit far from our reported position —
 *                   expect the relay to bounce the authoritative block back
 */
import WebSocket from 'ws'

const args = process.argv.slice(2)
const seed = args[0] ?? 'mp-test'
const sendIdx = args.indexOf('--send-block')
const sendBlock = sendIdx >= 0 ? args[sendIdx + 1].split(',').map(Number) : null
const teleport = args.includes('--teleport-edit')

const ws = new WebSocket('ws://localhost:8768')
let sent = false

ws.on('open', () => {
  ws.send(JSON.stringify({ t: 'join', id: 'probe-1', name: 'Probe', skin: 'steve', seed }))
  console.log(`[probe] joined room "${seed}"`)
})

ws.on('message', (raw) => {
  const text = String(raw)
  console.log(`[probe] ${new Date().toISOString().slice(11, 23)} ${text}`)
  if (sendBlock && !sent) {
    setTimeout(() => {
      if (sent) return
      sent = true
      const [x, y, z, b] = sendBlock
      if (teleport) {
        // stay 60 blocks away and try to edit — relay must reject + bounce
        ws.send(JSON.stringify({ t: 'state', id: 'probe-1', x: x + 60.5, y, z, yaw: 0, pitch: 0 }))
      } else {
        // stand on top of the target block, looking down at it
        ws.send(JSON.stringify({ t: 'state', id: 'probe-1', x: x + 0.5, y: y + 1, z: z + 0.5, yaw: 0, pitch: -1.2 }))
      }
      setTimeout(() => {
        ws.send(JSON.stringify({ t: 'block', x, y, z, b }))
        console.log(`[probe] sent block ${x},${y},${z} -> ${b} (${teleport ? 'OUT OF REACH' : 'in reach'})`)
      }, 300)
    }, 1500)
  }
})

ws.on('close', () => console.log('[probe] closed'))
