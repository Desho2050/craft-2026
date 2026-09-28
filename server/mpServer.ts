/**
 * MedoCraft multiplayer relay: rooms are keyed by world seed, so two players
 * who type the same seed land in the same world. The server is a LIGHT
 * authority — it never generates terrain, but it gates block edits so a
 * hostile or buggy client cannot rewrite the world:
 *  - edits must be within reach of the sender's last reported eye position
 *  - non-air edits may not bury any player in the room
 *  - per-client token-bucket rate limiting, room size cap
 *  - rejected edits are answered with the authoritative block so the
 *    cheater's client reverts instead of desyncing
 * It also:
 *  - on join, swaps rosters (newcomer <-> existing players)
 *  - accumulates block edits per room and replays them to late joiners
 *
 * Run: npm run dev:mp   (default port 8768, override with MP_PORT)
 */
import { WebSocketServer, WebSocket, type RawData } from 'ws'
import {
  EYE_OFFSET,
  isBlockShapeValid,
  overlapsPlayer,
  withinReach,
  type Vec3,
} from '../src/net/validate.ts'

interface NetMessage {
  t: string
  id?: string
  name?: string
  seed?: string
  x?: number
  y?: number
  z?: number
  yaw?: number
  pitch?: number
  b?: number
}

interface Client {
  ws: WebSocket
  id: string
  seed: string
  joinMsg: string
  pos: Vec3
  dir: { dx: number; dy: number; dz: number }
  tokens: number
  lastRefill: number
}

const PORT = Number(process.env.MP_PORT ?? 8768)
const MAX_EDITS = 20000
const MAX_PER_ROOM = 8
const BURST = 30 // block edits allowed instantly
const SUSTAINED = 12 // block edits per second after the burst

const wss = new WebSocketServer({ port: PORT, maxPayload: 8192 })
const clients = new Map<WebSocket, Client>()
/** seed -> accumulated block edits (last writer wins per position) */
const edits = new Map<string, Map<string, string>>()

function roomMates(seed: string, exclude: Client | null): Client[] {
  const out: Client[] = []
  for (const c of clients.values()) if (c.seed === seed && c !== exclude) out.push(c)
  return out
}

function eyeOf(c: Client): Vec3 {
  return { x: c.pos.x, y: c.pos.y + EYE_OFFSET, z: c.pos.z }
}

/** send the authoritative value at (x,y,z) back to the offender so it reverts */
function bounce(me: Client, x: number, y: number, z: number): void {
  const roomEdits = edits.get(me.seed)
  const raw = roomEdits?.get(`${x},${y},${z}`)
  me.ws.send(raw ?? JSON.stringify({ t: 'block', x, y, z, b: 0 }))
}

wss.on('connection', (ws) => {
  ws.on('message', (raw: RawData) => {
    let m: NetMessage
    try {
      m = JSON.parse(String(raw))
    } catch {
      return
    }
    if (typeof m.t !== 'string') return

    if (m.t === 'join') {
      if (clients.has(ws)) return // one join per socket
      if (typeof m.id !== 'string' || typeof m.seed !== 'string' || !m.id || !m.seed) return
      if (roomMates(m.seed, null).length >= MAX_PER_ROOM) {
        ws.close(1013, 'room full')
        return
      }
      const client: Client = {
        ws,
        id: m.id,
        seed: m.seed,
        joinMsg: String(raw),
        pos: { x: 0, y: 100, z: 0 }, // above any terrain: nothing in reach until first state
        dir: { dx: 0, dy: 0, dz: 0 },
        tokens: BURST,
        lastRefill: Date.now(),
      }
      clients.set(ws, client)

      // roster -> newcomer, newcomer -> roster
      for (const c of roomMates(m.seed, client)) {
        c.ws.send(client.joinMsg)
        ws.send(c.joinMsg)
      }
      let roomEdits = edits.get(m.seed)
      if (!roomEdits) {
        roomEdits = new Map()
        edits.set(m.seed, roomEdits)
      }
      for (const msg of roomEdits.values()) ws.send(msg)
      console.log(`[mp] ${m.id} joined room "${m.seed}" (${roomMates(m.seed, client).length + 1} online)`)
      return
    }

    const me = clients.get(ws)
    if (!me) return // spoke before joining

    switch (m.t) {
      case 'state': {
        if (
          typeof m.x !== 'number' || typeof m.y !== 'number' || typeof m.z !== 'number' ||
          !Number.isFinite(m.x) || !Number.isFinite(m.y) || !Number.isFinite(m.z)
        )
          return
        me.pos = { x: m.x, y: m.y, z: m.z }
        const yaw = typeof m.yaw === 'number' && Number.isFinite(m.yaw) ? m.yaw : 0
        const pitch = typeof m.pitch === 'number' && Number.isFinite(m.pitch) ? m.pitch : -0.3
        const cp = Math.cos(pitch)
        me.dir = { dx: -Math.sin(yaw) * cp, dy: Math.sin(pitch), dz: -Math.cos(yaw) * cp }
        for (const c of roomMates(me.seed, me)) c.ws.send(String(raw))
        break
      }
      case 'chat':
        for (const c of roomMates(me.seed, me)) c.ws.send(String(raw))
        break
      case 'block': {
        const x = m.x as number, y = m.y as number, z = m.z as number, b = m.b as number
        if (!isBlockShapeValid(x, y, z, b)) return
        // token bucket rate limit
        const now = Date.now()
        me.tokens = Math.min(BURST, me.tokens + ((now - me.lastRefill) / 1000) * SUSTAINED)
        me.lastRefill = now
        if (me.tokens < 1) return
        me.tokens -= 1
        // authority gates
        if (!withinReach(eyeOf(me), { x, y, z }, me.dir.dx, me.dir.dy, me.dir.dz)) {
          bounce(me, x, y, z)
          return
        }
        if (b !== 0) {
          for (const c of roomMates(me.seed, me))
            if (overlapsPlayer(c.pos, x, y, z)) {
              bounce(me, x, y, z)
              return
            }
        }
        // remember the edit (capped) so late joiners see it replayed
        const roomEdits = edits.get(me.seed) ?? new Map<string, string>()
        roomEdits.set(`${x},${y},${z}`, String(raw))
        if (roomEdits.size > MAX_EDITS) roomEdits.delete(roomEdits.keys().next().value as string)
        edits.set(me.seed, roomEdits)
        for (const c of roomMates(me.seed, me)) c.ws.send(String(raw))
        break
      }
      case 'leave':
        break // handled by socket close
    }
  })

  ws.on('close', () => {
    const me = clients.get(ws)
    if (!me) return
    clients.delete(ws)
    const leave = JSON.stringify({ t: 'leave', id: me.id })
    for (const c of roomMates(me.seed, me)) c.ws.send(leave)
    console.log(`[mp] ${me.id} left room "${me.seed}"`)
  })
})

console.log(`MedoCraft MP relay listening on ws://localhost:${PORT}`)
