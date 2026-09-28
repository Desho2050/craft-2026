/**
 * Game-side multiplayer glue: one active WorldSession + a tiny zustand view
 * of connection state so React components (avatars, HUD) re-render on
 * join/leave while per-frame position sync stays out of React.
 */
import { create } from 'zustand'
import { useGameStore } from '../store/useGameStore'
import { WebSocketTransport, WorldSession, type RemotePlayer } from './multiplayer'

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
