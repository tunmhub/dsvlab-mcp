// 浏览器与桥接单例:首次调用工具时 lazy 启动浏览器。
// 含会话状态记录 + 卡死后 restartBrowser 重放(第 2 层兜底)。
import { readFileSync } from 'fs';
import { startBrowser, stopBrowser } from './browser';
import { DsvlabBridge, BridgeStuckError } from './bridge';

let bridge: DsvlabBridge | null = null;

// 会话状态:用于卡死后重放恢复
// memoryWrites 用 Map<id, Map<addr, value>> 去重,只保留每个地址的最后一次写入(最终态),
// 避免中间态(如先写错微码再修正)在重放时干扰。
// lastCircuitPath:若 load 时提供了文件路径,replay 优先从磁盘读最新内容(中途改文件也能恢复最新版)。
interface SessionState {
  lastCircuitTxt: string | null;        // fallback:加载时的 txt 全文
  lastCircuitPath: string | null;       // 优先:电路文件路径,replay 时重新读磁盘
  memoryWrites: Map<string, Map<number, number>>; // id -> (addr -> 最终 value)
  powerOn: boolean;
}
const session: SessionState = {
  lastCircuitTxt: null,
  lastCircuitPath: null,
  memoryWrites: new Map(),
  powerOn: false,
};

export async function getBridge(): Promise<DsvlabBridge> {
  if (!bridge) {
    const page = await startBrowser();
    bridge = new DsvlabBridge(page);
    bridge.onStuck = restartBrowser;
  }
  return bridge;
}

/** 记录会话状态(供 tools 调用) */
export function recordLoadCircuit(txt: string, filePath?: string): void {
  session.lastCircuitTxt = txt;
  session.lastCircuitPath = filePath ?? null;
  session.memoryWrites = new Map(); // 新电路清空旧 memory 写
}
export function recordWriteMemory(id: string, addr: number, value: number): void {
  let m = session.memoryWrites.get(id);
  if (!m) { m = new Map(); session.memoryWrites.set(id, m); }
  m.set(addr, value); // 同地址覆盖,只留最终态
}
export function recordPowerOn(on: boolean): void {
  session.powerOn = on;
}

/** 读取当前会话应重放的电路 txt:优先从磁盘读最新,失败回退到加载时内容 */
function resolveCircuitTxt(): string | null {
  if (session.lastCircuitPath) {
    try {
      return readFileSync(session.lastCircuitPath, 'utf8');
    } catch {
      return session.lastCircuitTxt; // 磁盘读失败回退
    }
  }
  return session.lastCircuitTxt;
}

/** 卡死后重启:关旧页面 → 开新页面(重注防护)→ 重放会话状态 */
export async function restartBrowser(): Promise<void> {
  try { await stopBrowser(); } catch { /* 忽略 */ }
  bridge = null;
  const page = await startBrowser();
  bridge = new DsvlabBridge(page);
  bridge.onStuck = restartBrowser;
  const txt = resolveCircuitTxt();
  if (txt !== null) {
    await bridge.load(txt);
    // 按 final态重放 memory(每地址只写一次最终值)
    for (const [id, addrMap] of session.memoryWrites) {
      for (const [addr, value] of addrMap) {
        await bridge.writeMemory(id, addr, value);
      }
    }
    if (session.powerOn) await bridge.powerOn();
  }
}

export async function shutdown(): Promise<void> {
  await stopBrowser();
  bridge = null;
}

export { BridgeStuckError };
