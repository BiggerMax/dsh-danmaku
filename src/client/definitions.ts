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
    const { name, arguments: args } = match.event.data
    return { name, args: compactArgs(args), time: match.event.time }
  },
  update: (context) => context.state,
  buildViewNode: (context) => {
    const state = context.state as { name: string; args: string; time: number } | undefined
    if (!state) return null
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
    const { message, error: toolError } = match.event.data
    const isError = !!toolError
    // 通过 reader 查找前一个工具调用的上下文来获取工具名
    // 注：这里 reader 在 start 中不可用，后备方案——从 message.content 中提取
    const resultText = blocksToText(message.content, 30)
    return {
      isError,
      label: isError ? `❌ ${toolError.code}` : `✅ ${resultText}`,
      time: match.event.time,
    }
  },
  update: (context) => context.state,
  buildViewNode: (context) => {
    const state = context.state as { isError: boolean; label: string; time: number } | undefined
    if (!state) return null
    return danmakuNode(context, {
      id: context.id,
      text: state.label,
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
      return {
        kind: 'end' as const,
        turn: match.event.data.turn,
        time: match.event.time,
        isError: reason.kind === 'error',
        errorMsg: reason.kind === 'error' ? reason.error?.message ?? '未知错误' : undefined,
      }
    }
    return context.state
  },
  buildViewNode: (context) => {
    const state = context.state as
      | { kind: 'start'; turn: number; time: number }
      | { kind: 'end'; turn: number; time: number; isError: boolean; errorMsg?: string }
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
    return danmakuNode(context, {
      id: context.id,
      text: `🏁 第 ${state.turn} 轮结束${errSuffix}`,
      kind: 'turn',
      tone: state.isError ? 'error' : 'ok',
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