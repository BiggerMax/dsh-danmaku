/**
 * 弹幕层（纯原生 DOM，不依赖 React）。
 * 直接挂载到 document.body。
 */
import type { DanmakuBus } from './bus'
import type { DanmakuItem } from './types'
import type { SettingsStore, SnapEdge } from './settings'

const LANE_COUNT = 6
const LANE_HEIGHT = 28
const TOP_GAP = 60
const BOTTOM_GAP = 90
const STYLE_ID = 'dsh-danmaku-css'
const SNAP_THRESHOLD = 48 // 拖到距屏幕边缘 48px 内 → 贴边自动收纳
const CTRL_W = 210        // 控制条估算宽度（边缘判定用）
const CTRL_H = 30         // 控制条估算高度（边缘判定用）

let cssInjected = false
function injectCss(): void {
  if (typeof document === 'undefined') return
  if (cssInjected) return
  if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`)) { cssInjected = true; return }
  const s = document.createElement('style')
  s.dataset.pluginCss = STYLE_ID
  s.textContent = `
.dsh-danmaku-layer { position:fixed; inset:0; pointer-events:none; overflow:hidden; z-index:999; }
.dsh-danmaku-item {
  position:absolute; left:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:60vw;
  padding:3px 14px; border-radius:999px; font-size:14px; line-height:22px; font-weight:600; color:#fff;
  background:rgba(15,17,23,0.78); border:1px solid rgba(255,255,255,0.14);
  box-shadow:0 2px 12px rgba(0,0,0,0.32); text-shadow:0 1px 2px rgba(0,0,0,0.45);
  animation-name:dsh-danmaku-slide; animation-timing-function:linear; animation-fill-mode:both; will-change:transform;
  backdrop-filter:blur(3px); -webkit-backdrop-filter:blur(3px);
}
.dsh-danmaku-tone-ok    { border-color:rgba(52,199,123,0.7); box-shadow:0 2px 12px rgba(0,0,0,0.32), 0 0 8px rgba(52,199,123,0.18); }
.dsh-danmaku-tone-error { border-color:rgba(255,82,82,0.78); box-shadow:0 2px 12px rgba(0,0,0,0.32), 0 0 8px rgba(255,82,82,0.22); }
.dsh-danmaku-kind-user  { border-color:rgba(250,204,21,0.68); }
.dsh-danmaku-kind-tool-call { border-color:rgba(96,165,250,0.68); }
.dsh-danmaku-kind-tool-result.dsh-danmaku-tone-ok { border-color:rgba(52,199,123,0.7); }
.dsh-danmaku-kind-turn  { border-color:rgba(168,85,247,0.68); }
@keyframes dsh-danmaku-slide { from { transform:translateX(100vw); } to { transform:translateX(-110%); } }
.dsh-danmaku-control {
  position:fixed; pointer-events:auto; z-index:1000;
  display:flex; align-items:center; gap:8px; user-select:none;
  padding:5px 12px; border-radius:999px;
  background:rgba(15,17,23,0.72); border:1px solid rgba(255,255,255,0.12);
  color:#e5e7eb; font-size:12px; cursor:grab;
  box-shadow:0 4px 14px rgba(0,0,0,0.3); transition:box-shadow 0.15s, background 0.15s;
}
.dsh-danmaku-control:hover { background:rgba(30,32,38,0.88); box-shadow:0 6px 20px rgba(0,0,0,0.4); }
.dsh-danmaku-control.dragging { cursor:grabbing; box-shadow:0 8px 28px rgba(0,0,0,0.5); opacity:0.92; }
.dsh-danmaku-control .drag-handle { color:#6b7280; font-size:14px; letter-spacing:1px; padding:0 2px; opacity:0.6; }
.dsh-danmaku-control:hover .drag-handle { opacity:0.9; }
.dsh-danmaku-control .dsh-danmaku-switch {
  position:relative; width:36px; height:20px; border-radius:999px; padding:0; flex:none;
  cursor:pointer; transition:background 0.22s, border-color 0.22s, box-shadow 0.22s;
  background:linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04));
  border:1px solid rgba(255,255,255,0.18);
  box-shadow:inset 0 1px 2px rgba(0,0,0,0.35);
}
.dsh-danmaku-control .dsh-danmaku-switch .dsh-danmaku-switch-knob {
  position:absolute; top:2px; left:2px; width:14px; height:14px; border-radius:50%;
  background:#6b7280; border:1px solid rgba(255,255,255,0.3);
  box-shadow:0 1px 3px rgba(0,0,0,0.45);
  transition:transform 0.24s cubic-bezier(0.34,1.56,0.64,1), background 0.2s, border-color 0.2s, box-shadow 0.2s;
}
.dsh-danmaku-control .dsh-danmaku-switch:hover { border-color:rgba(255,255,255,0.38); }
.dsh-danmaku-control .dsh-danmaku-switch.on {
  background:linear-gradient(180deg, #34d399, #10b981);
  border-color:rgba(52,211,153,0.6);
  box-shadow:inset 0 1px 2px rgba(0,0,0,0.2), 0 0 10px rgba(52,211,153,0.35);
}
.dsh-danmaku-control .dsh-danmaku-switch.on .dsh-danmaku-switch-knob {
  transform:translateX(16px); background:#fff; border-color:rgba(255,255,255,0.9);
  box-shadow:0 1px 4px rgba(0,0,0,0.4);
}
.dsh-danmaku-control .dsh-danmaku-switch:focus-visible { outline:2px solid rgba(129,140,248,0.7); outline-offset:2px; }
.dsh-danmaku-control .dsh-danmaku-switch-label { color:#d1d5db; font-size:12px; font-weight:600; user-select:none; }
.dsh-danmaku-control .dsh-danmaku-switch-label.off { color:#9ca3af; }
.dsh-danmaku-control input[type=range] {
  width:72px; height:4px; accent-color:#818cf8; cursor:pointer;
  -webkit-appearance:none; appearance:none; background:rgba(255,255,255,0.15); border-radius:2px; outline:none;
}
.dsh-danmaku-control input[type=range]::-webkit-slider-thumb {
  -webkit-appearance:none; width:14px; height:14px; border-radius:50%;
  background:#818cf8; border:2px solid rgba(255,255,255,0.3); cursor:pointer;
}
.dsh-danmaku-speed-label { color:#9ca3af; min-width:34px; text-align:right; font-variant-numeric:tabular-nums; }
.dsh-danmaku-control.hidden { display:none; }
.dsh-danmaku-tab {
  position:fixed; z-index:1000; pointer-events:auto; cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  min-width:28px; height:26px; padding:0 10px; border-radius:999px;
  background:rgba(15,17,23,0.72); border:1px solid rgba(255,255,255,0.12);
  color:#e5e7eb; font-size:12px; font-weight:600; user-select:none;
  box-shadow:0 4px 14px rgba(0,0,0,0.3); transition:background 0.15s, box-shadow 0.15s;
}
.dsh-danmaku-tab:hover { background:rgba(30,32,38,0.9); box-shadow:0 6px 20px rgba(0,0,0,0.4); }
.dsh-danmaku-tab.hidden { display:none; }
`
  document.head.appendChild(s)
  cssInjected = true
}

export function mountDanmakuOverlay(bus: DanmakuBus, settings: SettingsStore): () => void {
  injectCss()

  const container = document.createElement('div')
  container.className = 'dsh-danmaku-layer'
  container.dataset.plugin = 'dsh-danmaku'
  document.body.appendChild(container)

  const items: Array<{ el: HTMLDivElement }> = []
  const laneEndsTop = new Array(LANE_COUNT).fill(0)
  const laneEndsBot = new Array(LANE_COUNT).fill(0)

  const ctrl = document.createElement('div')
  ctrl.className = 'dsh-danmaku-control'
  const dragHandle = document.createElement('span')
  dragHandle.className = 'drag-handle'
  dragHandle.textContent = '⋮⋮'
  const toggleBtn = document.createElement('button')
  toggleBtn.className = 'dsh-danmaku-switch'
  toggleBtn.type = 'button'
  toggleBtn.setAttribute('role', 'switch')
  toggleBtn.setAttribute('aria-checked', 'true')
  const toggleKnob = document.createElement('span')
  toggleKnob.className = 'dsh-danmaku-switch-knob'
  toggleBtn.appendChild(toggleKnob)
  const toggleLabel = document.createElement('span')
  toggleLabel.className = 'dsh-danmaku-switch-label'
  toggleLabel.textContent = '弹幕'
  const speedInput = document.createElement('input')
  speedInput.type = 'range'; speedInput.min = '60'; speedInput.max = '350'; speedInput.step = '10'
  const speedLabel = document.createElement('span')
  speedLabel.className = 'dsh-danmaku-speed-label'
  ctrl.appendChild(dragHandle); ctrl.appendChild(toggleBtn); ctrl.appendChild(toggleLabel)
  ctrl.appendChild(speedInput); ctrl.appendChild(speedLabel)
  document.body.appendChild(ctrl)

  // 控制条真实尺寸缓存：收纳/展开时 display:none 导致 offsetWidth/Height 为 0，
  // 无法测量——在可见时（挂载/拖动/展开态）测量并缓存，避免估算值偏差把右侧裁掉。
  let lastCtrlW = 0
  let lastCtrlH = 0
  function ctrlSize(): { w: number; h: number } {
    const w = ctrl.offsetWidth
    const h = ctrl.offsetHeight
    if (w > 0) lastCtrlW = w
    if (h > 0) lastCtrlH = h
    return { w: lastCtrlW || CTRL_W, h: lastCtrlH || CTRL_H }
  }
  // 挂载时即测量一次（此时可见）
  ctrlSize()

  // 收纳标签：贴边收起时只剩这个小胶囊，悬停/点击展开
  const tab = document.createElement('div')
  tab.className = 'dsh-danmaku-tab hidden'
  tab.textContent = '弹幕'
  document.body.appendChild(tab)

  function positionTab(edge: SnapEdge, pos: { top: number; left: number }): void {
    tab.style.top = ''; tab.style.left = ''; tab.style.right = ''; tab.style.bottom = ''
    if (edge === 'left' || edge === 'right') tab.style.top = pos.top + 'px'
    if (edge === 'top' || edge === 'bottom') tab.style.left = pos.left + 'px'
    if (edge === 'left') tab.style.left = '0px'
    if (edge === 'right') tab.style.right = '0px'
    if (edge === 'top') tab.style.top = '0px'
    if (edge === 'bottom') tab.style.bottom = '0px'
  }

  function refreshControlUI(): void {
    const snap = settings.getSnapshot()
    toggleBtn.className = 'dsh-danmaku-switch ' + (snap.enabled ? 'on' : 'off')
    toggleBtn.setAttribute('aria-checked', String(snap.enabled))
    toggleLabel.className = 'dsh-danmaku-switch-label' + (snap.enabled ? '' : ' off')
    speedInput.value = String(snap.speed)
    speedLabel.textContent = snap.speed + 'px/s'
    const collapsed = !!snap.edge && !!snap.collapsed
    ctrl.classList[collapsed ? 'add' : 'remove']('hidden')
    tab.classList[collapsed ? 'remove' : 'add']('hidden')
    if (collapsed && snap.edge) {
      positionTab(snap.edge, snap.pos)
    } else {
      ctrl.style.top = snap.pos.top + 'px'
      ctrl.style.left = snap.pos.left + 'px'
    }
  }
  settings.subscribe(refreshControlUI)
  refreshControlUI()

  let dragging = false
  let dragStartX = 0, dragStartY = 0, dragStartLeft = 0, dragStartTop = 0
  // 收纳后标签在光标下重新出现会触发 mouseenter → 立即展开，看起来像没隐藏。
  // 用冷却窗口抑制这次误展开（点击/触摸展开不受影响）。
  const EXPAND_COOLDOWN_MS = 600
  let lastCollapseAt = 0
  // 悬停展开 = 窥视：鼠标离开控制条时自动收起回原边缘标签；点击/触摸展开或拖动后不自动收。
  let expandedByHover = false
  let hoverEdge: SnapEdge | null = null
  function onDown(e: MouseEvent | TouchEvent): void {
    const t = e.target as HTMLElement
    if (t.tagName === 'BUTTON' || t.tagName === 'INPUT') return
    // 开始拖动 = 用户主动操作，之后的 mouseleave 不应自动收纳
    expandedByHover = false
    hoverEdge = null
    const cx = e instanceof MouseEvent ? e.clientX : (e.touches?.[0]?.clientX ?? 0)
    const cy = e instanceof MouseEvent ? e.clientY : (e.touches?.[0]?.clientY ?? 0)
    dragging = true
    ctrl.classList.add('dragging')
    dragStartX = cx; dragStartY = cy
    const p = settings.getSnapshot().pos
    dragStartLeft = p.left; dragStartTop = p.top
  }
  function onMove(e: MouseEvent | TouchEvent): void {
    if (!dragging) return
    const cx = e instanceof MouseEvent ? e.clientX : (e.touches?.[0]?.clientX ?? dragStartX)
    const cy = e instanceof MouseEvent ? e.clientY : (e.touches?.[0]?.clientY ?? dragStartY)
    const dx = cx - dragStartX, dy = cy - dragStartY
    settings.update((d) => {
      d.pos.left = Math.max(0, Math.min(window.innerWidth - 240, dragStartLeft + dx))
      d.pos.top = Math.max(0, Math.min(window.innerHeight - 44, dragStartTop + dy))
    })
  }
  function onUp(): void {
    if (!dragging) return
    dragging = false
    ctrl.classList.remove('dragging')
    // 释放时距某条屏幕边缘足够近 → 贴边收纳；否则保持自由悬浮
    const p = settings.getSnapshot().pos
    const { w: W, h: H } = ctrlSize()
    const dists: Record<SnapEdge, number> = {
      left: p.left,
      right: window.innerWidth - (p.left + W),
      top: p.top,
      bottom: window.innerHeight - (p.top + H),
    }
    let best: SnapEdge | null = null
    let bestD = Infinity
    for (const k of Object.keys(dists) as SnapEdge[]) {
      if (dists[k] < bestD) { bestD = dists[k]; best = k }
    }
    if (best !== null && bestD <= SNAP_THRESHOLD) {
      const next = { ...p }
      if (best === 'left') next.left = 0
      if (best === 'right') next.left = Math.max(0, window.innerWidth - W)
      if (best === 'top') next.top = 0
      if (best === 'bottom') next.top = Math.max(0, window.innerHeight - H)
      lastCollapseAt = Date.now()
      settings.update((d) => { d.pos = next; d.edge = best; d.collapsed = true })
    }
  }
  /** 从收纳标签展开：回到贴近该边缘的完整控制条。 */
  function expand(): void {
    const snap = settings.getSnapshot()
    if (!snap.edge || !snap.collapsed) return
    const { w: W, h: H } = ctrlSize()
    const p = { ...snap.pos }
    if (snap.edge === 'left') p.left = 8
    else if (snap.edge === 'right') p.left = Math.max(0, window.innerWidth - W - 8)
    else if (snap.edge === 'top') p.top = 8
    else if (snap.edge === 'bottom') p.top = Math.max(0, window.innerHeight - H - 8)
    settings.update((d) => { d.pos = p; d.edge = null; d.collapsed = false })
  }
  /** 收起回指定边缘的标签（贴边吸附）。 */
  function collapseToTab(edge: SnapEdge): void {
    const { w: W, h: H } = ctrlSize()
    settings.update((d) => {
      const p = { ...d.pos }
      if (edge === 'left') p.left = 0
      else if (edge === 'right') p.left = Math.max(0, window.innerWidth - W)
      else if (edge === 'top') p.top = 0
      else if (edge === 'bottom') p.top = Math.max(0, window.innerHeight - H)
      d.pos = p
      d.edge = edge
      d.collapsed = true
    })
  }
  // 悬停展开 = 窥视：记录来源边缘，鼠标离开时自动收起
  tab.addEventListener('mouseenter', () => {
    if (Date.now() - lastCollapseAt < EXPAND_COOLDOWN_MS) return
    const snap = settings.getSnapshot()
    if (!snap.edge || !snap.collapsed) return
    hoverEdge = snap.edge
    expandedByHover = true
    expand()
  })
  // 点击/触摸展开 = 主动钉住，不自动收
  tab.addEventListener('click', () => { expandedByHover = false; expand() })
  tab.addEventListener('touchstart', () => { expandedByHover = false; expand() }, { passive: true })
  ctrl.addEventListener('mouseleave', () => {
    if (!expandedByHover || dragging) return
    const edge = hoverEdge
    expandedByHover = false
    hoverEdge = null
    if (!edge) return
    lastCollapseAt = Date.now()
    collapseToTab(edge)
  })
  ctrl.addEventListener('mousedown', onDown)
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  ctrl.addEventListener('touchstart', onDown)
  window.addEventListener('touchmove', onMove)
  window.addEventListener('touchend', onUp)

  toggleBtn.addEventListener('click', () => {
    settings.update((d) => { d.enabled = !d.enabled })
    if (!settings.getSnapshot().enabled) items.forEach((it) => it.el.remove()); items.length = 0
  })
  speedInput.addEventListener('input', () => {
    settings.update((d) => { d.speed = Number(speedInput.value) })
  })

  bus.subscribe((item: DanmakuItem) => {
    const snap = settings.getSnapshot()
    if (!snap.enabled) return
    const band = Math.random() < 0.5 ? 'top' : 'bottom'
    const laneEnds = band === 'top' ? laneEndsTop : laneEndsBot
    let lane = 0
    for (let i = 1; i < LANE_COUNT; i++) { if (laneEnds[i] < laneEnds[lane]) lane = i }
    const now = performance.now()
    const estWidth = 28 + item.text.length * 14.5
    const distance = window.innerWidth + estWidth + 80
    const duration = (distance / snap.speed) * 1000
    laneEnds[lane] = now + duration

    const el = document.createElement('div')
    el.className = 'dsh-danmaku-item'
    if (item.tone !== 'neutral') el.classList.add('dsh-danmaku-tone-' + item.tone)
    el.classList.add('dsh-danmaku-kind-' + item.kind)
    const span = document.createElement('span')
    span.textContent = item.text
    el.appendChild(span)
    if (band === 'top') el.style.top = (TOP_GAP + lane * LANE_HEIGHT) + 'px'
    else el.style.bottom = (BOTTOM_GAP + lane * LANE_HEIGHT) + 'px'
    el.style.animationDuration = duration + 'ms'
    el.addEventListener('animationend', () => { el.remove() })
    container.appendChild(el)
    items.push({ el })
    if (items.length > snap.maxActive) items.shift()?.el.remove()
  })

  return () => {
    container.remove()
    ctrl.remove()
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    window.removeEventListener('touchmove', onMove)
    window.removeEventListener('touchend', onUp)
  }
}