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

export class DsvlabBridge {
  constructor(private page: Page) {}

  /** 通用调用入口:在页面侧 window.__bridge[method](...args) */
  private async call<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    return this.page.evaluate<T, { method: string; args: unknown[] }>(
      ({ method, args }) => {
        const fn = (globalThis as any).__bridge[method];
        if (typeof fn !== 'function') throw new Error('bridge 方法不存在: ' + method);
        return fn(...args);
      },
      { method, args },
    );
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

  // —— 读取 ——
  listComponents() { return this.call<ComponentSummary[]>('listComponents'); }
  getComponent(id: string) { return this.call<ComponentDetail>('getComponent', id); }
  readPin(id: string, pinNo: number) { return this.call<{ id: string; pinNo: number; pinName: string; pinValue: number }>('readPin', id, pinNo); }
  readAllPins(id: string) { return this.call<PinInfo[]>('readAllPins', id); }
  readMemory(id: string) { return this.call<{ id: string; memory: number[] }>('readMemory', id); }
  writeMemory(id: string, addr: number, value: number) { return this.call<{ id: string; addr: number; value: number }>('writeMemory', id, addr, value); }
  snapshot() { return this.call<SnapshotItem[]>('snapshot'); }
}
