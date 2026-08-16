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
  slots: {
    inject(slot: string, factory: () => () => void): void
    register(opts: { name: string; id: string; label: () => string }, component: () => unknown): () => void
  }
  conversationEvents: { register(def: unknown): () => void }
  conversationViews: { register(def: unknown): () => void }
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
    step('✓ 5 定义注册')
    registerDanmakuView(ctx, bus)
    step('✓ danmaku 视图注册')
    const unmount = mountDanmakuOverlay(bus, settings)
    step('✓ 弹幕层挂载')
    ctx.effect(() => unmount, 'dsh-danmaku: overlay')
    step('✓ effect 注册')
    hideDiag()
  } catch (e) {
    step('❌ ERROR: ' + String(e && (e as Error).message || e))
  }
}