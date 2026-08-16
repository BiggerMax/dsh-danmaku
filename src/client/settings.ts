/**
 * 弹幕设置（纯 localStorage，不依赖 DSH 或 React）。
 */

export type SnapEdge = 'left' | 'right' | 'top' | 'bottom'

export interface DanmakuSettings {
  enabled: boolean
  speed: number
  maxActive: number
  pos: { top: number; left: number }
  /** 贴边收纳：edge 为贴合的屏幕边，collapsed 表示已收纳为边缘小标签 */
  edge: SnapEdge | null
  collapsed: boolean
}

export const DEFAULT_SETTINGS: DanmakuSettings = {
  enabled: true,
  speed: 150,
  maxActive: 40,
  pos: { top: 16, left: 300 },
  edge: null,
  collapsed: false,
}

const STORAGE_KEY = 'dsh.trajectory-danmaku.settings'

export type SettingsStore = {
  getSnapshot: () => DanmakuSettings
  update: (mutator: (d: DanmakuSettings) => void) => void
  subscribe: (cb: () => void) => () => void
}

export function createSettingsStore(): SettingsStore {
  let snap: DanmakuSettings = load()
  const listeners = new Set<() => void>()

  function load(): DanmakuSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const cur = JSON.parse(raw)
        // 兼容旧持久化值
        return {
          enabled: cur.enabled != null ? cur.enabled : DEFAULT_SETTINGS.enabled,
          speed: cur.speed != null ? cur.speed : DEFAULT_SETTINGS.speed,
          maxActive: cur.maxActive != null ? cur.maxActive : DEFAULT_SETTINGS.maxActive,
          pos: cur.pos && typeof cur.pos.top === 'number' && typeof cur.pos.left === 'number'
            ? cur.pos
            : DEFAULT_SETTINGS.pos,
          edge: cur.edge === 'left' || cur.edge === 'right' || cur.edge === 'top' || cur.edge === 'bottom'
            ? cur.edge
            : DEFAULT_SETTINGS.edge,
          collapsed: cur.collapsed != null ? cur.collapsed : DEFAULT_SETTINGS.collapsed,
        }
      }
    } catch { /* fall through */ }
    return { ...DEFAULT_SETTINGS }
  }

  function save(): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snap)) } catch { /* ignore */ }
  }

  function notify(): void {
    for (const cb of [...listeners]) {
      try { cb() } catch { /* ignore */ }
    }
  }

  return {
    getSnapshot: () => snap,
    update: (mutator: (d: DanmakuSettings) => void) => {
      const next = { ...snap }
      mutator(next)
      snap = next
      save()
      notify()
    },
    subscribe: (cb: () => void) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
}