// 端到端集成测试:加载 example_bus_demo.txt,验证 8 开关 → 74LS245 → 8 LED 透传。
// 直接用 Playwright + 系统 Edge(headless),不经过 MCP stdio,聚焦桥接链路正确性。
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { chromium } from 'playwright';
import { INJECT_SCRIPT } from '../src/inject';
import { DsvlabBridge } from '../src/bridge';
import fs from 'fs';
import path from 'path';

const MCP_ROOT = path.resolve(__dirname, '..'); // dsvlab-mcp
const PROJECT_ROOT = path.resolve(MCP_ROOT, '..', '..'); // dsvlab2.0
const DEMO = fs.readFileSync(path.join(PROJECT_ROOT, 'files', 'examples', 'example_bus_demo.txt'), 'utf8');
const INDEX_URL = 'file:///' + path.join(PROJECT_ROOT, 'index.html').replace(/\\/g, '/');

let browser: any;
let page: any;
let bridge: DsvlabBridge;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const ctx = await browser.newContext({ viewport: null });
  page = await ctx.newPage();
  await page.addInitScript(INJECT_SCRIPT);
  page.on('pageerror', (e: any) => console.error('[pageerror]', e.message));
  await page.goto(INDEX_URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => (globalThis as any).__bridge && (globalThis as any).__bridge.ready(), { timeout: 30000 });
  await page.evaluate((ms: number) => (globalThis as any).__bridge.setPulseWidth(ms), 50);
  bridge = new DsvlabBridge(page);
}, 60000);

afterAll(async () => {
  if (browser) await browser.close();
});

describe('bus demo 端到端', () => {
  test('加载电路并枚举元件', async () => {
    const r = await bridge.load(DEMO);
    expect(r.count).toBe(18); // 8 Switch + 8 Led + 1 74LS245 + 1 额外 Switch(CP8 使能)
    const list = await bridge.listComponents();
    expect(list.length).toBe(18);
  }, 30000);

  test('74LS245 透传:DIR=1(默认),-E=0 时 A→B 传输', async () => {
    await bridge.reset();
    // demo 连线:CP0..CP7 → 74LS245 的 A7..A0(pin1..pin8);CP8 → -E(pin18)。
    // DIR(pin0)未连线,初值 1(A→B 方向)。B0..B7(pin10..17) → CP10..CP17。
    await bridge.setSwitch('CP8', 0); // -E=0 (使能)
    await bridge.step();

    // CP0..CP7 全拨到 1 → A7..A0=1 → B7..B0=1 → CP17..CP10 全亮
    for (const id of ['CP0', 'CP1', 'CP2', 'CP3', 'CP4', 'CP5', 'CP6', 'CP7']) {
      await bridge.setSwitch(id, 1);
    }
    await bridge.step();

    // 验证全部 8 个 LED(CP10..CP17)均为 1
    const expected: { id: string; pin: number; value: number }[] = [];
    for (let i = 0; i < 8; i++) expected.push({ id: `CP${10 + i}`, pin: 0, value: 1 });
    const results = await Promise.all(expected.map((e) => bridge.readPin(e.id, e.pin)));
    for (const r of results) {
      expect(r.pinValue).toBe(1);
    }
  }, 30000);

  test('-E=1 时输出高阻(LED 应灭)', async () => {
    await bridge.reset();
    await bridge.setSwitch('CP0', 1); // DIR=1
    await bridge.setSwitch('CP8', 1); // -E=1 (禁能)
    await bridge.setSwitch('CP7', 1);
    await bridge.step();
    const led = await bridge.readPin('CP10', 0);
    // 禁能时 B 侧高阻,LED 应为 0 或 2(高阻),不应为 1
    expect(led.pinValue).not.toBe(1);
  }, 30000);
});
