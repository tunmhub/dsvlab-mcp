// Node 侧桥接:类型化封装对页面 window.__bridge 的调用。
// 每个 method 通过 page.evaluate 一次性调用,返回可序列化 JSON。
import { Page } from 'playwright';

export interface ComponentSummary {
  id: string;
  name: string;
  customName?: string;
  pinCount: number;
  hasMemory: boolean;
}

export interface ComponentDetail extends ComponentSummary {
  pinName: string[];
  pinFunction: number[];
  pinValue: number[];
}

export interface PinInfo {
  pinNo: number;
  pinName: string;
  pinFunction: number;
  pinValue: number;
}

export interface SnapshotItem {
  id: string;
  name: string;
  pinValue: number[];
  memory: number[] | null;
}

export class BridgeStuckError extends Error {
  constructor(method: string, timeoutMs: number) {
    super(`[bridge] 调用 ${method} 超时(${timeoutMs}ms),页面可能卡死`);
    this.name = 'BridgeStuckError';
  }
}

export class DsvlabBridge {
  constructor(private page: Page) {}
  /** 工具调用超时(毫秒),超时判定页面卡死 */
  callTimeoutMs = 8000;
  /** 卡死时触发的重启回调(由 lifecycle 注入) */
  onStuck?: () => Promise<void>;

  /** 通用调用入口:在页面侧 window.__bridge[method](...args),带超时 */
  private async call<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    const evalPromise = this.page.evaluate<T, { method: string; args: unknown[] }>(
      ({ method, args }) => {
        const fn = (globalThis as any).__bridge[method];
        if (typeof fn !== 'function') throw new Error('bridge 方法不存在: ' + method);
        return fn(...args);
      },
      { method, args },
    );
    const timer = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new BridgeStuckError(method, this.callTimeoutMs)), this.callTimeoutMs),
    );
    try {
      return await Promise.race([evalPromise, timer]);
    } catch (e) {
      if (e instanceof BridgeStuckError && this.onStuck) {
        await this.onStuck();
      }
      throw e;
    }
  }

  // —— 电路 ——
  load(txt: string) { return this.call<{ count: number; ids: string[] }>('load', txt); }
  clear() { return this.call<{ count: number }>('clear'); }

  // —— 电源 ——
  powerOn() { return this.call<{ runState: number }>('powerOn'); }
  powerOff() { return this.call<{ runState: number }>('powerOff'); }
  reset() { return this.call<{ runState: number }>('reset'); }
  getRunState() { return this.call<number>('getRunState'); }

  // —— 仿真 ——
  step() { return this.call<{ ok: boolean }>('step'); }
  setPulseWidth(ms: number) { return this.call<{ pulseWidth: number }>('setPulseWidth', ms); }
  getPulseWidth() { return this.call<number>('getPulseWidth'); }
  pressSwitch(id: string) { return this.call<{ id: string; pinValue: number }>('pressSwitch', id); }
  setSwitch(id: string, value: number) { return this.call<{ id: string; pinValue: number }>('setSwitch', id, value); }
  triggerPulse(id: string) { return this.call<{ id: string }>('triggerPulse', id); }
  applyInput(id: string, pinNo: number, value: number) {
    return this.call<{ id: string; pinNo: number; pinValue: number }>('applyInput', id, pinNo, value);
  }
  stop() { return this.call<{ ok: boolean }>('stop'); }

  /**
   * 连续运行:启动指定 id 的连续脉冲源,运行 durationMs 后停止。
   * 实现:triggerPulse 启动 → 等待 → stop 清 timer。
   */
  async run(continuousPulseId: string, durationMs: number): Promise<{ ran: boolean; durationMs: number }> {
    await this.triggerPulse(continuousPulseId);
    await new Promise((r) => setTimeout(r, durationMs));
    await this.stop();
    return { ran: true, durationMs };
  }

  /**
   * MCP 主动节拍:不依赖 ContinuousPulse 自驱动,每步 trigger_pulse(或 step)后让出主线程。
   * 完全 MCP 控制节拍,浏览器每拍之间空闲,响应最好,适合批量时序测试。
   * pulseId 可选:传则每步触发该单脉冲;不传则每步仅 step(跑空队列)。
   */
  async runSteps(steps: number, pulseId?: string | null, stepMs = 10): Promise<{ steps: number }> {
    for (let i = 0; i < steps; i++) {
      if (pulseId) await this.triggerPulse(pulseId);
      else await this.step();
      await new Promise((r) => setTimeout(r, stepMs));
    }
    return { steps };
  }

  // —— 防护 ——
  installGuard(maxPerComp = 200) {
    return this.call<{ installed: boolean; patchedProtos?: number; maxPerComp?: number; already?: boolean }>('installGuard', maxPerComp);
  }
  getGuardStatus() {
    return this.call<{ enabled: boolean; maxPerComp: number | null; triggers: number; lastTriggerComp: string | null }>('getGuardStatus');
  }
  /** setPage:卡死后重启时,用新 page 重建 bridge */
  setPage(page: Page) { this.page = page; }

  // —— 读取 ——
  listComponents() { return this.call<ComponentSummary[]>('listComponents'); }
  getComponent(id: string) { return this.call<ComponentDetail>('getComponent', id); }
  readPin(id: string, pinNo: number) { return this.call<{ id: string; pinNo: number; pinName: string; pinValue: number }>('readPin', id, pinNo); }
  readAllPins(id: string) { return this.call<PinInfo[]>('readAllPins', id); }
  readMemory(id: string) { return this.call<{ id: string; memory: number[] }>('readMemory', id); }
  writeMemory(id: string, addr: number, value: number) { return this.call<{ id: string; addr: number; value: number }>('writeMemory', id, addr, value); }
  snapshot() { return this.call<SnapshotItem[]>('snapshot'); }
}
