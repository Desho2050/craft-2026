/**
 * MedoCraft multiplayer relay: rooms are keyed by world seed, so two players
 * who type the same seed land in the same world. The server is a dumb
 * broadcaster (no game authority yet) with two extra jobs:
 *  - on join, send the roster of existing players to the newcomer (and the
 *    newcomer's join to everyone else)
 *  - accumulate block edits per room and replay them to late joiners, so a
 *    player who joins after their friend mined some ore sees the same world.
 *
 * Run: npm run dev:mp   (default port 8768, override with MP_PORT)
 */
import { WebSocketServer, WebSocket, type RawData } from 'ws'

interface NetMessage {
  t: string
  id?: string
  name?: string
  seed?: string
  x?: number
  y?: number
  z?: number
  b?: number
}

interface Client {
  ws: WebSocket
  id: string
  seed: string
  joinMsg: string
}

const PORT = Number(process.env.MP_PORT ?? 8768)
const MAX_EDITS = 20000

const wss = new WebSocketServer({ port: PORT, maxPayload: 8192 })
const clients = new Map<WebSocket, Client>()
/** seed -> accumulated block edits (last writer wins per position) */
const edits = new Map<string, Map<string, string>>()

function roomMates(seed: string, exclude: Client | null): Client[] {
  const out: Client[] = []
  for (const c of clients.values()) if (c.seed === seed && c !== exclude) out.push(c)
  return out
}

wss.on('connection', (ws) => {
  ws.on('message', (raw: RawData) => {
    let m: NetMessage
    try {
      m = JSON.parse(String(raw))
    } catch {
      return
    }

    if (m.t === 'join' && m.seed && m.id) {
      if (clients.has(ws)) return // one join per socket
      const client: Client = { ws, id: m.id, seed: m.seed, joinMsg: String(raw) }
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
      case 'state':
      case 'chat':
        for (const c of roomMates(me.seed, me)) c.ws.send(String(raw))
        break
      case 'block':
        // remember the edit (capped) so late joiners see it replayed
        if (typeof m.x === 'number' && typeof m.y === 'number' && typeof m.z === 'number') {
          const roomEdits = edits.get(me.seed) ?? new Map<string, string>()
          roomEdits.set(`${m.x},${m.y},${m.z}`, String(raw))
          if (roomEdits.size > MAX_EDITS) roomEdits.delete(roomEdits.keys().next().value as string)
          edits.set(me.seed, roomEdits)
        }
        for (const c of roomMates(me.seed, me)) c.ws.send(String(raw))
        break
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
