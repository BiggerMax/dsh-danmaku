/**
 * dsh-danmaku — host 半区。
 *
 * 纯客户端插件：全部逻辑（轨迹事件捕获 + 弹幕渲染）在浏览器半区。
 * host 半区仅为 bundle 装配提供一个合法入口。
 */
export const name = "dsh-danmaku"

export function apply(): void {
  // no-op：客户端半区负责全部工作
}