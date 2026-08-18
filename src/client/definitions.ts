import type { Context } from '@deepseek-ai/cordis'
import type {
  ConversationNodeContext,
  ConversationNodeDefinition,
  ConversationViewDefinition,
  ConversationViewRegistry,
  ConversationEventRegistry,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { DanmakuBus } from './bus'
import { blocksToText, compactArgs } from './format'
import type { DanmakuItem, DanmakuViewNode } from './types'
import type { UserMessage, AssistantMessage } from '@deepseek-ai/dsh-llm'

// ─── 辅助 ────────────────────────────────────────────────────────────

function danmakuNode(context: ConversationNodeContext, item: DanmakuItem): DanmakuViewNode {
  return {
    key: context.key,
    kind: context.kind,
    id: context.id,
    target: 'danmaku' as const,
    data: item,
  }
}

// 判定是否为子 agent 相关工具
function isSubagentTool(name: string): boolean {
  return name === 'subagent'
    || name === 'subagent_fork'
    || name === 'ralph'
    || name === 'workflow'
    || /^agent_teams[_-]?\w*$/i.test(name)
}

/** 从 subagent tool call 中提取描述（优先 description，其次 prompt 前 N 字）。 */
function extractSubagentDesc(args: string): string {
  try {
    const obj = JSON.parse(args)
    if (obj && typeof obj === 'object') {
      const raw = obj as Record<string, unknown>
      if (raw.description && typeof raw.description === 'string' && raw.description.trim()) {
        return compactArgs(raw.description.trim(), 30)
      }
      if (raw.prompt && typeof raw.prompt === 'string') {
        return compactArgs(raw.prompt.trim().split('\n')[0], 30)
      }
    }
  } catch { /* args 不是合法 JSON，降级 */ }
  return ''
}

// ─── 耗时追踪：记录每个 tool/call 的起始时间，tool/result 时取出 ──
const toolCallStartTimes = new Map<string, number>()

/** 格式化耗时（ms → `⏱ X.Xs` / `⏱ Xms`）。 */
function fmtDuration(ms: number): string {
  if (ms < 100) return `⏱ ${ms}ms`
  return `⏱ ${(ms / 1000).toFixed(1)}s`
}

/** 格式化 token 用量（总数 → `🪙 X.Xk` / `🪙 X`）。 */
function fmtTokens(total: number): string {
  if (total >= 10000) return `🪙 ${(total / 1000).toFixed(1)}k`
  if (total >= 1000) return `🪙 ${(total / 1000).toFixed(2)}k`
  return `🪙 ${total}`
}

// ─── 定义 1: 用户消息 ─────────────────────────────────────────────────

const danmakuUserDefinition: ConversationNodeDefinition = {
  kind: 'danmaku-user',
  target: 'danmaku',
  match: (event) => {
    if (event.type !== 'user/message') return null
    // 只对直接人类输入弹幕，跳过合成上下文（plugin 注入）
    const data = event.data as UserMessage
    if (data.source.kind === 'plugin') return null
    return { id: `user:${event.seq}`, role: 'start' }
  },
  start: (_context, match) => {
    if (match.event.type !== 'user/message') throw new Error('danmaku-user start requires user/message')
    const data = match.event.data as UserMessage
    return { text: blocksToText(data.content), time: match.event.time }
  },
  update: (context) => context.state,
  buildViewNode: (context) => {
    const state = context.state as { text: string; time: number } | undefined
    if (!state?.text) return null
    return danmakuNode(context, {
      id: context.id,
      text: `👤 ${state.text}`,
      kind: 'user',
      tone: 'neutral',
      time: state.time,
    })
  },
}

// ─── 定义 2: 助手消息（最终版）──────────────────────────────────────────

const danmakuAssistantDefinition: ConversationNodeDefinition = {
  kind: 'danmaku-assistant',
  target: 'danmaku',
  match: (event) => {
    if (event.type !== 'assistant/message') return null
    return { id: `assistant:${event.data.turn}:${event.data.step}`, role: 'start' }
  },
  start: (_context, match) => {
    if (match.event.type !== 'assistant/message') throw new Error('danmaku-assistant start requires assistant/message')
    const content = match.event.data.message.content
    return { text: blocksToText(content), time: match.event.time }
  },
  update: (context) => context.state,
  buildViewNode: (context) => {
    const state = context.state as { text: string; time: number } | undefined
    if (!state?.text) return null
    return danmakuNode(context, {
      id: context.id,
      text: `🤖 ${state.text}`,
      kind: 'assistant',
      tone: 'neutral',
      time: state.time,
    })
  },
}

// ─── 定义 3: 工具调用 ─────────────────────────────────────────────────

const danmakuToolCallDefinition: ConversationNodeDefinition = {
  kind: 'danmaku-tool-call',
  target: 'danmaku',
  match: (event) => {
    if (event.type !== 'tool/call') return null
    return { id: `tool:${event.data.callId}`, role: 'start' }
  },
  start: (_context, match) => {
    if (match.event.type !== 'tool/call') throw new Error('danmaku-tool-call start requires tool/call')
    const { name, arguments: args, callId } = match.event.data
    if (callId) toolCallStartTimes.set(callId, match.event.time)
    return { name, args: compactArgs(args), time: match.event.time }
  },
  update: (context) => context.state,
  buildViewNode: (context) => {
    const state = context.state as { name: string; args: string; time: number } | undefined
    if (!state) return null
    // 子 agent 工具 → subagent kind
    if (isSubagentTool(state.name)) {
      const desc = extractSubagentDesc(state.args)
      const descText = desc ? `「${desc}」` : ''
      return danmakuNode(context, {
        id: context.id,
        text: `🧠 ${state.name}${descText}`,
        kind: 'subagent',
        tone: 'neutral',
        time: state.time,
      })
    }
    const argText = state.args ? ` ${state.args}` : ''
    return danmakuNode(context, {
      id: context.id,
      text: `⚙️ ${state.name}${argText}`,
      kind: 'tool-call',
      tone: 'neutral',
      time: state.time,
    })
  },
}

// ─── 定义 4: 工具结果 ─────────────────────────────────────────────────

const danmakuToolResultDefinition: ConversationNodeDefinition = {
  kind: 'danmaku-tool-result',
  target: 'danmaku',
  match: (event) => {
    if (event.type !== 'tool/result') return null
    const callId = event.data.callId
    if (!callId) return null
    return { id: `tool-result:${callId}`, role: 'start' }
  },
  start: (_context, match) => {
    if (match.event.type !== 'tool/result') throw new Error('danmaku-tool-result start requires tool/result')
    const { message, error: toolError, callId } = match.event.data
    const isError = !!toolError
    // 通过 reader 查找前一个工具调用的上下文来获取工具名
    // 注：这里 reader 在 start 中不可用，后备方案——从 message.content 中提取
    const resultText = blocksToText(message.content, 30)
    // 计算耗时：从 toolCallStartTimes 中取该 callId 的起始时间
    let durationMs: number | undefined
    if (callId) {
      const start = toolCallStartTimes.get(callId)
      if (start != null) {
        durationMs = match.event.time - start
        toolCallStartTimes.delete(callId)
      }
    }
    return {
      isError,
      label: isError ? `❌ ${toolError.code}` : `✅ ${resultText}`,
      time: match.event.time,
      durationMs,
    }
  },
  update: (context) => context.state,
  buildViewNode: (context) => {
    const state = context.state as { isError: boolean; label: string; time: number; durationMs?: number } | undefined
    if (!state) return null
    const durSuffix = state.durationMs != null ? ` ${fmtDuration(state.durationMs)}` : ''
    return danmakuNode(context, {
      id: context.id,
      text: state.label + durSuffix,
      kind: 'tool-result',
      tone: state.isError ? 'error' : 'ok',
      time: state.time,
    })
  },
}

// ─── 定义 5: 轮次开始/结束 ─────────────────────────────────────────────

const danmakuTurnDefinition: ConversationNodeDefinition = {
  kind: 'danmaku-turn',
  target: 'danmaku',
  match: (event) => {
    if (event.type === 'turn/start') return { id: `turn:${event.data.turn}`, role: 'start' }
    if (event.type === 'turn/end') return { id: `turn:${event.data.turn}`, role: 'update' }
    return null
  },
  start: (_context, match) => {
    if (match.event.type === 'turn/start') {
      return { kind: 'start' as const, turn: match.event.data.turn, time: match.event.time }
    }
    throw new Error('danmaku-turn start requires turn/start')
  },
  update: (context, match) => {
    if (match.event.type === 'turn/end') {
      const reason = match.event.data.reason
      const prev = context.state as { time: number } | undefined
      const durationMs = prev && prev.time != null ? match.event.time - prev.time : undefined
      // 提取 token 用量
      const data = match.event.data as { usage?: { totalTokens?: number; inputTokens?: number; outputTokens?: number } }
      let tokenUsage: { total: number; input: number; output: number } | undefined
      if (data.usage) {
        const t = data.usage.totalTokens ?? 0
        const i = data.usage.inputTokens ?? 0
        const o = data.usage.outputTokens ?? 0
        if (t > 0 || i > 0 || o > 0) tokenUsage = { total: t, input: i, output: o }
      }
      return {
        kind: 'end' as const,
        turn: match.event.data.turn,
        time: match.event.time,
        isError: reason.kind === 'error',
        errorMsg: reason.kind === 'error' ? reason.error?.message ?? '未知错误' : undefined,
        durationMs,
        tokenUsage,
      }
    }
    return context.state
  },
  buildViewNode: (context) => {
    const state = context.state as
      | { kind: 'start'; turn: number; time: number }
      | { kind: 'end'; turn: number; time: number; isError: boolean; errorMsg?: string; durationMs?: number; tokenUsage?: { total: number; input: number; output: number } }
      | undefined
    if (!state) return null
    if (state.kind === 'start') {
      return danmakuNode(context, {
        id: context.id,
        text: `🚀 第 ${state.turn} 轮开始`,
        kind: 'turn',
        tone: 'neutral',
        time: state.time,
      })
    }
    const errSuffix = state.isError ? ` ⚠️ ${state.errorMsg ?? ''}` : ''
    const durSuffix = state.durationMs != null ? ` ${fmtDuration(state.durationMs)}` : ''
    const tokSuffix = state.tokenUsage?.total > 0 ? ` ${fmtTokens(state.tokenUsage.total)}` : ''
    return danmakuNode(context, {
      id: context.id,
      text: `🏁 第 ${state.turn} 轮结束${errSuffix}${durSuffix}${tokSuffix}`,
      kind: 'turn',
      tone: state.isError ? 'error' : 'ok',
      time: state.time,
    })
  },
}

// ─── 定义 6: 思考过程 ─────────────────────────────────────────────────
// 助手消息中包含 reasoning 内容块时，弹一条 💭 思考弹幕
// 用 seq 去重，同一轮只弹一次

const danmakuThinkingDefinition: ConversationNodeDefinition = {
  kind: 'danmaku-thinking',
  target: 'danmaku',
  match: (event) => {
    if (event.type !== 'assistant/message') return null
    const content = (event.data.message as { content?: unknown[] })?.content
    if (!Array.isArray(content)) return null
    const hasReasoning = content.some(
      (block: { type?: string; text?: string }) =>
        block.type === 'reasoning' && block.text && block.text.trim().length > 10
    )
    if (!hasReasoning) return null
    const turn = event.data.turn
    const step = event.data.step
    return { id: `thinking:${turn}:${step}`, role: 'start' }
  },
  start: (_context, match) => {
    if (match.event.type !== 'assistant/message') throw new Error('danmaku-thinking start requires assistant/message')
    const content = (match.event.data.message as { content?: unknown[] })?.content
    let reasonLen = 0
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'reasoning' && block.text) reasonLen += block.text.length
      }
    }
    const label = reasonLen > 2000 ? '🔍 超深度推理' : reasonLen > 500 ? '🧠 深度推理' : '💭 正在推理'
    return { label, time: match.event.time }
  },
  update: (context) => context.state,
  buildViewNode: (context) => {
    const state = context.state as { label: string; time: number } | undefined
    if (!state) return null
    return danmakuNode(context, {
      id: context.id,
      text: state.label,
      kind: 'thinking',
      tone: 'neutral',
      time: state.time,
    })
  },
}

// ─── 注册全部定义 ──────────────────────────────────────────────────────

type CtxWithRegistries = Context & {
  conversationEvents: ConversationEventRegistry
  conversationViews: ConversationViewRegistry
}

export function registerDanmakuDefinitions(ctx: CtxWithRegistries): void {
  ctx.conversationEvents.register(danmakuUserDefinition)
  ctx.conversationEvents.register(danmakuAssistantDefinition)
  ctx.conversationEvents.register(danmakuToolCallDefinition)
  ctx.conversationEvents.register(danmakuToolResultDefinition)
  ctx.conversationEvents.register(danmakuTurnDefinition)
  ctx.conversationEvents.register(danmakuThinkingDefinition)
}

// ─── View 定义：将 upsert 节点喂给弹幕总线 ─────────────────────────────

export function registerDanmakuView(ctx: CtxWithRegistries, bus: DanmakuBus): void {
  // 已发送的 key 集合，防止 replace 阶段的重复推送
  const seenKeys = new Set<string>()

  const definition: ConversationViewDefinition<DanmakuViewNode, null> = {
    target: 'danmaku',
    create() {
      return {
        empty: null,
        replace() {
          // replace 是初始/历史回填：不弹幕，只记录 key 防后续重复
          return null
        },
        apply({ upserts }) {
          for (const node of upserts) {
            if (seenKeys.has(node.key)) continue
            seenKeys.add(node.key)
            bus.push(node.data)
          }
          return null
        },
      }
    },
  }

  ctx.conversationViews.register(definition)
}