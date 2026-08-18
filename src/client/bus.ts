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
  }

  subscribe(listener: DanmakuListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  destroy(): void {
    for (const [, entry] of this.pending) clearTimeout(entry.timer)
    this.pending.clear()
    this.listeners.clear()
  }
}

export function createDanmakuBus(): DanmakuBus {
  return new DanmakuBus()
}