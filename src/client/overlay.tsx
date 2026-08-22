/**
 * 弹幕层（纯原生 DOM，不依赖 React）。
 * 直接挂载到 document.body。
 */
import type { DanmakuBus } from './bus'
import type { DanmakuItem } from './types'
import type { DanmakuKind, DanmakuDensity, DanmakuRegion, DanmakuDirection, SettingsStore, SnapEdge } from './settings'
import { ALL_DENSITIES, DENSITY_LANES, DENSITY_LABEL, DENSITY_EMOJI, ALL_REGIONS, REGION_LABEL, REGION_EMOJI, ALL_DIRECTIONS, DIRECTION_LABEL, DIRECTION_EMOJI } from './settings'
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
/* ── Agent 战场：召唤阵 + 竞速 ── */
.dsh-danmaku-battlefield {
  position:fixed; right:16px; top:56px; z-index:1001; pointer-events:auto;
  width:min(300px, calc(100vw - 32px));
  background:rgba(15,17,23,0.92); border:1px solid rgba(255,255,255,0.14);
  border-radius:14px; box-shadow:0 12px 40px rgba(0,0,0,0.55); backdrop-filter:blur(8px);
  padding:12px 14px; animation:dsh-danmaku-slide-in-right 0.28s cubic-bezier(0.22,1,0.36,1) both;
}
.dsh-danmaku-battlefield h4 { margin:0 0 8px; font-size:12px; font-weight:600; color:#e5e7eb; display:flex; align-items:center; gap:6px; }
.dsh-danmaku-circle-wrap { display:flex; justify-content:center; margin:6px 0 4px; }
.dsh-danmaku-circle { position:relative; width:150px; height:150px; border-radius:50%; border:1px dashed rgba(168,85,247,0.4); }
.dsh-danmaku-circle::before { content:''; position:absolute; inset:34px; border-radius:50%; border:1px solid rgba(168,85,247,0.25); }
.dsh-danmaku-circle-core { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); font-size:28px; filter:drop-shadow(0 0 8px rgba(168,85,247,0.6)); }
.dsh-danmaku-circle-node {
  position:absolute; transform:translate(-50%,-50%); display:flex; align-items:center; gap:4px;
  padding:2px 8px; border-radius:999px; font-size:10px; color:#e9d5ff;
  background:rgba(30,15,60,0.9); border:1px solid rgba(192,132,252,0.6);
  white-space:nowrap; max-width:120px; overflow:hidden; text-overflow:ellipsis; transition:border-color 0.2s;
}
.dsh-danmaku-circle-node.running { border-color:#a78bfa; animation:dsh-danmaku-node-pulse 1.2s ease-in-out infinite; }
.dsh-danmaku-circle-node.ok { border-color:#34d399; color:#a7f3d0; }
.dsh-danmaku-circle-node.error { border-color:#fb7185; color:#fecdd3; }
@keyframes dsh-danmaku-node-pulse { 50% { box-shadow:0 0 10px rgba(167,139,250,0.5); } }
.dsh-danmaku-race { margin-top:8px; border-top:1px solid rgba(255,255,255,0.08); padding-top:6px; }
.dsh-danmaku-race-row { display:flex; align-items:center; gap:6px; padding:3px 0; font-size:11px; }
.dsh-danmaku-race-row .medal { flex:none; width:22px; text-align:center; }
.dsh-danmaku-race-row .name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#d1d5db; }
.dsh-danmaku-race-row .status { flex:none; font-size:10px; }
.dsh-danmaku-race-empty { text-align:center; color:#6b7280; font-size:11px; padding:10px 0; }
/* ── 轨迹雷达：当前轮事件链 ── */
.dsh-danmaku-radar {
  position:fixed; left:50%; transform:translateX(-50%); bottom:16px; z-index:1001; pointer-events:auto;
  display:flex; align-items:center; gap:2px; padding:6px 12px; border-radius:999px;
  background:rgba(15,17,23,0.88); border:1px solid rgba(255,255,255,0.14);
  box-shadow:0 6px 24px rgba(0,0,0,0.4); backdrop-filter:blur(8px);
  max-width:min(560px, calc(100vw - 32px)); overflow-x:auto;
  animation:dsh-danmaku-fade-up 0.2s ease-out both;
}
.dsh-danmaku-radar-node { display:inline-flex; align-items:center; font-size:14px; position:relative; padding:2px 3px; border-radius:6px; transition:transform 0.15s; }
.dsh-danmaku-radar-node.error { background:rgba(255,82,82,0.18); }
.dsh-danmaku-radar-node.current::after { content:''; position:absolute; inset:-2px; border-radius:8px; border:1px solid rgba(129,140,248,0.7); animation:dsh-danmaku-node-pulse 1s ease-in-out infinite; }
.dsh-danmaku-radar-conn { color:#4b5563; font-size:12px; }
.dsh-danmaku-radar-label { color:#9ca3af; font-size:10px; margin-right:4px; white-space:nowrap; }
@keyframes dsh-danmaku-fade-up { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
/* 角落定位面板专用入场：不含 translateX(-50%)，避免整体偏移 */
@keyframes dsh-danmaku-pop-in { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
/* ── 弹幕回放 ── */
.dsh-danmaku-replay {
  position:fixed; left:16px; bottom:16px; z-index:1001; pointer-events:auto;
  width:min(320px, calc(100vw - 32px));
  background:rgba(15,17,23,0.92); border:1px solid rgba(255,255,255,0.14);
  border-radius:14px; box-shadow:0 12px 40px rgba(0,0,0,0.55); backdrop-filter:blur(8px);
  padding:12px 14px; animation:dsh-danmaku-pop-in 0.2s ease-out both;
}
.dsh-danmaku-replay h4 { margin:0 0 8px; font-size:12px; font-weight:600; color:#e5e7eb; }
.dsh-danmaku-replay-controls { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
.dsh-danmaku-replay .play-btn { width:30px; height:30px; border-radius:50%; border:none; cursor:pointer; font-size:13px; background:rgba(129,140,248,0.2); color:#e5e7eb; transition:background 0.15s; }
.dsh-danmaku-replay .play-btn:hover { background:rgba(129,140,248,0.35); }
.dsh-danmaku-replay input[type=range] { flex:1; accent-color:#818cf8; }
.dsh-danmaku-replay .speed-btn { border:none; cursor:pointer; font-size:10px; padding:3px 7px; border-radius:6px; background:rgba(255,255,255,0.08); color:#d1d5db; transition:background 0.15s; }
.dsh-danmaku-replay .speed-btn.active { background:rgba(129,140,248,0.3); color:#fff; }
.dsh-danmaku-replay .replay-time { font-size:10px; color:#9ca3af; text-align:right; }
.dsh-danmaku-replay .replay-empty { text-align:center; color:#6b7280; font-size:11px; padding:8px 0; }
/* ── Token 燃烧炉角标 ── */
.dsh-danmaku-stove {
  position:fixed; left:16px; top:16px; z-index:1001; pointer-events:auto;
  display:flex; align-items:center; gap:6px; padding:5px 12px; border-radius:999px;
  background:rgba(15,17,23,0.88); border:1px solid rgba(255,255,255,0.14);
  box-shadow:0 6px 24px rgba(0,0,0,0.4); backdrop-filter:blur(8px);
  font-size:13px; font-weight:700; color:#fbbf24;
  animation:dsh-danmaku-stove-in 0.25s ease-out both;
}
.dsh-danmaku-stove .stove-sub { font-size:9px; color:#9ca3af; font-weight:400; line-height:1.2; }
.dsh-danmaku-stove.hot { border-color:rgba(251,146,60,0.65); box-shadow:0 0 16px rgba(251,146,60,0.35), 0 6px 24px rgba(0,0,0,0.4); animation:dsh-danmaku-stove-in 0.25s ease-out both, dsh-danmaku-node-pulse 1.4s ease-in-out infinite; }
@keyframes dsh-danmaku-stove-in { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
/* ── 直播间 HUD ── */
.dsh-danmaku-livehud {
  position:fixed; left:50%; transform:translateX(-50%); top:16px; z-index:1001; pointer-events:auto;
  display:flex; align-items:center; gap:10px; padding:6px 14px; border-radius:999px;
  background:rgba(15,17,23,0.88); border:1px solid rgba(239,68,68,0.35);
  box-shadow:0 6px 24px rgba(0,0,0,0.4); backdrop-filter:blur(8px);
  font-size:11px; color:#d1d5db; white-space:nowrap;
  animation:dsh-danmaku-fade-up 0.22s ease-out both;
}
.dsh-danmaku-livehud .live-dot { width:7px; height:7px; border-radius:50%; background:#ef4444; animation:dsh-danmaku-node-pulse 1s ease-in-out infinite; flex:none; }
.dsh-danmaku-livehud b { color:#fff; font-variant-numeric:tabular-nums; }
/* ── 皮肤编辑器 ── */
.dsh-danmaku-skin {
  position:fixed; right:16px; bottom:16px; z-index:1001; pointer-events:auto;
  width:min(320px, calc(100vw - 32px));
  background:rgba(15,17,23,0.94); border:1px solid rgba(255,255,255,0.14);
  border-radius:14px; box-shadow:0 12px 40px rgba(0,0,0,0.55); backdrop-filter:blur(8px);
  padding:12px 14px; animation:dsh-danmaku-pop-in 0.2s ease-out both;
}
.dsh-danmaku-skin h4 { margin:0 0 8px; font-size:12px; font-weight:600; color:#e5e7eb; display:flex; align-items:center; justify-content:space-between; }
.dsh-danmaku-skin textarea {
  width:100%; box-sizing:border-box; height:120px; resize:vertical;
  background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.18); border-radius:8px;
  color:#e5e7eb; font-family:ui-monospace,"SFMono-Regular",monospace; font-size:11px; line-height:1.5;
  padding:6px 8px; outline:none;
}
.dsh-danmaku-skin textarea:focus { border-color:rgba(129,140,248,0.55); }
.dsh-danmaku-skin .skin-tip { font-size:10px; color:#6b7280; margin:6px 0; line-height:1.5; }
.dsh-danmaku-skin .skin-actions { display:flex; gap:8px; }
@keyframes dsh-danmaku-slide { from { transform:translateX(100vw); } to { transform:translateX(-110%); } }
@keyframes dsh-danmaku-slide-ltr { from { transform:translateX(-110%); } to { transform:translateX(100vw); } }
.dsh-danmaku-item.dsh-danmaku-dir-ltr { animation-name:dsh-danmaku-slide-ltr !important; }
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
/* ── 下拉（筛选 / 设置） ── */
.dsh-danmaku-drop { display:inline-flex; }
.dsh-danmaku-drop-panel {
  position:fixed; z-index:1002; min-width:216px; max-width:min(280px, calc(100vw - 16px));
  padding:8px; border-radius:12px;
  background:rgba(15,17,23,0.97); border:1px solid rgba(255,255,255,0.14);
  box-shadow:0 12px 40px rgba(0,0,0,0.55); backdrop-filter:blur(8px);
  animation:dsh-danmaku-panel-in 0.16s ease-out;
  display:none;
}
.dsh-danmaku-drop.open .dsh-danmaku-drop-panel { display:block; }
@keyframes dsh-danmaku-panel-in { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }
.dsh-danmaku-drop-title { font-size:10px; color:#6b7280; margin:2px 2px 6px; letter-spacing:0.5px; }
.dsh-danmaku-drop-filters { display:grid; grid-template-columns:repeat(2, 1fr); gap:4px; }
.dsh-danmaku-drop-filter {
  display:flex; align-items:center; gap:6px; padding:5px 8px; border-radius:8px;
  background:rgba(255,255,255,0.05); border:1px solid transparent; cursor:pointer;
  font-size:12px; color:#d1d5db; transition:background 0.15s;
}
.dsh-danmaku-drop-filter:hover { background:rgba(255,255,255,0.1); }
.dsh-danmaku-drop-filter.active { border-color:rgba(129,140,248,0.5); background:rgba(129,140,248,0.12); }
.dsh-danmaku-drop-filter.inactive { opacity:0.4; filter:grayscale(0.8); }
.dsh-danmaku-drop-row { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:4px 2px; font-size:11px; color:#cbd5e1; }
.dsh-danmaku-drop-row select {
  background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2); border-radius:6px;
  color:#e5e7eb; font-size:11px; padding:3px 6px; outline:none; cursor:pointer; max-width:132px;
}
.dsh-danmaku-drop-row select option { background:#0f1117; color:#e5e7eb; }
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
  // ── 类型筛选（收进下拉） ──
  const filterDrop = document.createElement('div')
  filterDrop.className = 'dsh-danmaku-drop'
  const filterToggle = document.createElement('button')
  filterToggle.type = 'button'
  filterToggle.className = 'dsh-danmaku-theme-toggle'
  filterToggle.title = '弹幕类型筛选'
  filterToggle.textContent = '🎛 筛选'
  const filterPanel = document.createElement('div')
  filterPanel.className = 'dsh-danmaku-drop-panel'
  const filterTitle = document.createElement('div')
  filterTitle.className = 'dsh-danmaku-drop-title'
  filterTitle.textContent = '类型筛选（点击切换开关）'
  filterPanel.appendChild(filterTitle)
  const filterGrid = document.createElement('div')
  filterGrid.className = 'dsh-danmaku-drop-filters'
  const filterButtons: Record<DanmakuKind, HTMLButtonElement> = {} as Record<DanmakuKind, HTMLButtonElement>
  for (const kind of KIND_ORDER) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'dsh-danmaku-drop-filter active'
    btn.title = `${KIND_EMOJI[kind]} ${kind}`
    btn.dataset.kind = kind
    const emojiSpan = document.createElement('span')
    emojiSpan.textContent = KIND_EMOJI[kind]
    const labelSpan = document.createElement('span')
    labelSpan.textContent = kind
    btn.appendChild(emojiSpan); btn.appendChild(labelSpan)
    btn.addEventListener('click', () => {
      const key = FILTER_KEY[kind]
      settings.update((d) => {
        const f = d.filters
        if (key === 'user') f.user = !f.user
        else if (key === 'assistant') f.assistant = !f.assistant
        else if (key === 'toolCall') f.toolCall = !f.toolCall
        else if (key === 'toolResult') f.toolResult = !f.toolResult
        else if (key === 'turn') f.turn = !f.turn
        else if (key === 'subagent') f.subagent = !f.subagent
        else f.thinking = !f.thinking
      })
    })
    filterButtons[kind] = btn
    filterGrid.appendChild(btn)
  }
  filterPanel.appendChild(filterGrid)
  filterDrop.appendChild(filterToggle); filterDrop.appendChild(filterPanel)
  // ── 设置（主题/密度/区域/方向，收进下拉 select） ──
  const settingsDrop = document.createElement('div')
  settingsDrop.className = 'dsh-danmaku-drop'
  const settingsToggle = document.createElement('button')
  settingsToggle.type = 'button'
  settingsToggle.className = 'dsh-danmaku-theme-toggle'
  settingsToggle.title = '弹幕设置'
  settingsToggle.textContent = '⚙️ 设置'
  const settingsPanel = document.createElement('div')
  settingsPanel.className = 'dsh-danmaku-drop-panel'
  const settingsTitle = document.createElement('div')
  settingsTitle.className = 'dsh-danmaku-drop-title'
  settingsTitle.textContent = '外观与行为'
  settingsPanel.appendChild(settingsTitle)
  const mkRow = (label: string, select: HTMLSelectElement): HTMLDivElement => {
    const row = document.createElement('div')
    row.className = 'dsh-danmaku-drop-row'
    const lab = document.createElement('span')
    lab.textContent = label
    row.appendChild(lab); row.appendChild(select)
    return row
  }
  const densitySelect = document.createElement('select')
  for (const d of DENSITY_ORDER) {
    const o = document.createElement('option')
    o.value = d
    o.textContent = `${DENSITY_EMOJI[d]} ${DENSITY_LABEL[d]}`
    densitySelect.appendChild(o)
  }
  densitySelect.addEventListener('change', () => { settings.update((d) => { d.density = densitySelect.value as DanmakuDensity }) })
  const regionSelect = document.createElement('select')
  for (const r of ALL_REGIONS) {
    const o = document.createElement('option')
    o.value = r
    o.textContent = `${REGION_EMOJI[r]} ${REGION_LABEL[r]}`
    regionSelect.appendChild(o)
  }
  regionSelect.addEventListener('change', () => { settings.update((d) => { d.region = regionSelect.value as DanmakuRegion }) })
  const dirSelect = document.createElement('select')
  for (const dd of ALL_DIRECTIONS) {
    const o = document.createElement('option')
    o.value = dd
    o.textContent = `${DIRECTION_EMOJI[dd]} ${DIRECTION_LABEL[dd]}`
    dirSelect.appendChild(o)
  }
  dirSelect.addEventListener('change', () => { settings.update((d) => { d.direction = dirSelect.value as DanmakuDirection }) })
  settingsPanel.appendChild(mkRow('🔸 密度', densitySelect))
  settingsPanel.appendChild(mkRow('🔲 区域', regionSelect))
  settingsPanel.appendChild(mkRow('➡️ 方向', dirSelect))
  // Token 燃烧炉开关
  const stoveRow = document.createElement('div')
  stoveRow.className = 'dsh-danmaku-drop-row'
  const stoveLabel = document.createElement('span')
  stoveLabel.textContent = '🔥 Token 炉'
  const stoveCheck = document.createElement('input')
  stoveCheck.type = 'checkbox'
  stoveCheck.style.cssText = 'accent-color:#818cf8;cursor:pointer;'
  stoveCheck.addEventListener('change', () => {
    settings.update((d) => { d.tokenStove = stoveCheck.checked })
  })
  stoveRow.appendChild(stoveLabel); stoveRow.appendChild(stoveCheck)
  settingsPanel.appendChild(stoveRow)
  settingsDrop.appendChild(settingsToggle); settingsDrop.appendChild(settingsPanel)
  // 下拉开合：点击触发器切换，点击外部关闭；面板 fixed 定位到视口并防溢出
  function closeDrop(drop: HTMLDivElement): void {
    drop.classList.remove('open')
  }
  function wireDrop(drop: HTMLDivElement): void {
    const toggle = drop.querySelector('button') as HTMLButtonElement
    const panel = drop.querySelector('.dsh-danmaku-drop-panel') as HTMLDivElement
    function positionPanel(): void {
      const rect = toggle.getBoundingClientRect()
      const pw = panel.offsetWidth
      const ph = panel.offsetHeight
      let left = rect.right - pw
      let top = rect.bottom + 6
      if (left < 8) left = 8
      if (left + pw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - pw - 8)
      if (top + ph > window.innerHeight - 8) top = Math.max(8, rect.top - ph - 6)
      panel.style.left = left + 'px'
      panel.style.top = top + 'px'
    }
    toggle.addEventListener('click', (e) => {
      e.stopPropagation()
      const willOpen = !drop.classList.contains('open')
      closeDrop(filterDrop); closeDrop(settingsDrop)
      if (willOpen) {
        drop.classList.add('open')
        // 先显示再测量，确保 offsetWidth/Height 有效
        requestAnimationFrame(positionPanel)
      }
    })
    document.addEventListener('pointerdown', (e) => {
      if (drop.classList.contains('open') && !drop.contains(e.target as Node)) closeDrop(drop)
    })
    // 视口尺寸变化时重新定位
    window.addEventListener('resize', () => {
      if (drop.classList.contains('open')) positionPanel()
    })
  }
  wireDrop(filterDrop)
  wireDrop(settingsDrop)
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
  // ── Agent 战场（召唤阵 + 竞速）按钮 ──
  const battlefieldBtn = document.createElement('button')
  battlefieldBtn.type = 'button'
  battlefieldBtn.className = 'dsh-danmaku-theme-toggle'
  battlefieldBtn.title = 'Agent 召唤阵 + 竞速（子 agent 生命周期可视化）'
  battlefieldBtn.textContent = '🧿 召唤'
  battlefieldBtn.addEventListener('click', () => {
    if (battlefieldPanel) { hideBattlefield(); return }
    showBattlefield()
  })
  // ── 轨迹雷达按钮 ──
  const radarBtn = document.createElement('button')
  radarBtn.type = 'button'
  radarBtn.className = 'dsh-danmaku-theme-toggle'
  radarBtn.title = '轨迹雷达（当前轮事件链）'
  radarBtn.textContent = '🛰 轨迹'
  radarBtn.addEventListener('click', () => {
    if (radarPanel) { hideRadar(); return }
    showRadar()
  })
  // ── 弹幕回放按钮 ──
  const replayBtn = document.createElement('button')
  replayBtn.type = 'button'
  replayBtn.className = 'dsh-danmaku-theme-toggle'
  replayBtn.title = '弹幕回放（按时间轴重放历史）'
  replayBtn.textContent = '📼 回放'
  replayBtn.addEventListener('click', () => {
    if (replayPanel) { hideReplay(); return }
    showReplay()
  })
  // ── 直播间 HUD 按钮 ──
  const liveHudBtn = document.createElement('button')
  liveHudBtn.type = 'button'
  liveHudBtn.className = 'dsh-danmaku-theme-toggle'
  liveHudBtn.title = '直播间模式（顶部状态 HUD + 观众反应）'
  liveHudBtn.textContent = '📺 直播'
  liveHudBtn.addEventListener('click', () => {
    if (liveHudPanel) { hideLiveHud(); return }
    showLiveHud()
  })
  // ── 自定义皮肤按钮 ──
  const skinBtn = document.createElement('button')
  skinBtn.type = 'button'
  skinBtn.className = 'dsh-danmaku-theme-toggle'
  skinBtn.title = '自定义皮肤（自定义 CSS）'
  skinBtn.textContent = '🖌 皮肤'
  skinBtn.addEventListener('click', showSkin)
  const speedInput = document.createElement('input')
  speedInput.type = 'range'; speedInput.min = '60'; speedInput.max = '350'; speedInput.step = '10'
  const speedLabel = document.createElement('span')
  speedLabel.className = 'dsh-danmaku-speed-label'
  ctrl.appendChild(dragHandle); ctrl.appendChild(toggleBtn); ctrl.appendChild(toggleLabel)
  ctrl.appendChild(filterDrop)
  ctrl.appendChild(settingsDrop)
  ctrl.appendChild(historyBtn)
  ctrl.appendChild(battlefieldBtn)
  ctrl.appendChild(radarBtn)
  ctrl.appendChild(replayBtn)
  ctrl.appendChild(liveHudBtn)
  ctrl.appendChild(skinBtn)
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
    // 同步 select 控件值
    densitySelect.value = snap.density
    regionSelect.value = snap.region
    dirSelect.value = snap.direction
    // Token 燃烧炉开关与可见性
    stoveCheck.checked = snap.tokenStove
    if (stoveEl) stoveEl.style.display = snap.tokenStove ? '' : 'none'
    ensureLanes()
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
    // 筛选触发器徽标：有禁用项时显示红点提示
    const allOn = snap.filters.user && snap.filters.assistant && snap.filters.toolCall
      && snap.filters.toolResult && snap.filters.turn && snap.filters.subagent && snap.filters.thinking
    filterToggle.textContent = allOn ? '🎛 筛选' : '🎛 筛选 ⚠️'
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
    // 下拉面板内部（含按钮里的 span/空白处）不触发拖动，也不关闭面板
    if (filterDrop.contains(t) || settingsDrop.contains(t)) return
    if (t.tagName === 'BUTTON' || t.tagName === 'INPUT' || t.tagName === 'SELECT') return
    // 拖动开始 → 关闭下拉面板
    closeDrop(filterDrop); closeDrop(settingsDrop)
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
    closeDrop(filterDrop); closeDrop(settingsDrop)
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
    closeDrop(filterDrop); closeDrop(settingsDrop)
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
    if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return
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
    // 工具排行榜：🏎 最快 / 🐢 最慢 / 💥 失败最多 / 🔥 使用最多
    interface ToolStat { count: number; totalMs: number; errs: number; fastest: number; slowest: number }
    const toolStats = new Map<string, ToolStat>()
    for (const it of historyData) {
      if (it.kind !== 'tool-result' || !it.toolName) continue
      const s = toolStats.get(it.toolName) ?? { count: 0, totalMs: 0, errs: 0, fastest: Infinity, slowest: 0 }
      s.count++
      if (it.durationMs != null) {
        s.totalMs += it.durationMs
        s.fastest = Math.min(s.fastest, it.durationMs)
        s.slowest = Math.max(s.slowest, it.durationMs)
      }
      if (it.tone === 'error') s.errs++
      toolStats.set(it.toolName, s)
    }
    let rankRow: HTMLDivElement | null = null
    if (toolStats.size > 0) {
      const entries = [...toolStats.entries()]
      const byAvg = entries.map(([n, s]) => ({ n, avg: s.totalMs / s.count }))
      const fastest = byAvg.reduce((a, b) => (b.avg < a.avg ? b : a))
      const slowest = byAvg.reduce((a, b) => (b.avg > a.avg ? b : a))
      const mostUsed = entries.reduce((a, b) => (b[1].count > a[1].count ? b : a))
      const mostFailed = entries.filter(([, s]) => s.errs > 0).sort((a, b) => b[1].errs - a[1].errs)[0]
      const fmtMs = (ms: number) => ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`
      rankRow = document.createElement('div')
      rankRow.style.cssText = 'padding:6px 14px;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;gap:12px;font-size:11px;color:#9ca3af;flex-wrap:wrap;'
      let html = ''
      if (fastest.n !== slowest.n || entries.length === 1) {
        html += `<span title="平均耗时最短">🏎 ${fastest.n} ${fmtMs(fastest.avg)}</span>`
        html += `<span title="平均耗时最长">🐢 ${slowest.n} ${fmtMs(slowest.avg)}</span>`
      }
      html += `<span title="调用次数最多">🔥 ${mostUsed[0]} ×${mostUsed[1].count}</span>`
      if (mostFailed) html += `<span title="失败次数最多">💥 ${mostFailed[0]} ×${mostFailed[1].errs}</span>`
      rankRow.innerHTML = html
    }
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
    panel.appendChild(header); panel.appendChild(stats)
    if (rankRow) panel.appendChild(rankRow)
    panel.appendChild(searchRow); panel.appendChild(body)
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
  // ── Agent 战场：召唤阵 + 竞速 ──
  // 子 agent 生命周期：subagent 弹幕 = 召唤；tool-result(toolName 为子 agent 工具) = 完成
  const SUBAGENT_TOOL_RE = /^(subagent|subagent_fork|ralph|workflow|agent_teams[_-]?\w*)$/i
  interface AgentEntry {
    name: string
    status: 'running' | 'ok' | 'error'
    order: number | null
    spawnTime: number
    doneTime: number | null
  }
  const agents = new Map<string, AgentEntry>()
  let finishOrder = 0
  let battlefieldPanel: HTMLDivElement | null = null
  function isSubagentToolName(name?: string): boolean {
    return !!name && SUBAGENT_TOOL_RE.test(name)
  }
  function trackSubagentSpawn(item: DanmakuItem): void {
    const callId = item.id.replace(/^tool:/, '')
    const name = item.text.replace(/^🧠\s*/, '').trim() || 'agent'
    agents.set(callId, { name, status: 'running', order: null, spawnTime: item.time, doneTime: null })
    renderBattlefield()
  }
  function trackSubagentDone(item: DanmakuItem): void {
    const callId = item.id.replace(/^tool-result:/, '')
    const a = agents.get(callId)
    if (!a || a.status !== 'running') return
    a.status = item.tone === 'error' ? 'error' : 'ok'
    a.doneTime = item.time
    if (a.status === 'ok') { finishOrder++; a.order = finishOrder }
    renderBattlefield()
  }
  function renderBattlefield(): void {
    if (!battlefieldPanel) return
    const circle = battlefieldPanel.querySelector('.dsh-danmaku-circle')
    const race = battlefieldPanel.querySelector('.dsh-danmaku-race')
    if (!circle || !race) return
    circle.innerHTML = ''; race.innerHTML = ''
    const running = [...agents.values()].filter((a) => a.status === 'running')
    const done = [...agents.values()].filter((a) => a.status !== 'running')
    const core = document.createElement('div')
    core.className = 'dsh-danmaku-circle-core'
    core.textContent = running.length > 0 ? '🧿' : '✅'
    circle.appendChild(core)
    const total = Math.max(running.length, 1)
    running.forEach((a, i) => {
      const angle = (i / total) * Math.PI * 2 - Math.PI / 2
      const x = 75 + Math.cos(angle) * 56
      const y = 75 + Math.sin(angle) * 56
      const node = document.createElement('div')
      node.className = 'dsh-danmaku-circle-node running'
      node.style.left = x + 'px'; node.style.top = y + 'px'
      node.textContent = '🧠 ' + (a.name || 'agent')
      node.title = a.name
      circle.appendChild(node)
    })
    const rows = [...done].sort((a, b) => (a.order ?? 999) - (b.order ?? 999)).concat(running)
    if (rows.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'dsh-danmaku-race-empty'
      empty.textContent = '暂无子 agent 召唤'
      race.appendChild(empty)
      return
    }
    for (const a of rows) {
      const row = document.createElement('div')
      row.className = 'dsh-danmaku-race-row'
      const medal = document.createElement('span'); medal.className = 'medal'
      medal.textContent = a.status === 'running' ? '🏃' : (a.order === 1 ? '🥇' : a.order === 2 ? '🥈' : a.order === 3 ? '🥉' : `#${a.order ?? '-'}`)
      const nameEl = document.createElement('span'); nameEl.className = 'name'
      nameEl.textContent = a.name || 'agent'
      const statusEl = document.createElement('span'); statusEl.className = 'status'
      statusEl.textContent = a.status === 'running' ? '运行中…' : (a.status === 'ok' ? '✅ 完成' : '❌ 失败')
      row.appendChild(medal); row.appendChild(nameEl); row.appendChild(statusEl)
      race.appendChild(row)
    }
  }
  function showBattlefield(): void {
    if (battlefieldPanel) return
    const panel = document.createElement('div')
    panel.className = 'dsh-danmaku-battlefield'
    const h = document.createElement('h4')
    h.textContent = '🧿 Agent 战场'
    const closeBtn = document.createElement('button')
    closeBtn.className = 'dsh-danmaku-history-close'
    closeBtn.textContent = '✕'
    closeBtn.addEventListener('click', hideBattlefield)
    h.appendChild(closeBtn)
    const wrap = document.createElement('div')
    wrap.className = 'dsh-danmaku-circle-wrap'
    const circle = document.createElement('div')
    circle.className = 'dsh-danmaku-circle'
    wrap.appendChild(circle)
    const race = document.createElement('div')
    race.className = 'dsh-danmaku-race'
    panel.appendChild(h); panel.appendChild(wrap); panel.appendChild(race)
    document.body.appendChild(panel)
    battlefieldPanel = panel
    renderBattlefield()
  }
  function hideBattlefield(): void {
    if (battlefieldPanel) { battlefieldPanel.remove(); battlefieldPanel = null }
  }
  // ── 轨迹雷达：当前轮事件链 ──
  const radarEvents: Array<{ emoji: string; tone: string }> = []
  let radarDone = false
  let radarPanel: HTMLDivElement | null = null
  function renderRadar(): void {
    if (!radarPanel) return
    radarPanel.innerHTML = ''
    const label = document.createElement('span')
    label.className = 'dsh-danmaku-radar-label'
    label.textContent = radarDone ? '🏁' : '🛰'
    radarPanel.appendChild(label)
    if (radarEvents.length === 0) {
      const empty = document.createElement('span')
      empty.textContent = '暂无事件'
      radarPanel.appendChild(empty)
      return
    }
    radarEvents.forEach((ev, i) => {
      const node = document.createElement('span')
      node.className = 'dsh-danmaku-radar-node' + (ev.tone === 'error' ? ' error' : '') + (i === radarEvents.length - 1 && !radarDone ? ' current' : '')
      node.textContent = ev.emoji
      radarPanel.appendChild(node)
      if (i < radarEvents.length - 1) {
        const c = document.createElement('span')
        c.className = 'dsh-danmaku-radar-conn'
        c.textContent = '·'
        radarPanel.appendChild(c)
      }
    })
  }
  function pushRadar(item: DanmakuItem): void {
    if (radarEvents.length >= 14) radarEvents.shift()
    radarEvents.push({ emoji: KIND_EMOJI[item.kind] || '•', tone: item.tone })
    renderRadar()
  }
  function showRadar(): void {
    if (radarPanel) return
    const panel = document.createElement('div')
    panel.className = 'dsh-danmaku-radar'
    document.body.appendChild(panel)
    radarPanel = panel
    renderRadar()
  }
  function hideRadar(): void {
    if (radarPanel) { radarPanel.remove(); radarPanel = null }
  }
  // ── 弹幕回放：按时间轴重放历史 ──
  let replayPanel: HTMLDivElement | null = null
  let replayTimer: ReturnType<typeof setInterval> | null = null
  let replayItems: DanmakuItem[] = []
  let replayIdx = 0
  let replaySpeed = 1
  let replayPlaying = false
  let replayStart = 0      // 本次播放段起点（performance.now）
  let replayBase = 0       // 已累计的播放时长（ms）
  let replayPlayBtn: HTMLButtonElement | null = null
  let replaySlider: HTMLInputElement | null = null
  let replayTimeEl: HTMLDivElement | null = null
  const replaySpeedBtns: HTMLButtonElement[] = []
  function replayOffset(item: DanmakuItem): number {
    if (replayItems.length === 0) return 0
    return item.time - replayItems[0].time
  }
  function replayTotal(): number {
    if (replayItems.length === 0) return 0
    return Math.max(0, replayItems[replayItems.length - 1].time - replayItems[0].time)
  }
  function replayTick(): void {
    if (!replayPlaying) return
    const elapsed = replayBase + (performance.now() - replayStart) * replaySpeed
    const total = replayTotal()
    while (replayIdx < replayItems.length && replayOffset(replayItems[replayIdx]) <= elapsed) {
      const it = replayItems[replayIdx++]
      renderItem(it, { force: true })
    }
    if (replaySlider) replaySlider.value = String(total > 0 ? Math.min(100, Math.round((elapsed / total) * 100)) : 100)
    if (replayTimeEl) {
      const pct = total > 0 ? Math.min(1, elapsed / total) : 1
      replayTimeEl.textContent = `${Math.round(pct * 100)}%`
    }
    if (replayIdx >= replayItems.length) {
      pauseReplay()
      if (replayPlayBtn) replayPlayBtn.textContent = '▶'
      if (replaySlider) replaySlider.value = '100'
    }
  }
  function playReplay(): void {
    if (replayItems.length === 0) return
    replayPlaying = true
    replayStart = performance.now()
    if (replayPlayBtn) replayPlayBtn.textContent = '⏸'
    if (replayTimer) clearInterval(replayTimer)
    replayTimer = setInterval(replayTick, 50)
    replayTick()
  }
  function pauseReplay(): void {
    if (!replayPlaying) return
    replayBase += (performance.now() - replayStart) * replaySpeed
    replayPlaying = false
    if (replayTimer) { clearInterval(replayTimer); replayTimer = null }
    if (replayPlayBtn) replayPlayBtn.textContent = '▶'
  }
  function resetReplay(): void {
    pauseReplay()
    replayIdx = 0
    replayBase = 0
    if (replaySlider) replaySlider.value = '0'
    if (replayTimeEl) replayTimeEl.textContent = '0%'
    if (replayPlayBtn) replayPlayBtn.textContent = '▶'
  }
  function showReplay(): void {
    if (replayPanel) return
    const panel = document.createElement('div')
    panel.className = 'dsh-danmaku-replay'
    const h = document.createElement('h4')
    h.textContent = '📼 弹幕回放'
    const closeBtn = document.createElement('button')
    closeBtn.className = 'dsh-danmaku-history-close'
    closeBtn.textContent = '✕'
    closeBtn.addEventListener('click', hideReplay)
    h.appendChild(closeBtn)
    const controls = document.createElement('div')
    controls.className = 'dsh-danmaku-replay-controls'
    const playBtn = document.createElement('button')
    playBtn.className = 'play-btn'
    playBtn.textContent = '▶'
    playBtn.addEventListener('click', () => { if (replayPlaying) pauseReplay(); else playReplay() })
    const slider = document.createElement('input')
    slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.value = '0'
    slider.addEventListener('input', () => {
      const total = replayTotal()
      if (total <= 0) return
      const target = (Number(slider.value) / 100) * total
      pauseReplay()
      replayIdx = 0
      replayBase = 0
      while (replayIdx < replayItems.length && replayOffset(replayItems[replayIdx]) <= target) replayIdx++
      replayBase = target
      if (replayTimeEl) replayTimeEl.textContent = slider.value + '%'
    })
    controls.appendChild(playBtn); controls.appendChild(slider)
    const timeEl = document.createElement('div')
    timeEl.className = 'replay-time'
    timeEl.textContent = '0%'
    const speedRow = document.createElement('div')
    speedRow.className = 'dsh-danmaku-replay-controls'
    const speedLabel = document.createElement('span')
    speedLabel.textContent = '速度'
    speedLabel.style.cssText = 'font-size:10px;color:#9ca3af;'
    speedRow.appendChild(speedLabel)
    for (const s of [0.5, 1, 2, 4]) {
      const b = document.createElement('button')
      b.className = 'speed-btn' + (s === replaySpeed ? ' active' : '')
      b.textContent = s + 'x'
      b.addEventListener('click', () => {
        replaySpeed = s
        replaySpeedBtns.forEach((x) => x.classList.toggle('active', x === b))
      })
      replaySpeedBtns.push(b)
      speedRow.appendChild(b)
    }
    panel.appendChild(h); panel.appendChild(controls); panel.appendChild(timeEl); panel.appendChild(speedRow)
    document.body.appendChild(panel)
    replayPanel = panel
    replayPlayBtn = playBtn
    replaySlider = slider
    replayTimeEl = timeEl
    // 快照历史（按时间升序）
    replayItems = bus.getHistory().slice().sort((a, b) => a.time - b.time)
    if (replayItems.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'replay-empty'
      empty.textContent = '暂无历史可回放'
      panel.appendChild(empty)
    }
  }
  function hideReplay(): void {
    pauseReplay()
    if (replayPanel) { replayPanel.remove(); replayPanel = null }
    replayPlayBtn = null; replaySlider = null; replayTimeEl = null
    replayItems = []; replayIdx = 0; replayBase = 0
  }
  // ── Token 燃烧炉：当前工作区（同目录全部会话）token 总和可视化 ──
  let taskTokens = 0
  let taskTokensIn = 0
  let taskTokensOut = 0
  let stoveEl: HTMLDivElement | null = null
  let stoveFlame: HTMLSpanElement | null = null
  let stoveTotal: HTMLSpanElement | null = null
  function fmtK(n: number): string {
    if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
    if (n >= 1000) return (n / 1000).toFixed(2).replace(/0+$/, '').replace(/\.$/, '') + 'k'
    return String(n)
  }
  function ensureStove(): void {
    if (stoveEl || typeof document === 'undefined') return
    const el = document.createElement('div')
    el.className = 'dsh-danmaku-stove'
    el.title = 'Token 燃烧炉（当前工作区总和）'
    const flame = document.createElement('span')
    flame.textContent = '🔥'
    const total = document.createElement('span')
    total.textContent = '0'
    const sub = document.createElement('span')
    sub.className = 'stove-sub'
    sub.innerHTML = '工作区<br>Token'
    el.appendChild(flame); el.appendChild(total); el.appendChild(sub)
    document.body.appendChild(el)
    stoveEl = el; stoveFlame = flame; stoveTotal = total
  }
  function renderStove(): void {
    if (!stoveEl || !stoveFlame || !stoveTotal) return
    stoveTotal.textContent = fmtK(taskTokens)
    const flames = taskTokens >= 1000000 ? '🔥🔥🔥🔥' : taskTokens >= 500000 ? '🔥🔥🔥' : taskTokens >= 100000 ? '🔥🔥' : '🔥'
    stoveFlame.textContent = flames
    stoveEl.classList.toggle('hot', taskTokens >= 1000000)
    stoveEl.title = `当前工作区 Token 总和 ${taskTokens}（输入 ${fmtK(taskTokensIn)} / 输出 ${fmtK(taskTokensOut)}）`
  }
  function trackTokens(item: DanmakuItem): void {
    // 投影不可用时的兜底：轮次弹幕自带 tokenUsage（事件级累计）
    if (!bus.getTokenTotals() && item.tokenUsage && item.tokenUsage.total > 0) {
      taskTokens += item.tokenUsage.total
      taskTokensIn += item.tokenUsage.input
      taskTokensOut += item.tokenUsage.output
      renderStove()
      return
    }
    refreshTokensFromFeed()
  }
  /** 从 session 投影读取工作区聚合值并刷新显示。 */
  function refreshTokensFromFeed(): void {
    const t = bus.getTokenTotals()
    if (!t) return
    taskTokens = t.total
    taskTokensIn = t.input
    taskTokensOut = t.output
    renderStove()
  }
  // ── 弹幕预言：规则预测下一步 ──
  let recentTools: string[] = []
  let errorStreak = 0
  let turnToolCount = 0
  let lastProphecyAt = 0
  function prophecy(text: string): void {
    const now = Date.now()
    if (now - lastProphecyAt < 15000) return // 冷却，避免刷屏
    lastProphecyAt = now
    bus.emit({ id: `prophecy:${now}`, text, kind: 'thinking', tone: 'neutral', time: now })
  }
  function predict(item: DanmakuItem): void {
    if (item.kind === 'turn') {
      if (/轮开始/.test(item.text)) { recentTools = []; errorStreak = 0; turnToolCount = 0 }
      return
    }
    if (item.kind === 'tool-call' && item.toolName) {
      recentTools.push(item.toolName)
      if (recentTools.length > 6) recentTools.shift()
      turnToolCount++
      const l2 = recentTools.slice(-2)
      if ((l2[0] === 'read' && l2[1] === 'grep') || (l2[0] === 'grep' && l2[1] === 'read')) {
        prophecy('🔮 预测：即将修改文件 ✏️')
      }
      if (turnToolCount === 12) prophecy('🔮 预测：本轮即将收尾 🏁')
      return
    }
    if (item.kind === 'tool-result') {
      if (item.tone === 'error') {
        errorStreak++
        if (errorStreak === 2) prophecy('🔮 预测：Agent 可能重试 🔄')
      } else {
        errorStreak = 0
      }
    }
  }
  // ── 直播间观众反应：本地规则生成 ──
  let lastReactionAt = 0
  const REACTIONS_OK = ['👏 太稳了', '🔥 这波漂亮', '✨ 行云流水', '👍 稳']
  const REACTIONS_ERR = ['😱 出错了', '🤔 要凉？', '👀 赶紧修']
  const REACTIONS_COMBO = ['🔥🔥🔥 666', '⚡ 连击！', '🎉 太快了']
  function react(list: string[]): void {
    const now = Date.now()
    if (now - lastReactionAt < 8000) return
    if (Math.random() > 0.6) return
    lastReactionAt = now
    const text = list[Math.floor(Math.random() * list.length)]
    bus.emit({ id: `react:${now}`, text: `👤 ${text}`, kind: 'user', tone: 'neutral', time: now })
  }
  // ── 直播间 HUD：顶部状态条 ──
  let liveHudPanel: HTMLDivElement | null = null
  let hudAgentsEl: HTMLElement | null = null
  let hudTurnEl: HTMLElement | null = null
  let hudRateEl: HTMLElement | null = null
  let hudTokEl: HTMLElement | null = null
  let curTurnNo = 0
  let toolOkCount = 0
  let toolErrCount = 0
  function updateHud(): void {
    if (!liveHudPanel || !hudAgentsEl || !hudTurnEl || !hudRateEl || !hudTokEl) return
    const running = [...agents.values()].filter((a) => a.status === 'running').length
    hudAgentsEl.textContent = String(running)
    hudTurnEl.textContent = curTurnNo > 0 ? `第 ${curTurnNo} 轮` : '—'
    const total = toolOkCount + toolErrCount
    hudRateEl.textContent = total > 0 ? Math.round((toolOkCount / total) * 100) + '%' : '—'
    hudTokEl.textContent = fmtK(taskTokens)
  }
  function showLiveHud(): void {
    if (liveHudPanel) return
    const panel = document.createElement('div')
    panel.className = 'dsh-danmaku-livehud'
    const dot = document.createElement('span')
    dot.className = 'live-dot'
    const mk = (label: string) => {
      const s = document.createElement('span')
      s.textContent = label
      const b = document.createElement('b')
      b.textContent = '—'
      panel.appendChild(s); panel.appendChild(b)
      return b
    }
    dot.textContent = ''
    panel.appendChild(dot)
    hudTurnEl = mk('🎬')
    hudAgentsEl = mk('👥')
    hudRateEl = mk('✅')
    hudTokEl = mk('🪙')
    document.body.appendChild(panel)
    liveHudPanel = panel
    updateHud()
  }
  function hideLiveHud(): void {
    if (liveHudPanel) { liveHudPanel.remove(); liveHudPanel = null }
    hudAgentsEl = null; hudTurnEl = null; hudRateEl = null; hudTokEl = null
  }
  // ── 用户自定义皮肤：自定义 CSS ──
  const CUSTOM_CSS_ID = 'dsh-danmaku-custom-css'
  let skinPanel: HTMLDivElement | null = null
  // 内置皮肤预设：官方主题 + 创意皮肤，点击即应用并写入编辑器（可继续微调）
  interface SkinPreset { name: string; css: string }
  const SKIN_PRESETS: SkinPreset[] = [
    {
      name: '✨ 默认',
      css: '',
    },
    {
      name: '🎆 霓虹',
      css: `.dsh-danmaku-layer .dsh-danmaku-item {
  background:rgba(0,0,0,0.82); border:1px solid rgba(255,255,255,0.35);
  font-size:13px; letter-spacing:0.3px;
  text-shadow:0 0 6px currentColor, 0 0 12px currentColor;
  animation:dsh-danmaku-slide var(--danmaku-duration) linear both, dsh-danmaku-neon-glow 2s ease-in-out infinite;
  box-shadow:0 0 16px currentColor;
}
.dsh-danmaku-layer .dsh-danmaku-item.dsh-danmaku-dir-ltr {
  animation:dsh-danmaku-slide-ltr var(--danmaku-duration) linear both, dsh-danmaku-neon-glow 2s ease-in-out infinite;
}
.dsh-danmaku-layer .dsh-danmaku-item .dsh-danmaku-text {
  background:linear-gradient(90deg,#06b6d4,#a855f7,#ec4899,#f97316,#06b6d4);
  background-size:200% 100%;
  -webkit-background-clip:text; background-clip:text;
  -webkit-text-fill-color:transparent; color:transparent;
  animation:dsh-danmaku-neon-shimmer 4s linear infinite;
}
.dsh-danmaku-layer .dsh-danmaku-kind-user { border-color:#fbbf24; color:#fbbf24; }
.dsh-danmaku-layer .dsh-danmaku-kind-assistant { border-color:#34d399; color:#34d399; }
.dsh-danmaku-layer .dsh-danmaku-kind-tool-call { border-color:#60a5fa; color:#60a5fa; }
.dsh-danmaku-layer .dsh-danmaku-kind-turn { border-color:#c084fc; color:#c084fc; }
.dsh-danmaku-layer .dsh-danmaku-kind-subagent { border-color:#f59e0b; color:#f59e0b; }
.dsh-danmaku-layer .dsh-danmaku-kind-thinking { border-color:#818cf8; color:#818cf8; }
.dsh-danmaku-layer .dsh-danmaku-tone-error { border-color:#f87171; color:#f87171; }
@keyframes dsh-danmaku-neon-glow {
  0%,100% { filter:brightness(1); }
  50% { filter:brightness(1.15); }
}
@keyframes dsh-danmaku-neon-shimmer {
  0% { background-position:0% 50%; }
  100% { background-position:200% 50%; }
}`,
    },
    {
      name: '🤖 赛博朋克',
      css: `.dsh-danmaku-layer .dsh-danmaku-item {
  background:rgba(0,0,0,0.92); border:1px solid #00ff9f;
  color:#00ff9f; font-family:ui-monospace,"SFMono-Regular",monospace; font-size:12px;
  text-shadow:0 0 4px #00ff9f, 0 0 8px rgba(0,255,159,0.4);
  box-shadow:0 0 8px rgba(0,255,159,0.3), inset 0 0 4px rgba(0,255,159,0.1);
  padding:3px 12px; border-radius:2px;
  backdrop-filter:none; -webkit-backdrop-filter:none;
}
.dsh-danmaku-layer .dsh-danmaku-item::before {
  content:''; position:absolute; inset:0; pointer-events:none;
  background:repeating-linear-gradient(0deg, transparent 0 2px, rgba(0,255,159,0.04) 2px 3px);
}
.dsh-danmaku-layer .dsh-danmaku-kind-user { border-color:#ff0080; color:#ff0080; text-shadow:0 0 4px #ff0080; }
.dsh-danmaku-layer .dsh-danmaku-kind-assistant { border-color:#00e0ff; color:#00e0ff; text-shadow:0 0 4px #00e0ff; }
.dsh-danmaku-layer .dsh-danmaku-kind-tool-call { border-color:#f0ff00; color:#f0ff00; text-shadow:0 0 4px #f0ff00; }
.dsh-danmaku-layer .dsh-danmaku-kind-turn { border-color:#ff6b6b; color:#ff6b6b; text-shadow:0 0 4px #ff6b6b; }
.dsh-danmaku-layer .dsh-danmaku-kind-subagent { border-color:#ff0080; color:#ff0080; text-shadow:0 0 4px #ff0080, 0 0 8px #00e0ff; }
.dsh-danmaku-layer .dsh-danmaku-kind-thinking { border-color:#7c3aed; color:#a78bfa; text-shadow:0 0 4px #a78bfa; }
.dsh-danmaku-layer .dsh-danmaku-tone-error { border-color:#ff0040; color:#ff0040; }`,
    },
    {
      name: '🎬 电影字幕',
      css: `.dsh-danmaku-layer .dsh-danmaku-item {
  background:rgba(0,0,0,0.7); border:1px solid rgba(255,255,255,0.2);
  color:#f5f5f0; font-family:Georgia,"Times New Roman",serif; font-size:14px; font-weight:400;
  letter-spacing:1px; padding:8px 20px; border-radius:2px;
  box-shadow:0 4px 20px rgba(0,0,0,0.5); text-shadow:0 1px 3px rgba(0,0,0,0.8);
  backdrop-filter:none; -webkit-backdrop-filter:none;
}
.dsh-danmaku-layer .dsh-danmaku-kind-user { border-color:rgba(255,215,0,0.5); color:#fff5cc; }
.dsh-danmaku-layer .dsh-danmaku-kind-assistant { border-color:rgba(180,180,200,0.4); color:#e8e8f0; }
.dsh-danmaku-layer .dsh-danmaku-kind-tool-call { border-color:rgba(100,149,237,0.5); color:#cce0ff; }
.dsh-danmaku-layer .dsh-danmaku-kind-turn { border-color:rgba(255,200,100,0.5); color:#ffe4b5; }
.dsh-danmaku-layer .dsh-danmaku-kind-subagent { border-color:rgba(200,100,255,0.5); color:#e8d0ff; }
.dsh-danmaku-layer .dsh-danmaku-kind-thinking { border-color:rgba(120,140,200,0.5); color:#d0d8f0; }
.dsh-danmaku-layer .dsh-danmaku-tone-error { border-color:rgba(220,50,50,0.6); color:#ffcccc; }`,
    },
    {
      name: '🔤 极简等宽',
      css: `.dsh-danmaku-layer .dsh-danmaku-item {
  background:transparent; border:none;
  color:#9ca3af; font-family:ui-monospace,"SFMono-Regular",monospace; font-size:12px; font-weight:400;
  box-shadow:none; text-shadow:none; backdrop-filter:none; -webkit-backdrop-filter:none;
  padding:0 10px; border-radius:0; line-height:20px;
}
.dsh-danmaku-layer .dsh-danmaku-kind-user { color:#fbbf24; }
.dsh-danmaku-layer .dsh-danmaku-kind-assistant { color:#9ca3af; }
.dsh-danmaku-layer .dsh-danmaku-kind-tool-call { color:#93c5fd; }
.dsh-danmaku-layer .dsh-danmaku-kind-turn { color:#c4b5fd; }
.dsh-danmaku-layer .dsh-danmaku-kind-subagent { color:#f59e0b; }
.dsh-danmaku-layer .dsh-danmaku-tone-ok { color:#6ee7b7; }
.dsh-danmaku-layer .dsh-danmaku-tone-error { color:#fca5a5; }`,
    },
    {
      name: '⚔️ 战斗模式',
      css: `.dsh-danmaku-layer {
  background:radial-gradient(ellipse at center, rgba(20,10,40,0.08), transparent 65%);
}
.dsh-danmaku-layer .dsh-danmaku-item {
  background:linear-gradient(135deg,rgba(30,15,60,0.94),rgba(8,12,30,0.94));
  border:1px solid rgba(250,204,21,0.62); border-radius:5px;
  font-family:ui-monospace,"SFMono-Regular",monospace; letter-spacing:.3px;
  box-shadow:0 0 10px rgba(250,204,21,.18), inset 0 0 12px rgba(99,102,241,.12);
  text-shadow:0 0 5px currentColor;
}
.dsh-danmaku-layer .dsh-danmaku-kind-tool-call { border-color:#60a5fa; color:#bfdbfe; }
.dsh-danmaku-layer .dsh-danmaku-kind-tool-result.dsh-danmaku-tone-ok { border-color:#34d399; color:#a7f3d0; }
.dsh-danmaku-layer .dsh-danmaku-kind-subagent { border-color:#c084fc; color:#e9d5ff; }
.dsh-danmaku-layer .dsh-danmaku-kind-thinking { border-color:#818cf8; color:#c7d2fe; }
.dsh-danmaku-layer .dsh-danmaku-tone-error { border-color:#fb7185; color:#fecdd3; }
.dsh-danmaku-layer .dsh-danmaku-effect-tool-read { border-left:4px solid #38bdf8; }
.dsh-danmaku-layer .dsh-danmaku-effect-tool-search { border-left:4px solid #a78bfa; }
.dsh-danmaku-layer .dsh-danmaku-effect-tool-edit { border-left:4px solid #facc15; }
.dsh-danmaku-layer .dsh-danmaku-effect-tool-shell { border-left:4px solid #4ade80; }
.dsh-danmaku-layer .dsh-danmaku-effect-tool-web { border-left:4px solid #22d3ee; }
.dsh-danmaku-layer .dsh-danmaku-effect-tool-git { border-left:4px solid #fb923c; }
.dsh-danmaku-layer .dsh-danmaku-effect-tool-package { border-left:4px solid #f472b6; }
.dsh-danmaku-layer .dsh-danmaku-effect-tool-flow { border-left:4px solid #c084fc; }`,
    },
    {
      name: '🌸 樱花粉',
      css: `.dsh-danmaku-layer .dsh-danmaku-item {
  background: linear-gradient(135deg, rgba(255,183,197,.94), rgba(255,224,231,.94)) !important;
  border: 1px solid rgba(244,143,177,.85) !important;
  color: #8d3b52 !important;
  text-shadow: none !important;
  box-shadow: 0 2px 10px rgba(244,143,177,.35) !important;
  border-radius: 14px !important;
}`,
    },
    {
      name: '🌊 深海玻璃',
      css: `.dsh-danmaku-layer .dsh-danmaku-item {
  background: rgba(8,47,73,.55) !important;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(56,189,248,.45) !important;
  color: #bae6fd !important;
  box-shadow: 0 0 14px rgba(56,189,248,.25) !important;
  border-radius: 10px !important;
}`,
    },
    {
      name: '🎮 复古终端',
      css: `.dsh-danmaku-layer .dsh-danmaku-item {
  background: #000a06 !important;
  border: 1px solid #00ff66 !important;
  color: #00ff88 !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace !important;
  font-size: 13px !important;
  border-radius: 0 !important;
  text-shadow: 0 0 6px rgba(0,255,102,.7) !important;
  box-shadow: 0 0 10px rgba(0,255,102,.35) !important;
}`,
    },
    {
      name: '🌈 彩虹渐变',
      css: `.dsh-danmaku-layer .dsh-danmaku-item {
  background: linear-gradient(90deg, #ff2fb3, #7c3aed, #06b6d4) !important;
  border: none !important;
  color: #fff !important;
  text-shadow: 0 1px 4px rgba(0,0,0,.45) !important;
  box-shadow: 0 0 16px rgba(168,85,247,.5) !important;
  border-radius: 999px !important;
}`,
    },
    {
      name: '📄 护眼纸白',
      css: `.dsh-danmaku-layer .dsh-danmaku-item {
  background: #fffdf5 !important;
  border: 1px solid #e2d9c8 !important;
  color: #43382b !important;
  text-shadow: none !important;
  box-shadow: 0 2px 10px rgba(120,100,70,.28) !important;
  border-radius: 8px !important;
}`,
    },
    {
      name: '🔥 烈焰橙',
      css: `.dsh-danmaku-layer .dsh-danmaku-item {
  background: linear-gradient(180deg, #451a03, #1c0a00) !important;
  border: 1px solid #f97316 !important;
  color: #fed7aa !important;
  text-shadow: 0 0 6px rgba(249,115,22,.8) !important;
  box-shadow: 0 0 12px rgba(249,115,22,.4) !important;
  border-radius: 6px !important;
}`,
    },
  ]
  function applyCustomCss(css: string): void {
    let el = document.getElementById(CUSTOM_CSS_ID) as HTMLStyleElement | null
    if (!el) {
      el = document.createElement('style')
      el.id = CUSTOM_CSS_ID
      document.head.appendChild(el)
    }
    el.textContent = css
  }
  function showSkin(): void {
    if (skinPanel) { hideSkin(); return }
    const panel = document.createElement('div')
    panel.className = 'dsh-danmaku-skin'
    const h = document.createElement('h4')
    const title = document.createElement('span')
    title.textContent = '🖌 自定义皮肤（CSS）'
    const closeBtn = document.createElement('button')
    closeBtn.className = 'dsh-danmaku-history-close'
    closeBtn.textContent = '✕'
    closeBtn.addEventListener('click', hideSkin)
    h.appendChild(title); h.appendChild(closeBtn)
    // 内置皮肤按钮行
    const presetRow = document.createElement('div')
    presetRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;'
    for (const preset of SKIN_PRESETS) {
      const btn = document.createElement('button')
      btn.className = 'dsh-danmaku-theme-toggle'
      btn.textContent = preset.name
      btn.style.cssText = 'font-size:10px;padding:3px 7px;'
      btn.title = '点击应用这套皮肤（可再手动微调）'
      btn.addEventListener('click', () => {
        ta.value = preset.css
        applyCustomCss(preset.css)
        settings.update((d) => { d.customCss = preset.css })
        for (const b of presetRow.querySelectorAll('button')) b.classList.remove('active')
        btn.classList.add('active')
      })
      presetRow.appendChild(btn)
    }
    const tip = document.createElement('div')
    tip.className = 'skin-tip'
    tip.textContent = '点上方按钮一键换肤，或直接改 CSS。示例：.dsh-danmaku-item { font-size: 18px; }'
    const ta = document.createElement('textarea')
    ta.spellcheck = false
    ta.value = settings.getSnapshot().customCss
    ta.addEventListener('keydown', (e) => e.stopPropagation())
    const actions = document.createElement('div')
    actions.className = 'skin-actions'
    const applyBtn = document.createElement('button')
    applyBtn.className = 'dsh-danmaku-theme-toggle'
    applyBtn.textContent = '✅ 应用'
    applyBtn.style.flex = '1'
    applyBtn.addEventListener('click', () => {
      applyCustomCss(ta.value)
      settings.update((d) => { d.customCss = ta.value })
      hideSkin()
    })
    const clearBtn = document.createElement('button')
    clearBtn.className = 'dsh-danmaku-theme-toggle'
    clearBtn.textContent = '🧹 清除'
    clearBtn.style.flex = '1'
    clearBtn.addEventListener('click', () => {
      ta.value = ''
      applyCustomCss('')
      settings.update((d) => { d.customCss = '' })
    })
    actions.appendChild(applyBtn); actions.appendChild(clearBtn)
    panel.appendChild(h); panel.appendChild(presetRow); panel.appendChild(tip); panel.appendChild(ta); panel.appendChild(actions)
    document.body.appendChild(panel)
    skinPanel = panel
    // 回显：当前 customCss 与某预设完全一致时高亮该按钮
    const cur = settings.getSnapshot().customCss
    SKIN_PRESETS.forEach((p, i) => {
      if (p.css === cur) (presetRow.children[i] as HTMLElement | undefined)?.classList.add('active')
    })
  }
  function hideSkin(): void {
    if (skinPanel) { skinPanel.remove(); skinPanel = null }
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
  // ── 弹幕渲染：实时订阅与回放共用 ──
  // force=true（回放）：跳过 开关/暂停/过滤 检查，不触发通知/庆祝/追踪
  function renderItem(item: DanmakuItem, opts?: { force?: boolean }): void {
    const snap = settings.getSnapshot()
    if (!opts?.force) {
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
      // Agent 战场：子 agent 生命周期追踪
      if (item.kind === 'subagent') trackSubagentSpawn(item)
      else if (item.kind === 'tool-result' && isSubagentToolName(item.toolName)) trackSubagentDone(item)
      // 轨迹雷达：轮次开始重置、结束标记
      if (item.kind === 'turn') {
        if (/轮开始/.test(item.text)) { radarEvents.length = 0; radarDone = false }
        if (/轮结束/.test(item.text)) radarDone = true
        const tm = item.text.match(/第 (\d+) 轮/)
        if (tm) curTurnNo = Number(tm[1])
      }
      if (radarPanel) pushRadar(item)
      // 弹幕预言 + Token 燃烧炉 + 直播间 HUD 统计
      predict(item)
      trackTokens(item)
      if (item.kind === 'tool-result') {
        if (item.tone === 'error') toolErrCount++; else toolOkCount++
      }
      updateHud()
    }
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
    if (!opts?.force) {
      // 错误事件 → 浏览器通知
      if (item.tone === 'error' && item.kind === 'turn') {
        notify('🏁 轮次失败', item.text)
      } else if (item.tone === 'error' && item.kind === 'tool-result') {
        notify('❌ 工具调用失败', item.text)
      }
      if (item.effect === 'victory') { celebrate('victory'); react(REACTIONS_OK) }
      else if (item.effect === 'defeat') { celebrate('defeat'); react(REACTIONS_ERR) }
      else if (item.effect === 'combo') react(REACTIONS_COMBO)
    }
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
  }
  // 初始化：Token 炉角标 + 自定义皮肤 + 控制条 UI（须在全部 let 声明之后）
  ensureStove()
  renderStove()
  applyCustomCss(settings.getSnapshot().customCss)
  settings.subscribe(refreshControlUI)
  refreshControlUI()
  // Token 投影轮询：投影更新不经过弹幕事件流，定时刷新保持角标/HUD 实时
  const tokenTimer = setInterval(() => {
    refreshTokensFromFeed()
    updateHud()
  }, 1000)
  bus.subscribe((item: DanmakuItem) => renderItem(item))
  return () => {
    clearInterval(tokenTimer)
    if (replayTimer) clearInterval(replayTimer)
    hideBattlefield()
    hideRadar()
    hideReplay()
    hideHistory()
    hideLiveHud()
    hideSkin()
    closeDetail()
    closeDrop(filterDrop); closeDrop(settingsDrop)
    if (stoveEl) { stoveEl.remove(); stoveEl = null }
    container.remove()
    ctrl.remove()
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    window.removeEventListener('touchmove', onMove)
    window.removeEventListener('touchend', onUp)
  }
}