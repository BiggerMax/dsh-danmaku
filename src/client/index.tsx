/**
 * dsh-danmaku — client 入口（纯原生 DOM，不依赖 React）。
 *
 * 注册轨迹事件定义 + 弹幕视图 + 直接挂载到 body 的弹幕层。
 * 构建：tsdown，产物 lib/client.js。bundle 直接返回 plugin 对象。
 */
import { createDanmakuBus, type DanmakuBus } from './bus'
import { registerDanmakuDefinitions, registerDanmakuView } from './definitions'
import { createSettingsStore, type SettingsStore } from './settings'
import { mountDanmakuOverlay } from './overlay'

export const inject = ['slots', 'conversationEvents', 'conversationViews']

interface ClientCtx {
  effect(fn: () => (() => void) | void, name?: string): void
  get?(name: string): unknown
  slots: {
    inject(slot: string, factory: () => () => void): void
    register(opts: { name: string; id: string; label: () => string }, component: () => unknown): () => void
  }
  conversationEvents: { register(def: unknown): () => void }
  conversationViews: { register(def: unknown): () => void }
}

// ── Token 统计接线：当前工作区（cwd 相同的全部会话）token 总和 ──
// 数据源：sessions.list 每行的 host 投影值 projectionValues.tokenUsage：
//   { uncachedInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }
// （与 dsh-client-ui-subagent 的 tokenTotal 同一算法：四桶之和）
interface SummaryLike { cwd?: string; projectionValues?: { tokenUsage?: unknown } }
interface SessionsLike {
  list?: {
    getSnapshot?(): { current?: string; byId?: Record<string, SummaryLike> }
    subscribe?(fn: () => void): () => void
  }
}
interface Totals { total: number; input: number; output: number }

function totalsOfProjection(raw: unknown): Totals | null {
  if (!raw || typeof raw !== 'object') return null
  const v = raw as Record<string, unknown>
  const num = (x: unknown) => (typeof x === 'number' && isFinite(x) ? x : 0)
  const input = num(v.uncachedInputTokens) + num(v.cacheReadTokens) + num(v.cacheWriteTokens)
  const output = num(v.outputTokens)
  return { total: input + output, input, output }
}

function wireTokenProjection(ctx: ClientCtx, bus: DanmakuBus): void {
  try {
    const sessions = ctx.get?.('sessions') as SessionsLike | undefined
    if (!sessions || !sessions.list || typeof sessions.list.getSnapshot !== 'function') return

    // 聚合当前工作区：与当前会话 cwd 相同的所有会话行求和（含子 agent 会话）
    bus.setTokenGetter(() => {
      let snap: ReturnType<NonNullable<NonNullable<SessionsLike['list']>['getSnapshot']>>
      try { snap = sessions.list!.getSnapshot!() } catch { return null }
      if (!snap) return null
      const byId = snap.byId
      if (!byId) return null
      const cur = snap.current ? byId[snap.current] : undefined
      if (!cur) return null
      const cwd = cur.cwd
      if (!cwd) return null
      let total = 0
      let input = 0
      let output = 0
      let found = false
      for (const id of Object.keys(byId)) {
        const row = byId[id]
        if (!row || (row.cwd && row.cwd !== cwd)) continue
        const t = totalsOfProjection(row.projectionValues?.tokenUsage)
        if (!t) continue
        found = true
        total += t.total
        input += t.input
        output += t.output
      }
      return found ? { total, input, output } : null
    })
    // 列表投影更新无需手动订阅：overlay 每秒轮询 getTokenTotals()
  } catch { /* sessions 服务不可用时静默降级 */ }
}

export function apply(ctx: ClientCtx): void {
  if (typeof document === 'undefined') return

  // ── 全屏红色诊断遮罩：3 秒后消失 ──
  const diag = document.createElement('div')
  diag.id = 'dsh-danmaku-diag'
  diag.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(255,0,0,0.9);display:flex;align-items:center;justify-content:center;flex-direction:column;z-index:999999;color:#fff;font-family:monospace;pointer-events:none;'
  diag.innerHTML = '<div style="font-size:48px;font-weight:bold;margin-bottom:12px;">[DBG] DANMAKU BUNDLE LOADED</div>'
  diag.innerHTML += '<div style="font-size:14px;">如果看到这块红色全屏 → client bundle 已加载</div>'
  diag.innerHTML += '<div id="dsh-danmaku-diag-steps" style="font-size:11px;color:#ffff00;margin-top:12px;line-height:1.6;max-width:600px;text-align:center;"></div>'
  document.body.appendChild(diag)

  const stepsEl = document.getElementById('dsh-danmaku-diag-steps')
  function step(msg: string) { if (stepsEl) stepsEl.innerHTML += msg + '<br>' }
  function hideDiag() {
    diag.style.transition = 'opacity 0.5s'
    diag.style.opacity = '0'
    setTimeout(() => diag.remove(), 500)
  }

  try {
    const bus = createDanmakuBus()
    step('✓ bus')
    const settings = createSettingsStore()
    step('✓ settings')
    registerDanmakuDefinitions(ctx)
    step('✓ 7 定义注册')
    registerDanmakuView(ctx, bus)
    step('✓ danmaku 视图注册')
    const unmount = mountDanmakuOverlay(bus, settings)
    step('✓ 弹幕层挂载')
    // Token 投影接线（sessions 服务不可用时静默降级）
    wireTokenProjection(ctx, bus)
    ctx.effect(() => unmount, 'dsh-danmaku: overlay')
    step('✓ effect 注册')
    hideDiag()
  } catch (e) {
    step('❌ ERROR: ' + String(e && (e as Error).message || e))
  }
}