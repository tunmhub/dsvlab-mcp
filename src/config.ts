// 默认配置。可被环境变量覆盖。
import path from 'path';

// 编译后 dist/index.js 的 __dirname = .../mcp/dsvlab-mcp/dist
// 项目根 = .../dsvlab2.0
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

export const config = {
  // index.html 的绝对路径
  indexHtmlPath: process.env.DSVLAB_INDEX || path.join(PROJECT_ROOT, 'index.html'),
  // 项目根(用于读取 example 电路、校验核心等)
  projectRoot: PROJECT_ROOT,
  // 校验核心 js 路径
  validatorCorePath: path.join(PROJECT_ROOT, 'tools', 'circuit-validator-core.js'),
  // 是否无头(测试时希望可见)
  headless: process.env.DSVLAB_HEADLESS === '1',
  // 浏览器 channel:默认用系统自带的 Edge(免下载)。
  //   设为 'chrome' 用系统 Chrome;设为 'chromium' 用 Playwright 自带 chromium(需 npx playwright install)。
  //   留空字符串则用 Playwright 默认 chromium。
  channel: process.env.DSVLAB_CHANNEL || 'msedge',
  // 测试时默认脉冲宽度(原系统默认 800ms 太慢)
  defaultPulseWidth: 50,
  // 页面加载超时
  pageLoadTimeout: 30000,
  // run(duration) 默认上限
  runTimeout: 60000,
};

export type Config = typeof config;
