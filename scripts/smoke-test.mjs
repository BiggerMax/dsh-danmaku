#!/usr/bin/env node
/**
 * 弹幕插件自检脚本（无浏览器依赖）：
 *  1. 加载 lib/client.js（模拟 ModuleLoader 环境）
 *  2. 执行 apply() 验证注册（5 定义 + danmaku 视图 + 弹幕层挂载到 body）
 *  3. 模拟事件流经定义，验证弹幕项生成与过滤逻辑
 *
 * 用法：node scripts/smoke-test.mjs（构建后运行）
 */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const bundle = readFileSync(join(ROOT, 'lib', 'client.js'), 'utf8')

// ─── 模拟浏览器环境 ────────────────────────────────────────────────
const reactStub = {
  createElement: (t, p, ...c) => ({ type: t, props: p, children: c }),
  useSyncExternalStore: (sub, get) => get(),
  useCallback: (f) => f,
  useEffect: () => {},
  useMemo: (f) => f(),
  useRef: (v) => ({ current: v }),
  useState: (v) => [v, () => {}],
}
const loaderState = { loaded: null }
const moduleLoader = { load: (spec) => { loaderState.loaded = spec } }
const makeElement = () => ({
  dataset: {}, style: {}, classList: { add: () => {}, remove: () => {} },
  textContent: '', innerHTML: '',
  appendChild: () => {}, remove: () => {},
  addEventListener: () => {}, removeEventListener: () => {},
  setAttribute: () => {},
})
const bodyChildren = []
const sandbox = {
  window: {
    __ModuleLoader__: moduleLoader,
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener: () => {},
    removeEventListener: () => {},
  },
  __ModuleLoader__: moduleLoader,
  document: {
    head: { appendChild: () => {} },
    body: { appendChild: (el) => { bodyChildren.push(el?.className ?? el?.id ?? el) } },
    createElement: () => makeElement(),
    getElementById: () => null,
    querySelector: () => null,
  },
  performance: { now: () => Date.now() },
  localStorage: { getItem: () => null, setItem: () => {} },
  setTimeout: () => {},
  require: (id) => {
    const table = {
      'react': reactStub,
      'react/jsx-runtime': { jsx: reactStub.createElement, jsxs: reactStub.createElement },
      'react-dom': {},
      'react-dom/client': {},
      'cordis': {},
      '@deepseek-ai/dsh-client-ui-slots': {},
      '@deepseek-ai/dsh-client-runtime/client': {
        createSnapshotStore: (init) => {
          let s = { ...init }
          return {
            getSnapshot: () => s,
            subscribe: () => () => {},
            update: (f) => { const d = { ...s }; f(d); s = d },
            set: (n) => { s = n },
          }
        },
      },
    }
    if (!(id in table)) throw new Error(`unexpected require: ${id}`)
    return table[id]
  },
  console,
}
sandbox.globalThis = sandbox
vm.createContext(sandbox)
vm.runInContext(bundle, sandbox, { filename: 'client.js' })

// ─── 1. 验证 bundle 加载 ──────────────────────────────────────────
const spec = loaderState.loaded
if (!spec) { console.error('FAIL: __ModuleLoader__.load 未被调用'); process.exit(1) }
console.log('✓ ModuleLoader.load 被调用, id =', spec.id)

const mod = spec.factory((id) => sandbox.require(id))
if (typeof mod.apply !== 'function' || !Array.isArray(mod.inject)) {
  console.error('FAIL: 模块缺少 apply/inject 导出'); process.exit(1)
}
console.log('✓ 模块导出 =', Object.keys(mod), '| inject =', JSON.stringify(mod.inject))

// ─── 2. 验证 apply() 注册 ─────────────────────────────────────────
const defs = []
const registered = { views: [] }
const ctx = {
  effect: (fn) => fn(),
  conversationEvents: { register: (def) => { defs.push(def); return () => {} } },
  conversationViews: { register: (def) => { registered.views.push(def.target); return () => {} } },
}
mod.apply(ctx)

const expectKinds = ['danmaku-user', 'danmaku-assistant', 'danmaku-tool-call', 'danmaku-tool-result', 'danmaku-turn']
for (const kind of expectKinds) {
  if (!defs.some((d) => d.kind === kind)) { console.error(`FAIL: 缺少定义 ${kind}`); process.exit(1) }
}
if (registered.views.length !== 1 || registered.views[0] !== 'danmaku') { console.error('FAIL: 视图注册错误'); process.exit(1) }
if (!bodyChildren.includes('dsh-danmaku-layer')) { console.error('FAIL: 弹幕层未挂载到 document.body'); process.exit(1) }
console.log('✓ apply 注册 5 定义 + 视图 danmaku + 弹幕层挂载到 body')

// ─── 3. 模拟事件流验证弹幕生成 ────────────────────────────────────
const seen = new Map()
function simulate(event) {
  for (const def of defs) {
    const r = def.match(event)
    if (!r) continue
    const key = `${def.kind}:${r.id}`
    const match = { event, view: undefined, role: r.role, location: { kind: 'session' } }
    let context = seen.get(key)
    if (!context) {
      const state = def.start({ key, kind: def.kind, id: r.id, matches: [], start: match, state: undefined, current: new Map() }, match, { previous: () => undefined })
      context = { key, kind: def.kind, id: r.id, state, current: new Map() }
      seen.set(key, context)
    } else {
      context.state = def.update(context, match)
    }
    const node = def.buildViewNode(context)
    if (node) return node.data
  }
  return null
}

const cases = [
  ['user 直接输入', simulate({ seq: 1, type: 'user/message', time: 1, data: { id: 'm1', role: 'user', content: [{ type: 'text', text: '帮我看看' }], source: { kind: 'user' } } }), (i) => i?.kind === 'user' && i.text.startsWith('👤')],
  ['user 合成跳过', simulate({ seq: 2, type: 'user/message', time: 2, data: { id: 'm2', role: 'user', content: [{ type: 'text', text: '通知' }], source: { kind: 'plugin', plugin: 'fs' } } }), (i) => i === null],
  ['turn 开始', simulate({ seq: 3, type: 'turn/start', time: 3, data: { turn: 1 } }), (i) => i?.text.includes('第 1 轮开始')],
  ['tool 调用', simulate({ seq: 4, type: 'tool/call', time: 4, data: { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{"command":"ls"}' } }), (i) => i?.kind === 'tool-call' && i.text.includes('bash')],
  ['tool 成功', simulate({ seq: 5, type: 'tool/result', time: 5, data: { turn: 1, step: 1, callId: 'c1', message: { id: 'r1', role: 'user', content: [{ type: 'text', text: 'ok' }], source: { kind: 'tool', callId: 'c1' } } } }), (i) => i?.tone === 'ok'],
  ['tool 失败', simulate({ seq: 6, type: 'tool/result', time: 6, data: { turn: 1, step: 2, callId: 'c2', message: { id: 'r2', role: 'user', content: [], source: { kind: 'tool', callId: 'c2' } }, error: { name: 'Error', code: 'EACCES' } } }), (i) => i?.tone === 'error' && i.text.includes('EACCES')],
  ['assistant 回复', simulate({ seq: 7, type: 'assistant/message', time: 7, data: { turn: 1, step: 2, message: { id: 'a1', role: 'assistant', content: [{ type: 'text', text: '完成' }], source: { kind: 'model', provider: 'x', model: 'y' } } } }), (i) => i?.kind === 'assistant'],
  ['turn 结束成功', simulate({ seq: 8, type: 'turn/end', time: 8, data: { turn: 1, reason: { kind: 'complete' } } }), (i) => i?.tone === 'ok'],
  ['turn 2 开始', simulate({ seq: 8.5, type: 'turn/start', time: 8.5, data: { turn: 2 } }), (i) => i?.text.includes('第 2 轮开始')],
  ['turn 结束失败', simulate({ seq: 9, type: 'turn/end', time: 9, data: { turn: 2, reason: { kind: 'error', error: { name: 'LlmFailure', message: '超时' } } } }), (i) => i?.tone === 'error' && i.text.includes('⚠️')],
]

let pass = true
for (const [name, item, check] of cases) {
  const ok = check(item)
  console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(14)} ${item ? `→ [${item.kind}/${item.tone}] ${item.text}` : '→ (跳过)'}`)
  if (!ok) pass = false
}

if (pass) {
  console.log('\n=== 全部自检通过 ✅ ===')
  process.exit(0)
} else {
  console.error('\n=== 存在自检失败 ❌ ===')
  process.exit(1)
}