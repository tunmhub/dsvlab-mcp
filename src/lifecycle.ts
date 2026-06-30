// 浏览器与桥接单例:首次调用工具时 lazy 启动浏览器。
// 含会话状态记录 + 卡死后 restartBrowser 重放(第 2 层兜底)。
import { startBrowser, stopBrowser } from './browser';
import { DsvlabBridge, BridgeStuckError } from './bridge';

let bridge: DsvlabBridge | null = null;

// 会话状态:用于卡死后重放恢复(memory 不随 txt 保存,写操作须单独重放)
interface SessionState {
  lastCircuitTxt: string | null;       // 最后一次 load_circuit 的 txt
  memoryWrites: { id: string; addr: number; value: number }[]; // 其后的 write_memory
  powerOn: boolean;                     // 电源是否开着
}
const session: SessionState = { lastCircuitTxt: null, memoryWrites: [], powerOn: false };

export async function getBridge(): Promise<DsvlabBridge> {
  if (!bridge) {
    const page = await startBrowser();
    bridge = new DsvlabBridge(page);
    bridge.onStuck = restartBrowser; // 卡死时自动重启
  }
  return bridge;
}

/** 记录会话状态(供 tools 调用) */
export function recordLoadCircuit(txt: string): void {
  session.lastCircuitTxt = txt;
  session.memoryWrites = []; // 新电路清空旧 memory 写
}
export function recordWriteMemory(id: string, addr: number, value: number): void {
  session.memoryWrites.push({ id, addr, value });
}
export function recordPowerOn(on: boolean): void {
  session.powerOn = on;
}

/** 卡死后重启:关旧页面 → 开新页面(重注防护)→ 重放会话状态 */
export async function restartBrowser(): Promise<void> {
  try { await stopBrowser(); } catch { /* 忽略 */ }
  bridge = null;
  const page = await startBrowser();
  bridge = new DsvlabBridge(page);
  bridge.onStuck = restartBrowser;
  // 重放会话
  if (session.lastCircuitTxt !== null) {
    await bridge.load(session.lastCircuitTxt);
    for (const w of session.memoryWrites) await bridge.writeMemory(w.id, w.addr, w.value);
    if (session.powerOn) await bridge.powerOn();
  }
}

export async function shutdown(): Promise<void> {
  await stopBrowser();
  bridge = null;
}

export { BridgeStuckError };
