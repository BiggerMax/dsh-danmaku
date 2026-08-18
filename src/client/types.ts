import type { DanmakuTheme } from './settings'

/** 一条弹幕。 */
export interface DanmakuItem {
  /** 稳定唯一 id（去重用）。 */
  readonly id: string
  /** 显示文本。 */
  readonly text: string
  /** 类型（决定图标与配色）。 */
  readonly kind: 'user' | 'assistant' | 'tool-call' | 'tool-result' | 'turn' | 'subagent' | 'thinking'
  /** 结果好坏（tool-result / turn 用）。 */
  readonly tone: 'neutral' | 'ok' | 'error'
  /** 产生时间（ms）。 */
  readonly time: number
  /** 耗时（ms）：turn-end / tool-result 有值时弹幕文本自动追加 ⏱ 标签。 */
  readonly durationMs?: number
  /** 渲染时使用的主题（可选，由总线注入）。 */
  readonly theme?: DanmakuTheme
}

/** 装配后的弹幕视图节点，喂给 ConversationViewBuilder。 */
export interface DanmakuViewNode extends ConversationViewNode {
  readonly target: 'danmaku'
  readonly data: DanmakuItem
}