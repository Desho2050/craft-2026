/**
 * Multiplayer protocol + transports.
 *
 * Design: transport-agnostic message protocol so the same session layer can
 * run over WebSocket (server-authoritative worlds), WebRTC data channels
 * (peer-to-peer private worlds) or a local loopback (hot-seat / tests).
 *
 * Live play: `WebSocketTransport` + `server/mpServer.ts` (rooms keyed by the
 * world seed); game wiring lives in `src/net/session.ts`.
 */
import type { Block } from '../utils/blocks'

export type NetMessage =
  | { t: 'join'; id: string; name: string; skin: string; seed: string }
  | { t: 'state'; id: string; x: number; y: number; z: number; yaw: number; pitch: number }
  | { t: 'block'; x: number; y: number; z: number; b: Block }
  | { t: 'chat'; id: string; text: string; at: number }
  | { t: 'leave'; id: string }

export interface Transport {
  send(msg: NetMessage): void
  onMessage(cb: (msg: NetMessage) => void): void
  close(): void
}

/** loopback transport — lets you test the protocol with zero infrastructure */
export class LoopbackTransport implements Transport {
  private peer: LoopbackTransport | null = null
  private cb: ((m: NetMessage) => void) | null = null
  static pair(): [LoopbackTransport, LoopbackTransport] {
    const a = new LoopbackTransport()
    const b = new LoopbackTransport()
    a.peer = b
    b.peer = a
    return [a, b]
  }
  send(msg: NetMessage): void {
    queueMicrotask(() => this.peer?.cb?.(msg))
  }
  onMessage(cb: (m: NetMessage) => void): void {
    this.cb = cb
  }
  close(): void {
    this.cb = null
  }
}

/** browser WebSocket transport; buffers sends until the socket opens */
export class WebSocketTransport implements Transport {
  private ws: WebSocket
  private cb: ((m: NetMessage) => void) | null = null
  private queue: NetMessage[] = []

  constructor(url: string, onStatus?: (connected: boolean) => void) {
    this.ws = new WebSocket(url)
    this.ws.onopen = () => {
      onStatus?.(true)
      for (const m of this.queue) this.ws.send(JSON.stringify(m))
      this.queue = []
    }
    this.ws.onmessage = (e) => {
      try {
        this.cb?.(JSON.parse(String(e.data)) as NetMessage)
      } catch { /* malformed frame — ignore */ }
    }
    this.ws.onclose = () => onStatus?.(false)
    this.ws.onerror = () => onStatus?.(false)
  }

  send(msg: NetMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
    else this.queue.push(msg)
  }
  onMessage(cb: (m: NetMessage) => void): void {
    this.cb = cb
  }
  close(): void {
    this.queue = []
    this.cb = null
    this.ws.onclose = null
    this.ws.close()
  }
}

export interface RemotePlayer {
  id: string
  name: string
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
}

export class WorldSession {
  readonly selfId = Math.random().toString(36).slice(2, 10)
  readonly players = new Map<string, RemotePlayer>()
  onChat: ((id: string, text: string) => void) | null = null
  onRemoteBlock: ((x: number, y: number, z: number, b: Block) => void) | null = null
  onPlayersChanged: (() => void) | null = null
  /** defence-in-depth gate — return false to drop an edit before it touches the world */
  onBlockEdit: ((x: number, y: number, z: number, b: Block) => boolean) | null = null
  private lastSent = 0

  constructor(
    private transport: Transport,
    private getName: () => string,
    seed: string,
  ) {
    transport.onMessage((m) => this.handle(m))
    transport.send({ t: 'join', id: this.selfId, name: this.getName(), skin: 'steve', seed })
  }

  private handle(m: NetMessage): void {
    switch (m.t) {
      case 'state':
        if (m.id !== this.selfId) {
          const isNew = !this.players.has(m.id)
          this.players.set(m.id, {
            ...(this.players.get(m.id) ?? { id: m.id, name: '?', x: 0, y: 40, z: 0, pitch: 0 }),
            x: m.x,
            y: m.y,
            z: m.z,
            yaw: m.yaw,
            pitch: m.pitch,
          })
          if (isNew) this.onPlayersChanged?.()
        }
        break
      case 'block':
        if (this.onBlockEdit?.(m.x, m.y, m.z, m.b) === false) break
        this.onRemoteBlock?.(m.x, m.y, m.z, m.b)
        break
      case 'chat':
        this.onChat?.(m.id, m.text)
        break
      case 'leave':
        if (this.players.delete(m.id)) this.onPlayersChanged?.()
        break
      case 'join':
        if (m.id !== this.selfId && !this.players.has(m.id)) {
          this.players.set(m.id, { id: m.id, name: m.name, x: 0, y: 100, z: 0, yaw: 0, pitch: 0 })
          this.onPlayersChanged?.()
        }
        break
    }
  }

  /** call from the render loop — throttled to ~10 Hz */
  broadcastState(x: number, y: number, z: number, yaw: number, pitch: number, now: number): void {
    if (now - this.lastSent < 100) return
    this.lastSent = now
    this.transport.send({ t: 'state', id: this.selfId, x, y, z, yaw, pitch })
  }

  broadcastBlock(x: number, y: number, z: number, b: Block): void {
    this.transport.send({ t: 'block', x, y, z, b })
  }

  chat(text: string): void {
    this.transport.send({ t: 'chat', id: this.selfId, text, at: Date.now() })
  }

  leave(): void {
    this.transport.send({ t: 'leave', id: this.selfId })
    this.transport.close()
  }
}
