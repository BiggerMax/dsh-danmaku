/**
 * @dsh-external/dsh-trajectory-danmaku — client 入口。
 *
 * 注册轨迹事件定义 + 弹幕视图 + shell.overlay 弹幕层。
 * 构建：tsdown（tsdown.config.ts），产物 lib/client.js。
 */
import { createDanmakuBus, type DanmakuBus } from './bus'
import { registerDanmakuDefinitions, registerDanmakuView } from './definitions'
import { createSettingsStore, type SettingsStore } from './settings'
import { DanmakuOverlay } from './overlay'

// 运行时注入的服务——由 dsh.client.inject 声明
export const inject = ['slots', 'conversationEvents', 'conversationViews']

// 客户端上下文接口（tsdown 不类型检查，供编辑器参考）
interface ClientCtx {
  effect(fn: () => (() => void) | void, name?: string): void
  slots: {
    inject(slot: string, factory: () => () => void): void
    register(opts: { name: string; id: string; label: () => string }, component: () => JSX.Element): () => void
  }
  conversationEvents: { register(def: unknown): void }
  conversationViews: { register(def: unknown): void }
}

export function apply(ctx: ClientCtx): void {
  const bus = createDanmakuBus()
  const settings = createSettingsStore()

  // 1. 注册轨迹事件→弹幕节点定义
  registerDanmakuDefinitions(ctx as never)

  // 2. 注册弹幕视图（将 upsert 节点喂给总线）
  registerDanmakuView(ctx as never, bus)

  // 3. 注册 shell.overlay 弹幕层
  ctx.effect(() => ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register({
      name: 'shell.overlay',
      id: 'dsh-trajectory-danmaku',
      label: () => '轨迹弹幕',
    }, () => (
      <DanmakuOverlay bus={bus} settings={settings} />
    )),
  ), 'dsh-trajectory-danmaku: overlay')
}