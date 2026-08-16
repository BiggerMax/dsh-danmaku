import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

export interface DanmakuSettings {
  /** 弹幕总开关。 */
  enabled: boolean
  /** 弹幕移动速度（px/s）。 */
  speed: number
  /** 最大并发弹幕数。 */
  maxActive: number
  /** 控制面板位置（拖拽持久化）。 */
  pos: { top: number; left: number }
}

export const DEFAULT_SETTINGS: DanmakuSettings = {
  enabled: true,
  speed: 150,
  maxActive: 40,
  pos: { top: 16, left: 300 },
}

export type SettingsStore = SnapshotStore<DanmakuSettings>

export function createSettingsStore(): SettingsStore {
  const store = createSnapshotStore<DanmakuSettings>(DEFAULT_SETTINGS, {
    persist: { name: 'dsh.trajectory-danmaku.settings' },
  })
  // 兼容旧持久化值（缺 pos / speed / maxActive 时补默认值）
  const cur = store.getSnapshot()
  if (!cur.pos || cur.speed == null || cur.maxActive == null) {
    store.update((d) => {
      if (!d.pos) d.pos = DEFAULT_SETTINGS.pos
      if (d.speed == null) d.speed = DEFAULT_SETTINGS.speed
      if (d.maxActive == null) d.maxActive = DEFAULT_SETTINGS.maxActive
    })
  }
  return store
}