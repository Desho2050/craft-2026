/**
 * Dev probe: joins an MP room as a second player and logs every message,
 * so relay behavior can be verified without a second browser.
 *
 * node scripts/mp-probe.mjs [seed] [--send-block x,y,z,b]
 */
import WebSocket from 'ws'

const args = process.argv.slice(2)
const seed = args[0] ?? 'mp-test'
const sendIdx = args.indexOf('--send-block')
const sendBlock = sendIdx >= 0 ? args[sendIdx + 1].split(',').map(Number) : null

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
      ws.send(JSON.stringify({ t: 'block', x, y, z, b }))
      console.log(`[probe] sent block ${x},${y},${z} -> ${b}`)
    }, 1500)
  }
})

ws.on('close', () => console.log('[probe] closed'))
