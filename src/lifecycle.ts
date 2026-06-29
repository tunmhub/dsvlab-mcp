// 浏览器与桥接单例:首次调用工具时 lazy 启动浏览器。
import { startBrowser, stopBrowser } from './browser';
import { DsvlabBridge } from './bridge';

let bridge: DsvlabBridge | null = null;

export async function getBridge(): Promise<DsvlabBridge> {
  if (!bridge) {
    const page = await startBrowser();
    bridge = new DsvlabBridge(page);
  }
  return bridge;
}

export async function shutdown(): Promise<void> {
  await stopBrowser();
  bridge = null;
}
