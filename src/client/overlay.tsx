/**
 * 弹幕层（纯原生 DOM，不依赖 React）。
 * 直接挂载到 document.body。
 */
import type { DanmakuBus } from './bus'
import type { DanmakuItem } from './types'
import type { DanmakuKind, DanmakuTheme, DanmakuDensity, DanmakuRegion, DanmakuDirection, SettingsStore, SnapEdge } from './settings'
import { ALL_THEMES, THEME_LABEL, ALL_DENSITIES, DENSITY_LANES, DENSITY_LABEL, DENSITY_EMOJI, ALL_REGIONS, REGION_LABEL, REGION_EMOJI, ALL_DIRECTIONS, DIRECTION_LABEL, DIRECTION_EMOJI } from './settings'

// kind (DanmakuItem) → settings.filters 中的布尔键
const FILTER_KEY: Record<DanmakuKind, string> = {
  'user': 'user',
  'assistant': 'assistant',
  'tool-call': 'toolCall',
  'tool-result': 'toolResult',
  'turn': 'turn',
  'subagent': 'subagent',
  'thinking': 'thinking',
}
const KIND_EMOJI: Record<DanmakuKind, string> = {
  'user': '👤',
  'assistant': '🤖',
  'tool-call': '⚙️',
  'tool-result': '✅',
  'turn': '🚀',
  'subagent': '🧠',
  'thinking': '💭',
}
const KIND_ORDER: DanmakuKind[] = ['user', 'assistant', 'tool-call', 'tool-result', 'turn', 'subagent', 'thinking']

// 主题切换：按 ALL_THEMES 顺序循环
const THEME_ORDER = ALL_THEMES
const THEME_EMOJI: Record<DanmakuTheme, string> = {
  'classic': '🎨',
  'neon': '✨',
  'cyber': '🤖',
  'cinema': '🎬',
  'mono': '🔤',
  'battle': '⚔️',
}

const LANE_HEIGHT = 28
const TOP_GAP = 60
const BOTTOM_GAP = 90
const STYLE_ID = 'dsh-danmaku-css'
const SNAP_THRESHOLD = 48 // 拖到距屏幕边缘 48px 内 → 贴边自动收纳
const CTRL_W = 210        // 控制条估算宽度（边缘判定用）
const CTRL_H = 30         // 控制条估算高度（边缘判定用）

// 密度切换：按 ALL_DENSITIES 顺序循环
const DENSITY_ORDER = ALL_DENSITIES

let cssInjected = false
function injectCss(): void {
  if (typeof document === 'undefined') return
  if (cssInjected) return
  if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`)) { cssInjected = true; return }
  const s = document.createElement('style')
  s.dataset.pluginCss = STYLE_ID
  s.textContent = `
.dsh-danmaku-layer { position:fixed; inset:0; pointer-events:none; overflow:hidden; z-index:999; }

/* ── 基础（经典）弹幕样式 ── */
.dsh-danmaku-item {
  --danmaku-duration: 8s;
  position:absolute; left:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:60vw;
  padding:3px 14px; border-radius:999px; font-size:14px; line-height:22px; font-weight:600; color:#fff;
  background:rgba(15,17,23,0.78); border:1px solid rgba(255,255,255,0.14);
  box-shadow:0 2px 12px rgba(0,0,0,0.32); text-shadow:0 1px 2px rgba(0,0,0,0.45);
  animation-name:dsh-danmaku-slide; animation-duration:var(--danmaku-duration); animation-timing-function:linear; animation-fill-mode:both; will-change:transform;
  backdrop-filter:blur(3px); -webkit-backdrop-filter:blur(3px);
  pointer-events:auto; cursor:pointer; transition:transform 0.1s, box-shadow 0.1s;
}
.dsh-danmaku-item:hover { transform:scale(1.04); box-shadow:0 4px 20px rgba(0,0,0,0.5); z-index:998; }
.dsh-danmaku-tone-ok    { border-color:rgba(52,199,123,0.7); box-shadow:0 2px 12px rgba(0,0,0,0.32), 0 0 8px rgba(52,199,123,0.18); }
.dsh-danmaku-tone-error { border-color:rgba(255,82,82,0.78); box-shadow:0 2px 12px rgba(0,0,0,0.32), 0 0 8px rgba(255,82,82,0.22); animation:dsh-danmaku-slide var(--danmaku-duration) linear both, dsh-danmaku-error-pulse 0.8s ease-in-out infinite; }
@keyframes dsh-danmaku-error-pulse {
  0%,100% { box-shadow:0 2px 12px rgba(0,0,0,0.32), 0 0 8px rgba(255,82,82,0.22); }
  50% { box-shadow:0 2px 12px rgba(0,0,0,0.32), 0 0 20px rgba(255,82,82,0.55); border-color:rgba(255,82,82,1); }
}
.dsh-danmaku-kind-user  { border-color:rgba(250,204,21,0.68); }
.dsh-danmaku-kind-tool-call { border-color:rgba(96,165,250,0.68); }
.dsh-danmaku-kind-tool-result.dsh-danmaku-tone-ok { border-color:rgba(52,199,123,0.7); }
.dsh-danmaku-kind-turn  { border-color:rgba(168,85,247,0.68); }
.dsh-danmaku-kind-subagent { border-color:rgba(245,158,11,0.7); box-shadow:0 2px 12px rgba(0,0,0,0.32), 0 0 10px rgba(245,158,11,0.25); }
.dsh-danmaku-kind-thinking { border-color:rgba(99,102,241,0.75); box-shadow:0 2px 12px rgba(0,0,0,0.32), 0 0 12px rgba(129,140,248,0.28); }

/* ── 霓虹主题：彩色发光、渐变色、发光脉冲 ── */
.dsh-danmaku-layer[data-theme="neon"] .dsh-danmaku-item {
  background:rgba(0,0,0,0.82); border:1px solid rgba(255,255,255,0.35);
  font-size:13px; letter-spacing:0.3px;
  text-shadow:0 0 6px currentColor, 0 0 12px currentColor;
  animation:dsh-danmaku-slide var(--danmaku-duration) linear both, dsh-danmaku-neon-glow 2s ease-in-out infinite;
  box-shadow:0 0 16px currentColor;
}
.dsh-danmaku-layer[data-theme="neon"] .dsh-danmaku-item .dsh-danmaku-text {
  background:linear-gradient(90deg,#06b6d4,#a855f7,#ec4899,#f97316,#06b6d4);
  background-size:200% 100%;
  -webkit-background-clip:text; background-clip:text;
  -webkit-text-fill-color:transparent; color:transparent;
  animation:dsh-danmaku-neon-shimmer 4s linear infinite;
}
.dsh-danmaku-layer[data-theme="neon"] .dsh-danmaku-kind-user { border-color:#fbbf24; color:#fbbf24; }
.dsh-danmaku-layer[data-theme="neon"] .dsh-danmaku-kind-assistant { border-color:#34d399; color:#34d399; }
.dsh-danmaku-layer[data-theme="neon"] .dsh-danmaku-kind-tool-call { border-color:#60a5fa; color:#60a5fa; }
.dsh-danmaku-layer[data-theme="neon"] .dsh-danmaku-kind-turn { border-color:#c084fc; color:#c084fc; }
.dsh-danmaku-layer[data-theme="neon"] .dsh-danmaku-kind-subagent { border-color:#f59e0b; color:#f59e0b; }
.dsh-danmaku-layer[data-theme="neon"] .dsh-danmaku-kind-thinking { border-color:#818cf8; color:#818cf8; }
.dsh-danmaku-layer[data-theme="neon"] .dsh-danmaku-tone-error { border-color:#f87171; color:#f87171; }
@keyframes dsh-danmaku-neon-glow {
  0%,100% { filter:brightness(1); }
  50% { filter:brightness(1.15); }
}
@keyframes dsh-danmaku-neon-shimmer {
  0% { background-position:0% 50%; }
  100% { background-position:200% 50%; }
}

/* ── 赛博朋克主题：深黑背景、青/洋红双色调、扫描线、等宽字体 ── */
.dsh-danmaku-layer[data-theme="cyber"] .dsh-danmaku-item {
  background:rgba(0,0,0,0.92); border:1px solid #00ff9f;
  color:#00ff9f; font-family:ui-monospace,"SFMono-Regular",monospace; font-size:12px;
  text-shadow:0 0 4px #00ff9f, 0 0 8px rgba(0,255,159,0.4);
  box-shadow:0 0 8px rgba(0,255,159,0.3), inset 0 0 4px rgba(0,255,159,0.1);
  padding:3px 12px; border-radius:2px;
  backdrop-filter:none; -webkit-backdrop-filter:none;
}
.dsh-danmaku-layer[data-theme="cyber"] .dsh-danmaku-item::before {
  content:''; position:absolute; inset:0; pointer-events:none;
  background:repeating-linear-gradient(0deg, transparent 0 2px, rgba(0,255,159,0.04) 2px 3px);
}
.dsh-danmaku-layer[data-theme="cyber"] .dsh-danmaku-kind-user { border-color:#ff0080; color:#ff0080; text-shadow:0 0 4px #ff0080; }
.dsh-danmaku-layer[data-theme="cyber"] .dsh-danmaku-kind-assistant { border-color:#00e0ff; color:#00e0ff; text-shadow:0 0 4px #00e0ff; }
.dsh-danmaku-layer[data-theme="cyber"] .dsh-danmaku-kind-tool-call { border-color:#f0ff00; color:#f0ff00; text-shadow:0 0 4px #f0ff00; }
.dsh-danmaku-layer[data-theme="cyber"] .dsh-danmaku-kind-turn { border-color:#ff6b6b; color:#ff6b6b; text-shadow:0 0 4px #ff6b6b; }
.dsh-danmaku-layer[data-theme="cyber"] .dsh-danmaku-kind-subagent { border-color:#ff0080; color:#ff0080; text-shadow:0 0 4px #ff0080, 0 0 8px #00e0ff; }
.dsh-danmaku-layer[data-theme="cyber"] .dsh-danmaku-kind-thinking { border-color:#7c3aed; color:#a78bfa; text-shadow:0 0 4px #a78bfa; }
.dsh-danmaku-layer[data-theme="cyber"] .dsh-danmaku-tone-error { border-color:#ff0040; color:#ff0040; }

/* ── 电影字幕主题：深色背景、白色字体、衬线体、字间距大、上下留白 ── */
.dsh-danmaku-layer[data-theme="cinema"] .dsh-danmaku-item {
  background:rgba(0,0,0,0.7); border:1px solid rgba(255,255,255,0.2);
  color:#f5f5f0; font-family:Georgia,"Times New Roman",serif; font-size:14px; font-weight:400;
  letter-spacing:1px; padding:8px 20px; border-radius:2px;
  box-shadow:0 4px 20px rgba(0,0,0,0.5); text-shadow:0 1px 3px rgba(0,0,0,0.8);
  backdrop-filter:none; -webkit-backdrop-filter:none;
}
.dsh-danmaku-layer[data-theme="cinema"] .dsh-danmaku-kind-user { border-color:rgba(255,215,0,0.5); color:#fff5cc; }
.dsh-danmaku-layer[data-theme="cinema"] .dsh-danmaku-kind-assistant { border-color:rgba(180,180,200,0.4); color:#e8e8f0; }
.dsh-danmaku-layer[data-theme="cinema"] .dsh-danmaku-kind-tool-call { border-color:rgba(100,149,237,0.5); color:#cce0ff; }
.dsh-danmaku-layer[data-theme="cinema"] .dsh-danmaku-kind-turn { border-color:rgba(255,200,100,0.5); color:#ffe4b5; }
.dsh-danmaku-layer[data-theme="cinema"] .dsh-danmaku-kind-subagent { border-color:rgba(200,100,255,0.5); color:#e8d0ff; }
.dsh-danmaku-layer[data-theme="cinema"] .dsh-danmaku-kind-thinking { border-color:rgba(120,140,200,0.5); color:#d0d8f0; }
.dsh-danmaku-layer[data-theme="cinema"] .dsh-danmaku-tone-error { border-color:rgba(220,50,50,0.6); color:#ffcccc; }

/* ── 极简等宽主题：纯黑底、灰色字体、无边框、只有文字 ── */
.dsh-danmaku-layer[data-theme="mono"] .dsh-danmaku-item {
  background:transparent; border:none;
  color:#9ca3af; font-family:ui-monospace,"SFMono-Regular",monospace; font-size:12px; font-weight:400;
  box-shadow:none; text-shadow:none; backdrop-filter:none; -webkit-backdrop-filter:none;
  padding:0 10px; border-radius:0; line-height:20px;
}
.dsh-danmaku-layer[data-theme="mono"] .dsh-danmaku-kind-user { color:#fbbf24; }
.dsh-danmaku-layer[data-theme="mono"] .dsh-danmaku-kind-assistant { color:#9ca3af; }
.dsh-danmaku-layer[data-theme="mono"] .dsh-danmaku-kind-tool-call { color:#93c5fd; }
.dsh-danmaku-layer[data-theme="mono"] .dsh-danmaku-kind-turn { color:#c4b5fd; }
.dsh-danmaku-layer[data-theme="mono"] .dsh-danmaku-kind-subagent { color:#f59e0b; }
.dsh-danmaku-layer[data-theme="mono"] .dsh-danmaku-tone-ok { color:#6ee7b7; }
.dsh-danmaku-layer[data-theme="mono"] .dsh-danmaku-tone-error { color:#fca5a5; }

/* ── 战斗模式：RPG HUD + 技能色彩 ── */
.dsh-danmaku-layer[data-theme="battle"] { background:radial-gradient(ellipse at center, rgba(20,10,40,0.08), transparent 65%); }
.dsh-danmaku-layer[data-theme="battle"] .dsh-danmaku-item {
  background:linear-gradient(135deg,rgba(30,15,60,0.94),rgba(8,12,30,0.94));
  border:1px solid rgba(250,204,21,0.62); border-radius:5px;
  font-family:ui-monospace,"SFMono-Regular",monospace; letter-spacing:.3px;
  box-shadow:0 0 10px rgba(250,204,21,.18), inset 0 0 12px rgba(99,102,241,.12);
  text-shadow:0 0 5px currentColor;
}
.dsh-danmaku-layer[data-theme="battle"] .dsh-danmaku-kind-tool-call { border-color:#60a5fa; color:#bfdbfe; }
.dsh-danmaku-layer[data-theme="battle"] .dsh-danmaku-kind-tool-result.dsh-danmaku-tone-ok { border-color:#34d399; color:#a7f3d0; }
.dsh-danmaku-layer[data-theme="battle"] .dsh-danmaku-kind-subagent { border-color:#c084fc; color:#e9d5ff; }
.dsh-danmaku-layer[data-theme="battle"] .dsh-danmaku-kind-thinking { border-color:#818cf8; color:#c7d2fe; }
.dsh-danmaku-layer[data-theme="battle"] .dsh-danmaku-tone-error { border-color:#fb7185; color:#fecdd3; }
.dsh-danmaku-layer[data-theme="battle"] .dsh-danmaku-effect-tool-read { border-left:4px solid #38bdf8; }
.dsh-danmaku-layer[data-theme="battle"] .dsh-danmaku-effect-tool-search { border-left:4px solid #a78bfa; }
.dsh-danmaku-layer[data-theme="battle"] .dsh-danmaku-effect-tool-edit { border-left:4px solid #facc15; }
.dsh-danmaku-layer[data-theme="battle"] .dsh-danmaku-effect-tool-shell { border-left:4px solid #4ade80; }
.dsh-danmaku-layer[data-theme="battle"] .dsh-danmaku-effect-tool-web { border-left:4px solid #22d3ee; }
.dsh-danmaku-layer[data-theme="battle"] .dsh-danmaku-effect-tool-git { border-left:4px solid #fb923c; }
.dsh-danmaku-layer[data-theme="battle"] .dsh-danmaku-effect-tool-package { border-left:4px solid #f472b6; }
.dsh-danmaku-layer[data-theme="battle"] .dsh-danmaku-effect-tool-flow { border-left:4px solid #c084fc; }
.dsh-danmaku-effect-combo { animation:dsh-danmaku-slide var(--danmaku-duration) linear both, dsh-danmaku-combo-pulse .7s ease-in-out infinite; }
@keyframes dsh-danmaku-combo-pulse { 50% { transform:scale(1.08); filter:brightness(1.35); } }
.dsh-danmaku-celebration {
  position:fixed; inset:0; z-index:1003; pointer-events:none; display:flex; align-items:center; justify-content:center;
  font-size:clamp(28px,6vw,72px); font-weight:900; letter-spacing:2px; text-shadow:0 0 18px currentColor;
  animation:dsh-danmaku-celebrate-in 2.2s ease-out forwards;
}
.dsh-danmaku-celebration.victory { color:#facc15; }
.dsh-danmaku-celebration.defeat { color:#fb7185; }
@keyframes dsh-danmaku-celebrate-in { 0% { opacity:0; transform:scale(.6); } 12% { opacity:1; transform:scale(1.08); } 24% { transform:scale(1); } 78% { opacity:1; } 100% { opacity:0; transform:scale(1.15); } }
.dsh-danmaku-particle { position:fixed; width:7px; height:7px; border-radius:50%; animation:dsh-danmaku-particle-fly 1.5s ease-out forwards; }
@keyframes dsh-danmaku-particle-fly { from { opacity:1; transform:translate(0,0) scale(1); } to { opacity:0; transform:translate(var(--dx),var(--dy)) rotate(360deg) scale(.2); } }

@keyframes dsh-danmaku-slide { from { transform:translateX(100vw); } to { transform:translateX(-110%); } }
@keyframes dsh-danmaku-slide-ltr { from { transform:translateX(-110%); } to { transform:translateX(100vw); } }
.dsh-danmaku-item.dsh-danmaku-dir-ltr { animation-name:dsh-danmaku-slide-ltr !important; }
.dsh-danmaku-layer[data-theme="neon"] .dsh-danmaku-item.dsh-danmaku-dir-ltr { animation:dsh-danmaku-slide-ltr var(--danmaku-duration) linear both, dsh-danmaku-neon-glow 2s ease-in-out infinite !important; }

/* ── 入场/出场动画（经典主题） ── */
@keyframes dsh-danmaku-fade-in { from { opacity:0; } to { opacity:1; } }
@keyframes dsh-danmaku-fade-out { from { opacity:1; } to { opacity:0; } }
.dsh-danmaku-item .dsh-danmaku-text {
  display:inline-block; animation:dsh-danmaku-fade-in 0.3s ease-out;
}
.dsh-danmaku-item.dsh-danmaku-fading-out .dsh-danmaku-text { animation:dsh-danmaku-fade-out 0.25s ease-in forwards; }

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
.dsh-danmaku-control.paused { background:rgba(30,20,10,0.88); border-color:rgba(250,204,21,0.35); box-shadow:0 4px 14px rgba(0,0,0,0.4), 0 0 12px rgba(250,204,21,0.1); }
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

/* ── 弹幕详情面板 ── */
.dsh-danmaku-detail {
  position:fixed; left:50%; top:50%; transform:translate(-50%,-50%);
  z-index:1002; pointer-events:auto;
  width:min(480px, 90vw); max-height:80vh;
  background:rgba(15,17,23,0.94); border:1px solid rgba(255,255,255,0.16);
  border-radius:14px; padding:18px 22px;
  color:#e5e7eb; font-size:13px; line-height:1.6;
  box-shadow:0 12px 40px rgba(0,0,0,0.55); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);
  animation:dsh-danmaku-detail-in 0.2s ease-out;
  display:flex; flex-direction:column; gap:8px;
}
@keyframes dsh-danmaku-detail-in {
  from { opacity:0; transform:translate(-50%,-50%) scale(0.94); }
  to { opacity:1; transform:translate(-50%,-50%) scale(1); }
}
@keyframes dsh-danmaku-slide-in-right {
  from { opacity:0; transform:translateX(100%); }
  to { opacity:1; transform:translateX(0); }
}
@keyframes dsh-danmaku-backdrop-fade {
  from { opacity:0; }
  to { opacity:1; }
}
.dsh-danmaku-detail-header {
  display:flex; align-items:center; gap:8px; font-weight:600; font-size:14px;
  color:#fff; padding-bottom:6px; border-bottom:1px solid rgba(255,255,255,0.1);
}
.dsh-danmaku-detail-body {
  flex:1; overflow:auto; word-break:break-word; max-width:100%;
}
.dsh-danmaku-detail-meta {
  display:flex; flex-wrap:wrap; gap:6px 12px;
  color:#9ca3af; font-size:11px; font-variant-numeric:tabular-nums;
  padding-top:6px; border-top:1px solid rgba(255,255,255,0.08);
}
.dsh-danmaku-detail-meta span { display:inline-flex; align-items:center; gap:3px; }
.dsh-danmaku-detail-close {
  position:absolute; top:8px; right:10px;
  width:22px; height:22px; border-radius:6px; border:none;
  background:rgba(255,255,255,0.08); color:#9ca3af; cursor:pointer;
  font-size:13px; line-height:22px; text-align:center; padding:0;
  transition:background 0.15s;
}
.dsh-danmaku-detail-close:hover { background:rgba(255,255,255,0.16); color:#e5e7eb; }
.dsh-danmaku-detail-backdrop {
  position:fixed; inset:0; z-index:1001; pointer-events:auto;
  background:rgba(0,0,0,0.35); animation:dsh-danmaku-detail-in 0.15s ease-out;
}

/* ── 弹幕历史面板 ── */
.dsh-danmaku-history {
  position:fixed; right:12px; top:56px; bottom:12px;
  z-index:1001; pointer-events:auto;
  width:min(380px, calc(100vw - 24px));
  background:rgba(15,17,23,0.94); border:1px solid rgba(255,255,255,0.14);
  border-radius:14px; display:flex; flex-direction:column;
  box-shadow:0 12px 40px rgba(0,0,0,0.55); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);
  animation:dsh-danmaku-slide-in-right 0.28s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.dsh-danmaku-history-header {
  display:flex; align-items:center; justify-content:space-between;
  padding:10px 14px; border-bottom:1px solid rgba(255,255,255,0.1);
  font-size:13px; font-weight:600; color:#e5e7eb;
}
.dsh-danmaku-history-header .dsh-danmaku-history-count {
  font-size:11px; color:#9ca3af; font-weight:400; margin-left:8px;
}
.dsh-danmaku-history-body {
  flex:1; overflow-y:auto; padding:6px 0;
}
.dsh-danmaku-history-item {
  display:flex; align-items:flex-start; gap:8px;
  padding:5px 14px; cursor:pointer; transition:background 0.1s;
  font-size:12px; line-height:1.5;
  animation:dsh-danmaku-item-in 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay:calc(var(--i, 0) * 32ms + 100ms);
  opacity:0;
}
@keyframes dsh-danmaku-item-in {
  from { opacity:0; transform:translateY(6px); }
  to { opacity:1; transform:translateY(0); }
}
.dsh-danmaku-history-item:hover { background:rgba(255,255,255,0.06); }
.dsh-danmaku-history-item .dsh-danmaku-history-emoji { flex:none; font-size:13px; }
.dsh-danmaku-history-item .dsh-danmaku-history-text { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#d1d5db; }
.dsh-danmaku-history-item .dsh-danmaku-history-time { flex:none; font-size:10px; color:#6b7280; font-variant-numeric:tabular-nums; padding-top:2px; }
.dsh-danmaku-history-item.tone-ok .dsh-danmaku-history-text { color:#6ee7b7; }
.dsh-danmaku-history-item.tone-error .dsh-danmaku-history-text { color:#fca5a5; }
.dsh-danmaku-history-item.tone-error .dsh-danmaku-history-emoji { filter:brightness(1.3); }
.dsh-danmaku-history-empty {
  padding:40px 20px; text-align:center; color:#6b7280; font-size:12px;
}
.dsh-danmaku-history-close {
  width:22px; height:22px; border-radius:6px; border:none;
  background:rgba(255,255,255,0.08); color:#9ca3af; cursor:pointer;
  font-size:13px; line-height:22px; text-align:center; padding:0;
  transition:background 0.15s;
}
.dsh-danmaku-history-close:hover { background:rgba(255,255,255,0.16); color:#e5e7eb; }
.dsh-danmaku-history-backdrop {
  position:fixed; inset:0; z-index:1000; pointer-events:auto;
  background:rgba(0,0,0,0.2);
  animation:dsh-danmaku-backdrop-fade 0.22s ease-out both;
}

/* 类型筛选 + 主题切换容器 */
.dsh-danmaku-filters {
  display:flex; gap:3px; align-items:center; padding:0 6px; margin-left:2px;
  border-left:1px solid rgba(255,255,255,0.12);
}
.dsh-danmaku-filter {
  display:inline-flex; align-items:center; justify-content:center;
  width:22px; height:22px; border-radius:6px;
  background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.22);
  cursor:pointer; font-size:12px; line-height:1; padding:0;
  transition:background 0.18s, border-color 0.18s, opacity 0.18s, transform 0.12s;
}
.dsh-danmaku-filter:hover { background:rgba(255,255,255,0.14); }
.dsh-danmaku-filter.active { border-color:rgba(129,140,248,0.6); background:rgba(129,140,248,0.12); }
.dsh-danmaku-filter.active:hover { background:rgba(129,140,248,0.22); }
.dsh-danmaku-filter.inactive { opacity:0.32; filter:grayscale(0.8); }
.dsh-danmaku-filter:focus-visible { outline:2px solid rgba(129,140,248,0.7); outline-offset:1px; }

.dsh-danmaku-theme-toggle {
  display:inline-flex; align-items:center; justify-content:center;
  min-width:44px; height:22px; padding:0 8px; border-radius:6px;
  background:rgba(129,140,248,0.1); border:1px solid rgba(129,140,248,0.35);
  cursor:pointer; font-size:11px; font-weight:600; line-height:1; padding:0 8px;
  color:#a5b4fc; letter-spacing:0.3px;
  transition:background 0.18s, border-color 0.18s, color 0.18s, transform 0.12s;
  white-space:nowrap;
}
.dsh-danmaku-theme-toggle:hover { background:rgba(129,140,248,0.22); border-color:rgba(129,140,248,0.55); }
.dsh-danmaku-theme-toggle:focus-visible { outline:2px solid rgba(129,140,248,0.7); outline-offset:1px; }
`
  document.head.appendChild(s)
  cssInjected = true
}

export function mountDanmakuOverlay(bus: DanmakuBus, settings: SettingsStore): () => void {
  injectCss()

  const container = document.createElement('div')
  container.className = 'dsh-danmaku-layer'
  container.dataset.plugin = 'dsh-danmaku'
  container.dataset.theme = 'classic'
  document.body.appendChild(container)

  const items: Array<{ el: HTMLDivElement }> = []
  // 密度驱动的轨道数组：初始化时按默认密度，之后随设置变化动态调整
  let laneEndsTop = new Array(DENSITY_LANES['normal']).fill(0)
  let laneEndsBot = new Array(DENSITY_LANES['normal']).fill(0)

  function ensureLanes(): void {
    const lanes = DENSITY_LANES[settings.getSnapshot().density]
    if (laneEndsTop.length !== lanes) {
      laneEndsTop = new Array(lanes).fill(0)
      laneEndsBot = new Array(lanes).fill(0)
    }
  }

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
  // ── 类型筛选按钮 ──
  const filterContainer = document.createElement('div')
  filterContainer.className = 'dsh-danmaku-filters'
  const filterButtons: Record<DanmakuKind, HTMLButtonElement> = {} as Record<DanmakuKind, HTMLButtonElement>
  for (const kind of KIND_ORDER) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'dsh-danmaku-filter active'
    btn.textContent = KIND_EMOJI[kind]
    btn.title = `${KIND_EMOJI[kind]} ${kind}`
    btn.setAttribute('aria-pressed', 'true')
    btn.dataset.kind = kind
    btn.addEventListener('click', () => {
      const key = FILTER_KEY[kind]
      settings.update((d) => {
        const f = d.filters
        if (key === 'user') f.user = !f.user
        else if (key === 'assistant') f.assistant = !f.assistant
        else if (key === 'toolCall') f.toolCall = !f.toolCall
        else if (key === 'toolResult') f.toolResult = !f.toolResult
        else if (key === 'turn') f.turn = !f.turn
      })
    })
    filterButtons[kind] = btn
    filterContainer.appendChild(btn)
  }
  // ── 主题切换按钮 ──
  const themeToggle = document.createElement('button')
  themeToggle.type = 'button'
  themeToggle.className = 'dsh-danmaku-theme-toggle'
  themeToggle.title = '弹幕样式主题（点击切换）'
  themeToggle.textContent = THEME_EMOJI['classic'] + ' ' + THEME_LABEL['classic']
  themeToggle.addEventListener('click', () => {
    const snap = settings.getSnapshot()
    const curIdx = THEME_ORDER.indexOf(snap.theme)
    const nextTheme = THEME_ORDER[(curIdx + 1) % THEME_ORDER.length]
    settings.update((d) => { d.theme = nextTheme })
  })
  // ── 密度切换按钮 ──
  const densityToggle = document.createElement('button')
  densityToggle.type = 'button'
  densityToggle.className = 'dsh-danmaku-theme-toggle'
  densityToggle.title = '弹幕密度（点击切换）'
  densityToggle.textContent = DENSITY_EMOJI['normal'] + ' ' + DENSITY_LABEL['normal']
  densityToggle.addEventListener('click', () => {
    const snap = settings.getSnapshot()
    const curIdx = DENSITY_ORDER.indexOf(snap.density)
    const nextDensity = DENSITY_ORDER[(curIdx + 1) % DENSITY_ORDER.length]
    settings.update((d) => { d.density = nextDensity })
  })
  // ── 区域切换按钮 ──
  const regionToggle = document.createElement('button')
  regionToggle.type = 'button'
  regionToggle.className = 'dsh-danmaku-theme-toggle'
  regionToggle.title = '弹幕显示区域（点击切换）'
  regionToggle.textContent = REGION_EMOJI['full'] + ' ' + REGION_LABEL['full']
  regionToggle.addEventListener('click', () => {
    const snap = settings.getSnapshot()
    const curIdx = ALL_REGIONS.indexOf(snap.region)
    const nextRegion = ALL_REGIONS[(curIdx + 1) % ALL_REGIONS.length]
    settings.update((d) => { d.region = nextRegion })
  })
  // ── 方向切换按钮 ──
  const dirToggle = document.createElement('button')
  dirToggle.type = 'button'
  dirToggle.className = 'dsh-danmaku-theme-toggle'
  dirToggle.title = '弹幕滚动方向（点击切换）'
  dirToggle.textContent = DIRECTION_EMOJI['rtl'] + ' ' + DIRECTION_LABEL['rtl']
  dirToggle.addEventListener('click', () => {
    const snap = settings.getSnapshot()
    const curIdx = ALL_DIRECTIONS.indexOf(snap.direction)
    const nextDir = ALL_DIRECTIONS[(curIdx + 1) % ALL_DIRECTIONS.length]
    settings.update((d) => { d.direction = nextDir })
  })
  // ── 历史按钮 ──
  const historyBtn = document.createElement('button')
  historyBtn.type = 'button'
  historyBtn.className = 'dsh-danmaku-theme-toggle'
  historyBtn.title = '弹幕历史（最近 500 条）'
  historyBtn.textContent = '📜 历史'
  historyBtn.addEventListener('click', () => {
    if (historyPanel) { hideHistory(); return }
    showHistory()
  })
  const speedInput = document.createElement('input')
  speedInput.type = 'range'; speedInput.min = '60'; speedInput.max = '350'; speedInput.step = '10'
  const speedLabel = document.createElement('span')
  speedLabel.className = 'dsh-danmaku-speed-label'
  ctrl.appendChild(dragHandle); ctrl.appendChild(toggleBtn); ctrl.appendChild(toggleLabel)
  ctrl.appendChild(filterContainer)
  ctrl.appendChild(themeToggle)
  ctrl.appendChild(densityToggle)
  ctrl.appendChild(regionToggle)
  ctrl.appendChild(dirToggle)
  ctrl.appendChild(historyBtn)
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
    // 暂停时切换标签为「⏸ 暂停」
    const paused = snap.enabled && snap.paused
    toggleLabel.className = 'dsh-danmaku-switch-label' + (!snap.enabled ? ' off' : (paused ? ' off' : ''))
    toggleLabel.textContent = paused ? '⏸ 暂停' : '弹幕'
    ctrl.classList.toggle('paused', paused)
    speedInput.value = String(snap.speed)
    speedLabel.textContent = snap.speed + 'px/s'
    // 更新主题按钮
    const emoji = THEME_EMOJI[snap.theme] || THEME_EMOJI['classic']
    const label = THEME_LABEL[snap.theme] || THEME_LABEL['classic']
    themeToggle.textContent = emoji + ' ' + label
    // 应用主题到弹幕层
    container.dataset.theme = snap.theme
    const dEmoji = DENSITY_EMOJI[snap.density] || DENSITY_EMOJI['normal']
    const dLabel = DENSITY_LABEL[snap.density] || DENSITY_LABEL['normal']
    densityToggle.textContent = dEmoji + ' ' + dLabel
    ensureLanes()
    const rEmoji = REGION_EMOJI[snap.region] || REGION_EMOJI['full']
    const rLabel = REGION_LABEL[snap.region] || REGION_LABEL['full']
    regionToggle.textContent = rEmoji + ' ' + rLabel
    const dirEmoji = DIRECTION_EMOJI[snap.direction] || DIRECTION_EMOJI['rtl']
    const dirLabel = DIRECTION_LABEL[snap.direction] || DIRECTION_LABEL['rtl']
    dirToggle.textContent = dirEmoji + ' ' + dirLabel
    // 更新筛选按钮状态
    for (const kind of KIND_ORDER) {
      const btn = filterButtons[kind]
      const key = FILTER_KEY[kind]
      const visible =
        key === 'user' ? snap.filters.user
          : key === 'assistant' ? snap.filters.assistant
          : key === 'toolCall' ? snap.filters.toolCall
          : key === 'toolResult' ? snap.filters.toolResult
          : key === 'turn' ? snap.filters.turn
          : key === 'subagent' ? snap.filters.subagent
          : snap.filters.thinking
      btn.classList.toggle('active', !!visible)
      btn.classList.toggle('inactive', !visible)
      btn.setAttribute('aria-pressed', String(visible))
    }
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

  // 双击控制条暂停/继续：清除已排队弹幕并切换暂停态
  let lastClickAt = 0
  ctrl.addEventListener('click', (e) => {
    // 忽略按钮/输入框上的点击（它们有自己的 handler）
    if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).tagName === 'INPUT') return
    const now = Date.now()
    if (now - lastClickAt < 320) {
      // 双击：仅当已启用时切换暂停态
      if (!settings.getSnapshot().enabled) return
      settings.update((d) => { d.paused = !d.paused })
      if (settings.getSnapshot().paused) {
        // 暂停：清掉当前排队的弹幕，释放轨道
        items.forEach((it) => it.el.remove()); items.length = 0
      }
      lastClickAt = 0
    } else {
      lastClickAt = now
    }
  })

  toggleBtn.addEventListener('click', () => {
    settings.update((d) => { d.enabled = !d.enabled })
    if (!settings.getSnapshot().enabled) items.forEach((it) => it.el.remove()); items.length = 0
  })
  speedInput.addEventListener('input', () => {
    settings.update((d) => { d.speed = Number(speedInput.value) })
  })

  // ── 弹幕详情面板 ──
  let detailPanel: HTMLDivElement | null = null
  let detailBackdrop: HTMLDivElement | null = null
  let detailItem: DanmakuItem | null = null

  function fmtTime(ts: number): string {
    const d = new Date(ts)
    return d.toLocaleTimeString('zh-CN', { hour12: false })
  }

  function showDetail(item: DanmakuItem): void {
    if (detailPanel) return
    detailItem = item
    items.forEach((it) => { it.el.style.animationPlayState = 'paused' })

    const backdrop = document.createElement('div')
    backdrop.className = 'dsh-danmaku-detail-backdrop'
    document.body.appendChild(backdrop)

    const panel = document.createElement('div')
    panel.className = 'dsh-danmaku-detail'
    const header = document.createElement('div')
    header.className = 'dsh-danmaku-detail-header'
    const emoji = KIND_EMOJI[item.kind] || '📄'
    header.textContent = `${emoji} ${item.kind}`
    const body = document.createElement('div')
    body.className = 'dsh-danmaku-detail-body'
    body.textContent = item.text
    const meta = document.createElement('div')
    meta.className = 'dsh-danmaku-detail-meta'
    const timeEl = document.createElement('span')
    timeEl.textContent = '🕐 ' + fmtTime(item.time)
    meta.appendChild(timeEl)
    if (item.durationMs != null) {
      const durEl = document.createElement('span')
      durEl.textContent = '⏱ ' + fmtDuration(item.durationMs)
      meta.appendChild(durEl)
    }
    const toneEl = document.createElement('span')
    toneEl.textContent = item.tone === 'ok' ? '✅ 成功' : item.tone === 'error' ? '❌ 失败' : '—'
    meta.appendChild(toneEl)
    panel.appendChild(header); panel.appendChild(body); panel.appendChild(meta)
    const closeBtn = document.createElement('button')
    closeBtn.className = 'dsh-danmaku-detail-close'
    closeBtn.textContent = '✕'
    closeBtn.addEventListener('click', closeDetail)
    panel.appendChild(closeBtn)
    document.body.appendChild(panel)

    detailPanel = panel
    detailBackdrop = backdrop

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeDetail(); window.removeEventListener('keydown', onKey) }
    }
    window.addEventListener('keydown', onKey)
    backdrop.addEventListener('click', closeDetail)
  }

  function closeDetail(): void {
    if (detailPanel) detailPanel.remove(); detailPanel = null
    if (detailBackdrop) detailBackdrop.remove(); detailBackdrop = null
    detailItem = null
    items.forEach((it) => { it.el.style.animationPlayState = '' })
  }

  function onDanmakuClick(item: DanmakuItem, el: HTMLDivElement): void {
    el.addEventListener('click', (e) => { e.stopPropagation(); showDetail(item) })
    el.addEventListener('touchend', (e) => { e.stopPropagation(); showDetail(item) }, { passive: true })
  }

  // ── 弹幕历史面板 ──
  let historyPanel: HTMLDivElement | null = null
  let historyBackdrop: HTMLDivElement | null = null
  let historyData: DanmakuItem[] = []

  function showHistory(): void {
    if (historyPanel) return
    historyData = bus.getHistory().slice().reverse()

    const backdrop = document.createElement('div')
    backdrop.className = 'dsh-danmaku-history-backdrop'
    document.body.appendChild(backdrop)

    const panel = document.createElement('div')
    panel.className = 'dsh-danmaku-history'

    const header = document.createElement('div')
    header.className = 'dsh-danmaku-history-header'
    header.textContent = '📜 弹幕历史'
    const countEl = document.createElement('span')
    countEl.className = 'dsh-danmaku-history-count'
    countEl.textContent = `(${historyData.length} 条)`
    header.appendChild(countEl)
    const closeBtn = document.createElement('button')
    closeBtn.className = 'dsh-danmaku-history-close'
    closeBtn.textContent = '✕'
    closeBtn.addEventListener('click', hideHistory)
    header.appendChild(closeBtn)

    // 搜索 + 导出栏
    const searchRow = document.createElement('div')
    searchRow.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 14px;border-bottom:1px solid rgba(255,255,255,0.08);'
    const searchInput = document.createElement('input')
    searchInput.type = 'text'
    searchInput.placeholder = '🔍 搜索弹幕…'
    searchInput.style.cssText = 'flex:1;min-width:0;padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.06);color:#e5e7eb;font-size:12px;outline:none;'
    const exportBtn = document.createElement('button')
    exportBtn.className = 'dsh-danmaku-theme-toggle'
    exportBtn.title = '导出弹幕历史为 JSON'
    exportBtn.textContent = '📥 导出'
    exportBtn.style.fontSize = '11px'
    exportBtn.style.padding = '0 8px'
    exportBtn.addEventListener('click', () => {
      try {
        const data = JSON.stringify(historyData, null, 2)
        const blob = new Blob([data], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `dsh-danmaku-history-${new Date().toISOString().slice(0,10)}.json`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        URL.revokeObjectURL(url)
      } catch { /* ignore */ }
    })
    searchRow.appendChild(searchInput); searchRow.appendChild(exportBtn)

    // 过滤函数
    function applySearch(): void {
      const q = searchInput.value.trim().toLowerCase()
      const items = body.querySelectorAll('.dsh-danmaku-history-item')
      items.forEach((row) => {
        const text = row.querySelector('.dsh-danmaku-history-text')?.textContent || ''
        row.style.display = (!q || text.toLowerCase().includes(q)) ? '' : 'none'
      })
    }
    searchInput.addEventListener('input', applySearch)

    // 统计行
    let totalDur = 0, durCount = 0, errorCount = 0
    for (const item of historyData) {
      if (item.durationMs != null) { totalDur += item.durationMs; durCount++ }
      if (item.tone === 'error') errorCount++
    }
    const stats = document.createElement('div')
    stats.className = 'dsh-danmaku-history-stats'
    stats.style.cssText = 'padding:8px 14px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;gap:14px;font-size:11px;color:#9ca3af;flex-wrap:wrap;'
    stats.innerHTML =
      `<span>📊 总计 ${historyData.length} 条</span>` +
      `<span>❌ 错误 ${errorCount} 条</span>` +
      (durCount > 0 ? `<span>⏱ 平均 ${(totalDur / durCount / 1000).toFixed(1)}s (${durCount} 条含耗时)</span>` : `<span>⏱ 无耗时记录</span>`)

    const body = document.createElement('div')
    body.className = 'dsh-danmaku-history-body'

    if (historyData.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'dsh-danmaku-history-empty'
      empty.textContent = '暂无弹幕记录'
      body.appendChild(empty)
    } else {
      let idx = 0
      for (const item of historyData) {
        const row = document.createElement('div')
        row.className = 'dsh-danmaku-history-item' + (item.tone !== 'neutral' ? ` tone-${item.tone}` : '')
        row.style.setProperty('--i', String(idx++))
        const emojiEl = document.createElement('span')
        emojiEl.className = 'dsh-danmaku-history-emoji'
        emojiEl.textContent = KIND_EMOJI[item.kind] || '📄'
        const textEl = document.createElement('span')
        textEl.className = 'dsh-danmaku-history-text'
        textEl.textContent = item.text
        const timeEl = document.createElement('span')
        timeEl.className = 'dsh-danmaku-history-time'
        timeEl.textContent = fmtTime(item.time)
        row.appendChild(emojiEl); row.appendChild(textEl); row.appendChild(timeEl)
        row.addEventListener('click', () => { hideHistory(); showDetail(item) })
        body.appendChild(row)
      }
    }

    panel.appendChild(header); panel.appendChild(stats); panel.appendChild(searchRow); panel.appendChild(body)
    document.body.appendChild(panel)
    historyPanel = panel
    historyBackdrop = backdrop
    backdrop.addEventListener('click', hideHistory)
  }

  function hideHistory(): void {
    if (historyPanel) historyPanel.remove(); historyPanel = null
    if (historyBackdrop) historyBackdrop.remove(); historyBackdrop = null
    historyData = []
  }

  // ── 浏览器通知 ──
  function notify(title: string, body: string): void {
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'granted') {
      try {
        const n = new Notification(title, { body, tag: 'dsh-danmaku' })
        n.onclose = () => { /* ignore */ }
      } catch { /* ignore */ }
    }
  }

  // 首次启用时请求通知权限（通过点击控制条触发）
  let notifiedPermission = false
  ctrl.addEventListener('mouseenter', () => {
    if (!notifiedPermission && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      notifiedPermission = true
      try { Notification.requestPermission() } catch { /* ignore */ }
    }
  }, { once: true })

  // ── 全局快捷键 ──
  function isInputFocused(): boolean {
    const el = document.activeElement
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'
      || (el as HTMLElement).isContentEditable)
  }

  function celebrate(effect: 'victory' | 'defeat'): void {
    const banner = document.createElement('div')
    banner.className = `dsh-danmaku-celebration ${effect}`
    banner.textContent = effect === 'victory' ? '🏆 VICTORY!' : '💥 DEFEAT'
    document.body.appendChild(banner)
    if (effect === 'victory') {
      const colors = ['#facc15', '#34d399', '#60a5fa', '#f472b6', '#c084fc']
      for (let i = 0; i < 28; i++) {
        const p = document.createElement('i')
        p.className = 'dsh-danmaku-particle'
        p.style.left = '50%'; p.style.top = '50%'
        p.style.background = colors[i % colors.length]
        p.style.setProperty('--dx', `${Math.round(Math.cos(i / 28 * Math.PI * 2) * (120 + Math.random() * 260))}px`)
        p.style.setProperty('--dy', `${Math.round(Math.sin(i / 28 * Math.PI * 2) * (90 + Math.random() * 220))}px`)
        document.body.appendChild(p)
        setTimeout(() => p.remove(), 1700)
      }
    }
    setTimeout(() => banner.remove(), 2400)
  }

  window.addEventListener('keydown', (e) => {
    if (detailPanel) return // 详情面板打开时交给面板的 handler
    if (isInputFocused()) return // 输入框中不拦截

    const snap = settings.getSnapshot()

    if (e.key === ' ' && !e.repeat && !e.shiftKey) {
      e.preventDefault()
      if (snap.enabled) {
        settings.update((d) => { d.paused = !d.paused })
        if (settings.getSnapshot().paused) {
          items.forEach((it) => it.el.remove()); items.length = 0
        }
      }
    } else if ((e.key === '+' || e.key === '=' || e.key === '-') && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      if (e.key === '-' || e.key === '+') {
        const delta = e.key === '-' ? -20 : 20
        settings.update((d) => {
          d.speed = Math.max(60, Math.min(350, d.speed + delta))
        })
      }
    }
  })

  bus.subscribe((item: DanmakuItem) => {
    const snap = settings.getSnapshot()
    if (!snap.enabled) return
    // 暂停时跳过新弹幕，已播放的继续
    if (snap.paused) return
    // 按类型过滤：该项所属类型的筛选器关闭则跳过
    const fkey = FILTER_KEY[item.kind]
    const visible =
      fkey === 'user' ? snap.filters.user
        : fkey === 'assistant' ? snap.filters.assistant
        : fkey === 'toolCall' ? snap.filters.toolCall
        : fkey === 'toolResult' ? snap.filters.toolResult
        : fkey === 'turn' ? snap.filters.turn
        : fkey === 'subagent' ? snap.filters.subagent
        : snap.filters.thinking
    if (!visible) return
    // 区域：full 随机上下，top 仅顶部，bottom 仅底部
    let band: 'top' | 'bottom'
    if (snap.region === 'top') band = 'top'
    else if (snap.region === 'bottom') band = 'bottom'
    else band = Math.random() < 0.5 ? 'top' : 'bottom'
    // 方向：ltr 反向动画
    const reversed = snap.direction === 'ltr'
    const laneEnds = band === 'top' ? laneEndsTop : laneEndsBot
    // 重要信息（错误）优先占靠前的轨道（屏幕上部），普通弹幕选最早空闲
    let lane = 0
    if (item.tone === 'error') {
      // 错误弹幕：选最先空闲的靠前轨道（前 3 条优先）
      const priority = Math.min(3, laneEnds.length)
      for (let i = 0; i < priority; i++) { if (laneEnds[i] < laneEnds[lane]) lane = i }
    } else {
      for (let i = 1; i < laneEnds.length; i++) { if (laneEnds[i] < laneEnds[lane]) lane = i }
    }
    const now = performance.now()
    const estWidth = 28 + item.text.length * 14.5
    const distance = window.innerWidth + estWidth + 80
    // 自适应速度：弹幕密集时减速，稀疏时加速
    const baseSpeed = snap.speed
    const adaptiveSpeed = items.length > 20 ? Math.max(60, baseSpeed * 0.7)
      : items.length > 10 ? baseSpeed * 0.9
      : items.length < 5 && baseSpeed < 300 ? Math.min(350, baseSpeed * 1.2)
      : baseSpeed
    const duration = (distance / adaptiveSpeed) * 1000
    laneEnds[lane] = now + duration

    const el = document.createElement('div')
    el.className = 'dsh-danmaku-item'
    if (item.tone !== 'neutral') el.classList.add('dsh-danmaku-tone-' + item.tone)
    el.classList.add('dsh-danmaku-kind-' + item.kind)
    if (item.effect) el.classList.add('dsh-danmaku-effect-' + item.effect)
    if (item.toolName) el.dataset.tool = item.toolName
    if (reversed) el.classList.add('dsh-danmaku-dir-ltr')
    // 文字包裹在 span 中（霓虹主题用 background-clip:text）
    const span = document.createElement('span')
    span.className = 'dsh-danmaku-text'
    span.textContent = item.text
    el.appendChild(span)
    if (band === 'top') el.style.top = (TOP_GAP + lane * LANE_HEIGHT) + 'px'
    else el.style.bottom = (BOTTOM_GAP + lane * LANE_HEIGHT) + 'px'
    el.style.setProperty('--danmaku-duration', duration + 'ms')
    onDanmakuClick(item, el)
    // 错误事件 → 浏览器通知
    if (item.tone === 'error' && item.kind === 'turn') {
      notify('🏁 轮次失败', item.text)
    } else if (item.tone === 'error' && item.kind === 'tool-result') {
      notify('❌ 工具调用失败', item.text)
    }
    if (item.effect === 'victory' || item.effect === 'defeat') celebrate(item.effect)
    el.addEventListener('animationend', (e) => {
      // 只响应滑动动画结束；霓虹发光、错误脉冲等 infinite 循环每次循环结束也会触发 animationend，
      // 若不对 animationName 做白名单判断，弹幕会被立即移除
      if (e.animationName === 'dsh-danmaku-slide' || e.animationName === 'dsh-danmaku-slide-ltr') {
        el.remove()
      }
    })
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