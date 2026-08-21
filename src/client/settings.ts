/**
 * 弹幕设置（纯 localStorage，不依赖 DSH 或 React）。
 */

export type SnapEdge = 'left' | 'right' | 'top' | 'bottom'

/** 弹幕类型（对应 DanmakuItem.kind）。 */
export type DanmakuKind = 'user' | 'assistant' | 'tool-call' | 'tool-result' | 'turn' | 'subagent' | 'thinking'

/** 每种弹幕类型的开关（true = 显示）。 */
export interface DanmakuFilters {
  user: boolean
  assistant: boolean
  toolCall: boolean
  toolResult: boolean
  turn: boolean
  subagent: boolean
  thinking: boolean
}

/** 弹幕样式主题。 */
export type DanmakuTheme = 'classic' | 'neon' | 'cyber' | 'cinema' | 'mono' | 'battle'

/** 弹幕密度（影响轨道数量）。 */
export type DanmakuDensity = 'sparse' | 'normal' | 'dense'

/** 弹幕显示区域。 */
export type DanmakuRegion = 'full' | 'top' | 'bottom'

/** 弹幕滚动方向。 */
export type DanmakuDirection = 'rtl' | 'ltr'

export interface DanmakuSettings {
  enabled: boolean
  speed: number
  maxActive: number
  pos: { top: number; left: number }
  /** 贴边收纳：edge 为贴合的屏幕边，collapsed 表示已收纳为边缘小标签 */
  edge: SnapEdge | null
  collapsed: boolean
  /** 按类型过滤：false = 不弹该类型。 */
  filters: DanmakuFilters
  /** 弹幕样式主题。 */
  theme: DanmakuTheme
  /** 弹幕密度。 */
  density: DanmakuDensity
  /** 弹幕显示区域。 */
  region: DanmakuRegion
  /** 弹幕滚动方向。 */
  direction: DanmakuDirection
  /** 暂停播放：新弹幕不再生成，已播放的继续；双击控制条切换。 */
  paused: boolean
  /** Token 燃烧炉角标（会话累计 token 可视化）。 */
  tokenStove: boolean
  /** 用户自定义皮肤 CSS（追加注入）。 */
  customCss: string
}

export const DEFAULT_FILTERS: DanmakuFilters = {
  user: true,
  assistant: true,
  toolCall: true,
  toolResult: true,
  turn: true,
  subagent: true,
  thinking: true,
}

export const ALL_THEMES: DanmakuTheme[] = ['classic', 'neon', 'cyber', 'cinema', 'mono', 'battle']
export const THEME_LABEL: Record<DanmakuTheme, string> = {
  classic: '经典',
  neon: '霓虹',
  cyber: '赛博朋克',
  cinema: '电影字幕',
  mono: '极简等宽',
  battle: '战斗模式',
}

export const ALL_DENSITIES: DanmakuDensity[] = ['sparse', 'normal', 'dense']
export const DENSITY_LANES: Record<DanmakuDensity, number> = {
  sparse: 3,
  normal: 6,
  dense: 14,
}
export const DENSITY_LABEL: Record<DanmakuDensity, string> = {
  sparse: '稀疏',
  normal: '标准',
  dense: '密集',
}
export const DENSITY_EMOJI: Record<DanmakuDensity, string> = {
  sparse: '🔹',
  normal: '🔸',
  dense: '🔺',
}

export const DEFAULT_THEME: DanmakuTheme = 'classic'
export const DEFAULT_DENSITY: DanmakuDensity = 'normal'

export const ALL_REGIONS: DanmakuRegion[] = ['full', 'top', 'bottom']
export const REGION_LABEL: Record<DanmakuRegion, string> = { full: '全屏', top: '仅顶部', bottom: '仅底部' }
export const REGION_EMOJI: Record<DanmakuRegion, string> = { full: '🔲', top: '⬆️', bottom: '⬇️' }
export const DEFAULT_REGION: DanmakuRegion = 'full'

export const ALL_DIRECTIONS: DanmakuDirection[] = ['rtl', 'ltr']
export const DIRECTION_LABEL: Record<DanmakuDirection, string> = { rtl: '右→左', ltr: '左→右' }
export const DIRECTION_EMOJI: Record<DanmakuDirection, string> = { rtl: '➡️', ltr: '⬅️' }
export const DEFAULT_DIRECTION: DanmakuDirection = 'rtl'

export const DEFAULT_SETTINGS: DanmakuSettings = {
  enabled: true,
  speed: 150,
  maxActive: 40,
  pos: { top: 16, left: 300 },
  edge: null,
  collapsed: false,
  filters: { ...DEFAULT_FILTERS },
  theme: DEFAULT_THEME,
  density: DEFAULT_DENSITY,
  region: DEFAULT_REGION,
  direction: DEFAULT_DIRECTION,
  paused: false,
  tokenStove: true,
  customCss: '',
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

  function loadFilters(cur: unknown): DanmakuFilters {
    if (!cur || typeof cur !== 'object') return { ...DEFAULT_FILTERS }
    const raw = cur as Record<string, unknown>
    return {
      user: raw.user != null ? !!raw.user : DEFAULT_FILTERS.user,
      assistant: raw.assistant != null ? !!raw.assistant : DEFAULT_FILTERS.assistant,
      toolCall: raw.toolCall != null ? !!raw.toolCall : DEFAULT_FILTERS.toolCall,
      toolResult: raw.toolResult != null ? !!raw.toolResult : DEFAULT_FILTERS.toolResult,
      turn: raw.turn != null ? !!raw.turn : DEFAULT_FILTERS.turn,
      subagent: raw.subagent != null ? !!raw.subagent : DEFAULT_FILTERS.subagent,
      thinking: raw.thinking != null ? !!raw.thinking : DEFAULT_FILTERS.thinking,
    }
  }

  function loadTheme(cur: unknown): DanmakuTheme {
    if (!cur || typeof cur !== 'object') return DEFAULT_THEME
    const raw = cur as Record<string, unknown>
    const candidates: readonly DanmakuTheme[] = ['classic', 'neon', 'cyber', 'cinema', 'mono', 'battle']
    for (const t of candidates) { if (raw.theme === t) return t }
    return DEFAULT_THEME
  }

  function loadDensity(cur: unknown): DanmakuDensity {
    if (!cur || typeof cur !== 'object') return DEFAULT_DENSITY
    const raw = cur as Record<string, unknown>
    const candidates: readonly DanmakuDensity[] = ['sparse', 'normal', 'dense']
    for (const d of candidates) { if (raw.density === d) return d }
    return DEFAULT_DENSITY
  }

  function loadRegion(cur: unknown): DanmakuRegion {
    if (!cur || typeof cur !== 'object') return DEFAULT_REGION
    const raw = cur as Record<string, unknown>
    const candidates: readonly DanmakuRegion[] = ['full', 'top', 'bottom']
    for (const r of candidates) { if (raw.region === r) return r }
    return DEFAULT_REGION
  }

  function loadDirection(cur: unknown): DanmakuDirection {
    if (!cur || typeof cur !== 'object') return DEFAULT_DIRECTION
    const raw = cur as Record<string, unknown>
    const candidates: readonly DanmakuDirection[] = ['rtl', 'ltr']
    for (const d of candidates) { if (raw.direction === d) return d }
    return DEFAULT_DIRECTION
  }

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
          filters: loadFilters(cur.filters),
          theme: loadTheme(cur),
          density: loadDensity(cur),
          region: loadRegion(cur),
          direction: loadDirection(cur),
          // 暂停状态不跨页面持久化：刷新后自动恢复播放
          paused: false,
          tokenStove: cur.tokenStove != null ? cur.tokenStove : DEFAULT_SETTINGS.tokenStove,
          customCss: typeof cur.customCss === 'string' ? cur.customCss : DEFAULT_SETTINGS.customCss,
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