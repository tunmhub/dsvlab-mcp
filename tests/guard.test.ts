// 防护补丁测试:NOT 环(无稳态,应饿死) + SR 锁存器(有稳态,不应饿死) + bus demo 对照 + run_steps
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { chromium } from 'playwright';
import { INJECT_SCRIPT } from '../src/inject';
import { DsvlabBridge } from '../src/bridge';
import { buildCircuitText } from '../src/tools/draw';
import fs from 'fs';
import path from 'path';

const MCP_ROOT = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(MCP_ROOT, '..', '..');
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
  await page.evaluate((ms) => (globalThis as any).__bridge.setPulseWidth(ms), 50);
  await page.evaluate((m) => (globalThis as any).__bridge.installGuard(m), 200);
  bridge = new DsvlabBridge(page);
  bridge.callTimeoutMs = 15000;
}, 60000);

afterAll(async () => { if (browser) await browser.close(); });

describe('防护补丁:反馈环', () => {
  test('NOT 环(无稳态)应被饿死,不死循环', async () => {
    // NOTgate: pin0=输入(10), pin1=输出(1)。输出接回输入 → 振荡环。
    // 加开关接 NOT pin0,press 开关触发源器件传播 → NOT work → 输出回输入 → 振荡。
    const txt = buildCircuitText(
      [
        { name: 'NOTgate', x: '100px', y: '100px', id: 'CP0' },
        { name: 'Switch', x: '50px', y: '100px', id: 'CP1' },
      ],
      [
        { from_id: 'CP0', from_pin: 1, to_id: 'CP0', to_pin: 0 }, // 自环
        { from_id: 'CP1', from_pin: 0, to_id: 'CP0', to_pin: 0 }, // 开关驱动
      ],
    );
    await bridge.load(txt);
    const before = await bridge.getGuardStatus(); // powerOn 前
    // powerOn 的 initQueue 会把开关入队 → 传播给 NOT → NOT 输出回输输入 → 振荡环
    // guard 应在超时内饿死它(triggers 增长),不死循环
    await bridge.powerOn();
    const after = await bridge.getGuardStatus();
    // 关键断言:在超时内返回(不死循环),且 guard 触发了饿死
    expect(after.triggers).toBeGreaterThan(before.triggers);
  }, 30000);

  test('SR 锁存器(有稳态)不应被饿死', async () => {
    // NANDgate: pin0/pin1=输入(10), pin2=输出(1)。
    // SR 锁存器:N1.out->N2.in1; N2.out->N1.in1; S->N1.in0; R->N2.in0。
    // 上电时反馈引脚(N1.in1/N2.in1)高阻,beReady 永假,锁存器死锁。
    // 用 applyInput 给反馈引脚初值(模拟对方输出=1),再 press S/R 驱动,使 NAND beReady 能 work。
    const txt = buildCircuitText(
      [
        { name: 'Switch', x: '50px', y: '50px', id: 'S' },
        { name: 'Switch', x: '50px', y: '120px', id: 'R' },
        { name: 'NANDgate', x: '150px', y: '50px', id: 'N1' },
        { name: 'NANDgate', x: '150px', y: '120px', id: 'N2' },
      ],
      [
        { from_id: 'S', from_pin: 0, to_id: 'N1', to_pin: 0 },
        { from_id: 'N2', from_pin: 2, to_id: 'N1', to_pin: 1 },
        { from_id: 'R', from_pin: 0, to_id: 'N2', to_pin: 0 },
        { from_id: 'N1', from_pin: 2, to_id: 'N2', to_pin: 1 },
      ],
    );
    await bridge.load(txt);
    await bridge.powerOn();
    const before = await bridge.getGuardStatus();

    // 给反馈引脚初值(模拟 N1.out=1, N2.out=1),打破高阻死锁
    await bridge.applyInput('N1', 1, 1); // N1.in1 = 1 (模拟 N2.out=1)
    await bridge.applyInput('N2', 1, 1); // N2.in1 = 1 (模拟 N1.out=1)
    // S=R=1:press 翻转传播,触发 NAND work,稳态 Q=N1.out=0 / Q'=N2.out=1
    await bridge.setSwitch('S', 1);
    await bridge.setSwitch('R', 1);
    await bridge.step();

    const q = await bridge.readPin('N1', 2);   // N1.out
    const qn = await bridge.readPin('N2', 2);  // N2.out
    const after = await bridge.getGuardStatus();

    // 稳态:Q 与 Q' 互补(不卡死,不饿死)
    expect(q.pinValue).not.toBe(qn.pinValue);
    // 稳态反馈不应触发饿死(triggers 几乎不增长)
    expect(after.triggers - before.triggers).toBeLessThan(5);
  }, 30000);

  test('bus demo 对照:防护不影响正常 DAG,本测试不新增饿死', async () => {
    const before = await bridge.getGuardStatus();
    await bridge.load(DEMO);
    await bridge.powerOn();
    await bridge.setSwitch('CP8', 0);
    await bridge.step();
    for (const id of ['CP0', 'CP1', 'CP2', 'CP3', 'CP4', 'CP5', 'CP6', 'CP7']) {
      await bridge.setSwitch(id, 1);
    }
    await bridge.step();
    for (let i = 0; i < 8; i++) {
      const led = await bridge.readPin(`CP${10 + i}`, 0);
      expect(led.pinValue).toBe(1);
    }
    const after = await bridge.getGuardStatus();
    expect(after.triggers - before.triggers).toBe(0); // 正常 DAG 不触发饿死
  }, 30000);

  test('run_steps 不卡死(无 pulse,仅 step N 拍)', async () => {
    await bridge.load(DEMO);
    await bridge.powerOn();
    const r = await bridge.runSteps(5, null, 5);
    expect(r.steps).toBe(5);
  }, 30000);
});
