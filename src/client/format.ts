import type { ContentBlock } from '@deepseek-ai/dsh-llm/types'

/** 从内容块中提取纯文本（text + reasoning；tool-call/result 摘要）。 */
export function blocksToText(blocks: readonly ContentBlock[] | undefined, max = 60): string {
  if (!blocks || blocks.length === 0) return ''
  const parts: string[] = []
  for (const block of blocks) {
    if (block.type === 'text' || block.type === 'reasoning') {
      parts.push(block.text)
    } else if (block.type === 'tool-call') {
      parts.push(`[工具 ${block.name}]`)
    } else if (block.type === 'tool-result') {
      parts.push('[工具结果]')
    }
  }
  return truncate(parts.join(' ').replace(/\s+/g, ' ').trim(), max)
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max) + '…'
}

/** 压缩 JSON 参数为一行摘要。 */
export function compactArgs(args: string, max = 40): string {
  const trimmed = args.trim()
  if (!trimmed || trimmed === '{}') return ''
  const oneLine = trimmed.replace(/\s+/g, ' ')
  return truncate(oneLine, max)
}