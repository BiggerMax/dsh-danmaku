import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { DanmakuBus } from './bus'
import type { DanmakuItem } from './types'
import type { SettingsStore } from './settings'

// ─── 类型 ─────────────────────────────────────────────────────────────

interface ActiveDanmaku extends DanmakuItem {
  /** 弹幕带：顶带 / 底带。 */
  band: 'top' | 'bottom'
  lane: number
  duration: number
}

// ─── 常量 ─────────────────────────────────────────────────────────────

const LANE_COUNT_PER_BAND = 6
const LANE_HEIGHT = 30
const LANE_TOP = 60
const LANE_BOTTOM = 110 // 底带距底部距离（避开输入栏）
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
  position: absolute; left: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60vw;
  padding: 3px 14px; border-radius: 999px; font-size: 14px; line-height: 22px;
  font-weight: 600; color: #fff;
  background: rgba(15, 17, 23, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 2px 12px rgba(0,0,0,0.32), inset 0 0 0 1px rgba(255,255,255,0.04);
  text-shadow: 0 1px 2px rgba(0,0,0,0.45);
  animation-name: dsh-danmaku-slide; animation-timing-function: linear;
  animation-fill-mode: both; will-change: transform;
  backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
}
.dsh-danmaku-tone-ok    { border-color: rgba(52, 199, 123, 0.7); box-shadow: 0 2px 12px rgba(0,0,0,0.32), 0 0 8px rgba(52,199,123,0.18); }
.dsh-danmaku-tone-error { border-color: rgba(255, 82, 82, 0.78); box-shadow: 0 2px 12px rgba(0,0,0,0.32), 0 0 8px rgba(255,82,82,0.22); }
.dsh-danmaku-kind-user  { border-color: rgba(250, 204, 21, 0.68); }
.dsh-danmaku-kind-tool-call  { border-color: rgba(96, 165, 250, 0.68); }
.dsh-danmaku-kind-tool-result.dsh-danmaku-tone-ok  { border-color: rgba(52, 199, 123, 0.7); }
.dsh-danmaku-kind-turn  { border-color: rgba(168, 85, 247, 0.68); }
@keyframes dsh-danmaku-slide {
  from { transform: translateX(100vw); }
  to   { transform: translateX(-110%); }
}
.dsh-danmaku-control {
  position: fixed; pointer-events: auto; z-index: 1000;
  display: flex; align-items: center; gap: 8px; user-select: none;
  padding: 5px 12px; border-radius: 999px;
  background: rgba(15, 17, 23, 0.72); border: 1px solid rgba(255,255,255,0.12);
  color: #e5e7eb; font-size: 12px; cursor: grab;
  box-shadow: 0 4px 14px rgba(0,0,0,0.3);
  transition: box-shadow 0.15s, background 0.15s;
}
.dsh-danmaku-control:hover {
  background: rgba(30, 32, 38, 0.88);
  box-shadow: 0 6px 20px rgba(0,0,0,0.4);
}
.dsh-danmaku-control.dragging {
  cursor: grabbing;
  box-shadow: 0 8px 28px rgba(0,0,0,0.5);
  opacity: 0.92;
}
.dsh-danmaku-control .drag-handle {
  color: #6b7280; font-size: 14px; letter-spacing: 1px;
  padding: 0 2px; opacity: 0.6;
}
.dsh-danmaku-control:hover .drag-handle { opacity: 0.9; }
.dsh-danmaku-control button {
  all: unset; cursor: pointer; font-weight: 600; font-size: 12px; padding: 0 4px;
  color: #e5e7eb; transition: color 0.1s;
}
.dsh-danmaku-control button:hover { color: #fff; }
.dsh-danmaku-control .dsh-danmaku-on  { color: #34d399; }
.dsh-danmaku-control .dsh-danmaku-off { color: #f87171; }
.dsh-danmaku-control input[type=range] {
  width: 72px; height: 4px; accent-color: #818cf8; cursor: pointer;
  -webkit-appearance: none; appearance: none; background: rgba(255,255,255,0.15);
  border-radius: 2px; outline: none;
}
.dsh-danmaku-control input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%;
  background: #818cf8; border: 2px solid rgba(255,255,255,0.3); cursor: pointer;
}
.dsh-danmaku-speed-label { color: #9ca3af; min-width: 34px; text-align: right; font-variant-numeric: tabular-nums; }
`
  document.head.appendChild(style)
  cssInjected = true
}

// ─── 主组件 ───────────────────────────────────────────────────────────

export function DanmakuOverlay({ bus, settings }: { bus: DanmakuBus; settings: SettingsStore }) {
  useEffect(() => { injectCss() }, [])

  const snap = useSyncExternalStore(
    useCallback((cb: () => void) => settings.subscribe(cb), [settings]),
    useCallback(() => settings.getSnapshot(), [settings]),
  )

  const [items, setItems] = useState<ActiveDanmaku[]>([])
  const laneEndsTopRef = useRef<number[]>(Array(LANE_COUNT_PER_BAND).fill(0))
  const laneEndsBotRef = useRef<number[]>(Array(LANE_COUNT_PER_BAND).fill(0))
  const enabledRef = useRef(snap.enabled)
  enabledRef.current = snap.enabled
  const maxActiveRef = useRef(snap.maxActive)
  maxActiveRef.current = snap.maxActive

  useEffect(() => {
    return bus.subscribe((item: DanmakuItem) => {
      if (!enabledRef.current) return
      const now = performance.now()

      // 轮询选择弹幕带（均分流量）
      const band = Math.random() < 0.5 ? 'top' : 'bottom'
      const laneEnds = band === 'top' ? laneEndsTopRef.current : laneEndsBotRef.current

      let lane = 0
      for (let i = 1; i < LANE_COUNT_PER_BAND; i++) {
        if (laneEnds[i] < laneEnds[lane]) lane = i
      }

      const estWidth = 28 + item.text.length * 14.5
      const distance = window.innerWidth + estWidth + 80
      const duration = (distance / snap.speed) * 1000
      laneEnds[lane] = now + duration

      const active: ActiveDanmaku = { ...item, band, lane, duration }

      setItems((prev) => {
        if (prev.length >= maxActiveRef.current) {
          return [...prev.slice(1), active]
        }
        return [...prev, active]
      })
    })
  }, [bus, snap.speed])

  const handleAnimationEnd = useCallback((id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id))
  }, [])

  useEffect(() => {
    if (!snap.enabled) setItems([])
  }, [snap.enabled])

  return (
    <div className="dsh-danmaku-layer" aria-hidden="true">
      {snap.enabled && items.map((active) => {
        const toneClass = active.tone !== 'neutral' ? `dsh-danmaku-tone-${active.tone}` : ''
        const kindClass = `dsh-danmaku-kind-${active.kind}`
        const topStyle = active.band === 'top'
          ? { top: `${LANE_TOP + active.lane * LANE_HEIGHT}px` }
          : {}
        const bottomStyle = active.band === 'bottom'
          ? { bottom: `${LANE_BOTTOM + active.lane * LANE_HEIGHT}px` }
          : {}
        return (
          <div
            key={active.id}
            className={`dsh-danmaku-item ${toneClass} ${kindClass}`}
            style={{ ...topStyle, ...bottomStyle, animationDuration: `${active.duration}ms` }}
            onAnimationEnd={() => handleAnimationEnd(active.id)}
          >
            <span>{active.text}</span>
          </div>
        )
      })}
      <ControlPanel settings={settings} snap={snap} />
    </div>
  )
}

// ─── 可拖拽控制面板 ───────────────────────────────────────────────────

function ControlPanel({ settings, snap }: { settings: SettingsStore; snap: ReturnType<SettingsStore['getSnapshot']> }) {
  const [pos, setPos] = useState({ top: snap.pos.top, left: snap.pos.left })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ startX: number; startY: number; startLeft: number; startTop: number } | null>(null)

  useEffect(() => { if (!dragging) setPos(snap.pos) }, [snap.pos, dragging])

  const handleDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement
    if (t.tagName === 'BUTTON' || t.tagName === 'INPUT' || t.classList.contains('drag-handle')) return
    e.preventDefault()
    setDragging(true)
    dragRef.current = { startX: e.clientX, startY: e.clientY, startLeft: pos.left, startTop: pos.top }
    t.setPointerCapture(e.pointerId)
  }, [pos])

  const handleMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    setPos({
      left: Math.max(0, Math.min(window.innerWidth - 240, dragRef.current.startLeft + dx)),
      top: Math.max(0, Math.min(window.innerHeight - 44, dragRef.current.startTop + dy)),
    })
  }, [dragging])

  const handleUp = useCallback(() => {
    if (!dragging) return
    setDragging(false)
    settings.update((d) => { d.pos = { top: pos.top, left: pos.left } })
  }, [dragging, pos, settings])

  const toggle = useCallback(() => {
    settings.update((d) => { d.enabled = !d.enabled })
  }, [settings])

  const handleSpeed = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    settings.update((d) => { d.speed = Number(e.target.value) })
  }, [settings])

  return (
    <div
      className={`dsh-danmaku-control${dragging ? ' dragging' : ''}`}
      style={{ top: `${pos.top}px`, left: `${pos.left}px` }}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
    >
      <span className="drag-handle">⋮⋮</span>
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