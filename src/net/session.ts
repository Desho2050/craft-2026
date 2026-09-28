/**
 * Game-side multiplayer glue: one active WorldSession + a tiny zustand view
 * of connection state so React components (avatars, HUD) re-render on
 * join/leave while per-frame position sync stays out of React.
 */
import { create } from 'zustand'
import { useGameStore } from '../store/useGameStore'
import { WebSocketTransport, WorldSession, type RemotePlayer } from './multiplayer'
import { isBlockShapeValid, overlapsPlayer } from './validate'
import { Block } from '../utils/blocks'

interface NetStore {
  enabled: boolean
  connected: boolean
  players: RemotePlayer[]
}

export const useNetStore = create<NetStore>(() => ({
  enabled: false,
  connected: false,
  players: [],
}))

let session: WorldSession | null = null

export function getNet(): WorldSession | null {
  return session
}

export function connectNet(url: string, name: string, seed: string): void {
  disconnectNet()
  useNetStore.setState({ enabled: true })
  const transport = new WebSocketTransport(url, (connected) =>
    useNetStore.setState({ connected }),
  )
  session = new WorldSession(transport, () => name, seed)
  session.onBlockEdit = (x, y, z, b) => {
    // defence in depth: the relay gates edits, but a compromised relay must
    // not be able to push garbage into our chunk arrays either
    if (!isBlockShapeValid(x, y, z, b)) return false
    const s = useGameStore.getState()
    const [lx, ly, lz] = s.runtime.pos
    if (
      b !== Block.Air &&
      (overlapsPlayer({ x: lx, y: ly, z: lz }, x, y, z) ||
        [...(session?.players.values() ?? [])].some((p) => overlapsPlayer({ x: p.x, y: p.y, z: p.z }, x, y, z)))
    )
      return false
    // edits landing in unloaded chunks would generate whole columns of
    // chunks from a hostile stream — keep them near our player
    if (Math.abs(x - lx) > 48 || Math.abs(z - lz) > 48) return false
    return true
  }
  session.onRemoteBlock = (x, y, z, b) => {
    const s = useGameStore.getState()
    s.world?.setBlock(x, y, z, b)
    s.save()
  }
  session.onPlayersChanged = () =>
    useNetStore.setState({ players: [...(session?.players.values() ?? [])] })
}

export function disconnectNet(): void {
  session?.leave()
  session = null
  useNetStore.setState({ enabled: false, connected: false, players: [] })
}
