import type { DanmakuTheme } from './settings'
import type { DanmakuItem } from './types'

export type DanmakuListener = (item: DanmakuItem) => void

/** 弹幕事件总线：node 定义推送 → overlay 订阅播放。 */
export class DanmakuBus {
  private readonly listeners = new Set<DanmakuListener>()
  private themeGetter: (() => DanmakuTheme) | null = null
  // 智能分组：tool-call / tool-result 在短窗口内合并
  private readonly pending = new Map<string, { item: DanmakuItem; count: number; timer: ReturnType<typeof setTimeout> }>()
  private readonly COALESCE_MS = 400
  // 弹幕历史（最近 500 条）
  private readonly history: DanmakuItem[] = []
  private readonly MAX_HISTORY = 500
  private comboStreak = 0
  private comboTimer: ReturnType<typeof setTimeout> | null = null

  setThemeGetter(fn: () => DanmakuTheme): void {
    this.themeGetter = fn
  }

  push(item: DanmakuItem): void {
    const themed = this.themeGetter ? { ...item, theme: this.themeGetter() } : item

    // 只合并 tool-call 和 tool-result
    if (item.kind === 'tool-call' || item.kind === 'tool-result') {
      const key = this.coalesceKey(item)
      const existing = this.pending.get(key)
      if (existing) {
        existing.count++
        clearTimeout(existing.timer)
        existing.timer = setTimeout(() => this.flushPending(key), this.COALESCE_MS)
        return
      }
      // 新建一个 pending 槽
      const pendingItem = {
        item: themed,
        count: 1,
        timer: setTimeout(() => this.flushPending(key), this.COALESCE_MS),
      }
      this.pending.set(key, pendingItem)
      return
    }

    this.record(themed)
    for (const listener of [...this.listeners]) listener(themed)
    this.updateCombo(themed)
  }

  private updateCombo(item: DanmakuItem): void {
    if (item.kind !== 'tool-result') return
    if (item.tone === 'ok') {
      this.comboStreak++
      if (this.comboTimer) clearTimeout(this.comboTimer)
      this.comboTimer = setTimeout(() => { this.comboStreak = 0 }, 3000)
      if (this.comboStreak >= 3) {
        const combo: DanmakuItem = {
          id: `combo:${item.id}:${this.comboStreak}`,
          text: `🔥 工具连击 ×${this.comboStreak}`,
          kind: 'turn', tone: 'ok', time: item.time,
          effect: 'combo', combo: this.comboStreak,
        }
        this.record(combo)
        for (const listener of [...this.listeners]) listener(combo)
      }
    } else {
      this.comboStreak = 0
      if (this.comboTimer) { clearTimeout(this.comboTimer); this.comboTimer = null }
    }
  }

  private record(item: DanmakuItem): void {
    this.history.push(item)
    if (this.history.length > this.MAX_HISTORY) this.history.shift()
  }

  getHistory(): readonly DanmakuItem[] {
    return this.history
  }

  private coalesceKey(item: DanmakuItem): string {
    // 从 text 中提取工具名（🧠/⚙️/✅/❌ 后面的部分）
    const match = item.text.match(/^[\s\S]*?([\w-]+)(?:\s|$)/)
    return match ? `${item.kind}:${match[1]}` : item.id
  }

  private flushPending(key: string): void {
    const entry = this.pending.get(key)
    if (!entry) return
    this.pending.delete(key)
    const { item, count } = entry
    const coalesced: DanmakuItem =
      count > 1
        ? { ...item, text: item.text + ` ×${count}` }
        : item
    this.record(coalesced)
    for (const listener of [...this.listeners]) listener(coalesced)
    this.updateCombo(coalesced)
  }

  /** 系统生成弹幕（预言/观众反应等）：不参与合并，直接记录并广播。 */
  emit(item: DanmakuItem): void {
    const themed = this.themeGetter ? { ...item, theme: this.themeGetter() } : item
    this.record(themed)
    for (const listener of [...this.listeners]) listener(themed)
  }

  subscribe(listener: DanmakuListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  destroy(): void {
    for (const [, entry] of this.pending) clearTimeout(entry.timer)
    this.pending.clear()
    if (this.comboTimer) clearTimeout(this.comboTimer)
    this.comboTimer = null
    this.listeners.clear()
  }
}

export function createDanmakuBus(): DanmakuBus {
  return new DanmakuBus()
}