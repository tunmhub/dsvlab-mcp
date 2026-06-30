// 电源工具:开 / 关 / 复位
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getBridge, recordPowerOn } from '../lifecycle';

export function registerPowerTools(server: McpServer): void {
  server.tool(
    'power_on',
    '打开电源(cDispatch.powerOn):初始化就绪队列并跑一轮稳定传播。',
    {},
    async () => {
      const bridge = await getBridge();
      const r = await bridge.powerOn();
      recordPowerOn(true);
      return { content: [{ type: 'text', text: `✅ 电源已开 (runState=${r.runState})` }] };
    },
  );

  server.tool(
    'power_off',
    '关闭电源(cDispatch.powerOff):所有元件 reset,清空就绪队列。',
    {},
    async () => {
      const bridge = await getBridge();
      const r = await bridge.powerOff();
      recordPowerOn(false);
      return { content: [{ type: 'text', text: `✅ 电源已关 (runState=${r.runState})` }] };
    },
  );

  server.tool(
    'reset',
    '复位:先 powerOff 再 powerOn,等价于点 RESET 按钮。',
    {},
    async () => {
      const bridge = await getBridge();
      const r = await bridge.reset();
      recordPowerOn(true);
      return { content: [{ type: 'text', text: `✅ 已复位 (runState=${r.runState})` }] };
    },
  );
}
