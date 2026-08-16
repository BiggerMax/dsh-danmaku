import { fileURLToPath } from 'node:url'
import type { UserConfig } from 'tsdown'

const PLUGIN_ID = '@dsh-external/dsh-trajectory-danmaku'

const clientBundle: UserConfig = {
  entry: { client: 'src/client/index.tsx' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  deps: {
    // 全部打包，不依赖外部 require()（src 中对 @deepseek-ai/* 的引用均为 type-only）
    alwaysBundle: () => true,
  },
  outputOptions: {
    entryFileNames: 'client.js',
    // 必须通过 __ModuleLoader__.load 注册，否则 dsh 报 "loaded without registering ... via __ModuleLoader__.load"
    banner: 'window.__ModuleLoader__.load({ id: ' + JSON.stringify(PLUGIN_ID) + ', factory: (require) => {',
    // 在 factory 作用域内定义 CJS 变量，供 rolldown 产物中的 exports.xxx = ... 使用
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    footer: 'return module.exports; } });',
    codeSplitting: false,
  },
}

export default [clientBundle] satisfies UserConfig[]
