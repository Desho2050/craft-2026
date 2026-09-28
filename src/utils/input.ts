/** Shared keyboard state — read per-frame by Player without React re-renders. */
export const heldKeys = new Set<string>()

export function installKeyboard(): () => void {
  const down = (e: KeyboardEvent) => {
    // ignore while typing in inputs (seed field etc.)
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return
    heldKeys.add(e.code)
  }
  const up = (e: KeyboardEvent) => heldKeys.delete(e.code)
  const blur = () => heldKeys.clear()
  window.addEventListener('keydown', down)
  window.addEventListener('keyup', up)
  window.addEventListener('blur', blur)
  return () => {
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
    window.removeEventListener('blur', blur)
  }
}
