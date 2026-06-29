// Playwright 浏览器生命周期管理。
// 启动可见 Chromium,加载 index.html,注入桥接脚本。
import { chromium, Browser, Page } from 'playwright';
import { config } from './config';
import { INJECT_SCRIPT } from './inject';

let browser: Browser | null = null;
let page: Page | null = null;

function indexUrl(): string {
  // file:// + 正斜杠绝对路径
  const p = config.indexHtmlPath.replace(/\\/g, '/');
  return 'file:///' + p;
}

export async function startBrowser(): Promise<Page> {
  if (page) return page;
  const launchOpts: Parameters<typeof chromium.launch>[0] = {
    headless: config.headless,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
  };
  if (config.channel) (launchOpts as any).channel = config.channel;
  browser = await chromium.launch(launchOpts);
  const ctx = await browser.newContext({ viewport: null });
  page = await ctx.newPage();

  // 每次导航前注入桥接(在 document_start 执行,window.__bridge 先建好)
  await page.addInitScript(INJECT_SCRIPT);

  page.on('console', (msg) => {
    // MCP 用 stdio,不能用 stdout。页面 console 转发到 stderr。
    if (msg.type() === 'error') console.error('[page.error]', msg.text());
  });
  page.on('pageerror', (e) => console.error('[page.pageerror]', e.message));

  await page.goto(indexUrl(), { waitUntil: 'load', timeout: config.pageLoadTimeout });
  // 等到原系统创建好 mycircuit / cDispatch
  await page.waitForFunction(
    () => (globalThis as any).__bridge && (globalThis as any).__bridge.ready(),
    { timeout: config.pageLoadTimeout },
  );
  // 设置默认脉冲宽度(加速测试)
  await page.evaluate((ms) => (globalThis as any).__bridge.setPulseWidth(ms), config.defaultPulseWidth);

  return page;
}

export function getPage(): Page {
  if (!page) throw new Error('浏览器未启动,请先调用 startBrowser()');
  return page;
}

export async function stopBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
    page = null;
  }
}
