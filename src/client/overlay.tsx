import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { DanmakuBus } from './bus'
import type { DanmakuItem } from './types'
import type { SettingsStore } from './settings'

// ─── 类型 ─────────────────────────────────────────────────────────────

interface ActiveDanmaku extends DanmakuItem {
  lane: number
  duration: number
}

// ─── 常量 ─────────────────────────────────────────────────────────────

const LANE_COUNT = 14
const LANE_HEIGHT = 30
const LANE_TOP = 56
const STYLE_ID = 'dsh-trajectory-danmaku-css'

// ─── CSS 注入（模块级单次）─────────────────────────────────────────────

let cssInjected = false

function injectCss(): void {
  if (typeof document === 'undefined') return
  if (cssInjected) return
  if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`)) {
    cssInjected = true
    return
  }
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-trajectory-danmaku'
  style.dataset.pluginCss = STYLE_ID
  style.textContent = `
.dsh-danmaku-layer {
  position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 999;
}
.dsh-danmaku-item {
  position: absolute; left: 0; top: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60vw;
  padding: 3px 14px; border-radius: 999px; font-size: 14px; line-height: 22px;
  font-weight: 600; color: #fff;
  background: rgba(15, 17, 23, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 2px 10px rgba(0,0,0,0.3);
  animation-name: dsh-danmaku-slide; animation-timing-function: linear;
  animation-fill-mode: both; will-change: transform;
  backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
}
.dsh-danmaku-tone-ok    { border-color: rgba(52, 199, 123, 0.65); }
.dsh-danmaku-tone-error { border-color: rgba(255, 82, 82, 0.75); }
.dsh-danmaku-kind-user  { border-color: rgba(250, 204, 21, 0.65); }
.dsh-danmaku-kind-tool-call  { border-color: rgba(96, 165, 250, 0.65); }
.dsh-danmaku-kind-tool-result.dsh-danmaku-tone-ok  { border-color: rgba(52, 199, 123, 0.65); }
.dsh-danmaku-kind-turn  { border-color: rgba(168, 85, 247, 0.65); }
@keyframes dsh-danmaku-slide {
  from { transform: translateX(100vw); }
  to   { transform: translateX(-110%); }
}
.dsh-danmaku-control {
  position: fixed; top: 12px; right: 16px; pointer-events: auto; z-index: 1000;
  display: flex; align-items: center; gap: 8px; user-select: none;
  padding: 5px 12px; border-radius: 999px;
  background: rgba(15, 17, 23, 0.65); border: 1px solid rgba(255,255,255,0.1);
  color: #e5e7eb; font-size: 12px; cursor: pointer;
  transition: background 0.15s;
}
.dsh-danmaku-control:hover { background: rgba(30, 32, 38, 0.85); }
.dsh-danmaku-control button {
  all: unset; cursor: pointer; font-weight: 600; font-size: 12px; padding: 0 4px;
  color: #e5e7eb; transition: color 0.1s;
}
.dsh-danmaku-control button:hover { color: #fff; }
.dsh-danmaku-control .dsh-danmaku-on  { color: #34d399; }
.dsh-danmaku-control .dsh-danmaku-off { color: #f87171; }
.dsh-danmaku-control input[type=range] {
  width: 80px; height: 4px; accent-color: #818cf8; cursor: pointer;
  -webkit-appearance: none; appearance: none; background: rgba(255,255,255,0.15);
  border-radius: 2px; outline: none;
}
.dsh-danmaku-control input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%;
  background: #818cf8; border: 2px solid rgba(255,255,255,0.3); cursor: pointer;
}
.dsh-danmaku-speed-label { color: #9ca3af; min-width: 36px; text-align: right; font-variant-numeric: tabular-nums; }
`
  document.head.appendChild(style)
  cssInjected = true
}

// ─── 主组件 ───────────────────────────────────────────────────────────

export function DanmakuOverlay({ bus, settings }: { bus: DanmakuBus; settings: SettingsStore }) {
  // 注入 CSS（模块级单次，这里用 useEffect 兜底）
  useEffect(() => { injectCss() }, [])

  // 读取 setting
  const snap = useSyncExternalStore(
    useCallback((cb: () => void) => settings.subscribe(cb), [settings]),
    useCallback(() => settings.getSnapshot(), [settings]),
  )

  // 活跃弹幕列表
  const [items, setItems] = useState<ActiveDanmaku[]>([])
  // 每轨道最后占用结束时间（ms，performance.now 基准）
  const laneEndsRef = useRef<number[]>(Array(LANE_COUNT).fill(0))
  // 并行边界：setItems 闭包内读取最新 ref
  const enabledRef = useRef(snap.enabled)
  enabledRef.current = snap.enabled
  const maxActiveRef = useRef(snap.maxActive)
  maxActiveRef.current = snap.maxActive

  // 订阅总线
  useEffect(() => {
    return bus.subscribe((item: DanmakuItem) => {
      if (!enabledRef.current) return
      const now = performance.now()

      // 选最早空闲轨道（argmin laneEnds）
      let lane = 0
      for (let i = 1; i < LANE_COUNT; i++) {
        if (laneEndsRef.current[i] < laneEndsRef.current[lane]) lane = i
      }

      // 估算弹幕宽度，算动画时长
      const estWidth = 28 + item.text.length * 14.5
      const distance = window.innerWidth + estWidth + 80
      const duration = (distance / snap.speed) * 1000
      laneEndsRef.current[lane] = now + duration

      const active: ActiveDanmaku = { ...item, lane, duration }

      setItems((prev) => {
        if (prev.length >= maxActiveRef.current) {
          // 腾出最旧的一条
          return [...prev.slice(1), active]
        }
        return [...prev, active]
      })
    })
  }, [bus, snap.speed])

  // 移除已播完的弹幕
  const handleAnimationEnd = useCallback((id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id))
  }, [])

  // 自动清理（切换到关时清空列表中弹幕）
  useEffect(() => {
    if (!snap.enabled) setItems([])
  }, [snap.enabled])

  return (
    <div className="dsh-danmaku-layer" aria-hidden="true">
      {snap.enabled && items.map((item) => {
        const toneClass = item.tone !== 'neutral' ? `dsh-danmaku-tone-${item.tone}` : ''
        const kindClass = `dsh-danmaku-kind-${item.kind}`
        return (
          <div
            key={item.id}
            className={`dsh-danmaku-item ${toneClass} ${kindClass}`}
            style={{
              top: LANE_TOP + item.lane * LANE_HEIGHT,
              animationDuration: `${item.duration}ms`,
            }}
            onAnimationEnd={() => handleAnimationEnd(item.id)}
          >
            <span>{item.text}</span>
          </div>
        )
      })}
      <ControlPanel settings={settings} snap={snap} />
    </div>
  )
}

// ─── 控制面板 ─────────────────────────────────────────────────────────

function ControlPanel({ settings, snap }: { settings: SettingsStore; snap: ReturnType<SettingsStore['getSnapshot']> }) {
  const toggle = useCallback(() => {
    settings.update((d) => { d.enabled = !d.enabled })
  }, [settings])

  const handleSpeed = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    settings.update((d) => { d.speed = Number(e.target.value) })
  }, [settings])

  return (
    <div className="dsh-danmaku-control" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={toggle}
        className={snap.enabled ? 'dsh-danmaku-on' : 'dsh-danmaku-off'}
        title={snap.enabled ? '关闭弹幕' : '开启弹幕'}
      >
        {snap.enabled ? '弹幕 开' : '弹幕 关'}
      </button>
      <input
        type="range"
        min={60}
        max={350}
        step={10}
        value={snap.speed}
        onChange={handleSpeed}
        title="滚动速度"
      />
      <span className="dsh-danmaku-speed-label">{snap.speed}px/s</span>
    </div>
  )
}