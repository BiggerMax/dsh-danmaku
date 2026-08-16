import type { DanmakuItem } from './types'

export type DanmakuListener = (item: DanmakuItem) => void

/** 弹幕事件总线：node 定义推送 → overlay 订阅播放。 */
export class DanmakuBus {
  private readonly listeners = new Set<DanmakuListener>()

  push(item: DanmakuItem): void {
    for (const listener of [...this.listeners]) listener(item)
  }

  subscribe(listener: DanmakuListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

export function createDanmakuBus(): DanmakuBus {
  return new DanmakuBus()
}