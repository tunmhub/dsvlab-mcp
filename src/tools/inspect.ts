// 读取/检查工具:枚举元件 / 取元件详情 / 读引脚 / 读写存储 / 快照
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getBridge } from '../lifecycle';

export function registerInspectTools(server: McpServer): void {
  server.registerTool<any, any>(
    'list_components',
    { description: '列出当前电路所有元件:id / name / customName / 引脚数 / 是否含 memory。' },
    async (_args: any, _extra: any): Promise<any> => {
      const bridge = await getBridge();
      const list = await bridge.listComponents();
      const lines = list.map(
        (c) => `${c.id}\t${c.name}${c.customName ? ' (' + c.customName + ')' : ''}\t${c.pinCount} pins${c.hasMemory ? ' [+memory]' : ''}`,
      );
      return { content: [{ type: 'text', text: `元件 ${list.length} 个:\n` + lines.join('\n') }] };
    },
  );

  server.registerTool<any, any>(
    'get_component',
    {
      description: '取元件全部引脚信息:pinName / pinFunction(0输入 10必要输入 1输出 11双向 2地 3电源 4其它)/ pinValue(0低 1高 2高阻)。',
      inputSchema: z.object({ id: z.string() }),
    },
    async (args: any, _extra: any): Promise<any> => {
      const { id } = args;
      const bridge = await getBridge();
      const c = await bridge.getComponent(id);
      const rows = c.pinValue.map((v: number, i: number) => `${i}\t${c.pinName[i] ?? ''}\tfn=${c.pinFunction[i]}\t=${v}`);
      return {
        content: [{
          type: 'text',
          text: `${c.id} ${c.name}${c.customName ? ' (' + c.customName + ')' : ''}${c.hasMemory ? ' [+memory]' : ''}\n pinNo\tpinName\tfunction\tvalue\n` + rows.join('\n'),
        }],
      };
    },
  );

  server.registerTool<any, any>(
    'read_pin',
    {
      description: '读单个引脚值(0 低 / 1 高 / 2 高阻未驱动)。',
      inputSchema: z.object({ id: z.string(), pin_no: z.number().int() }),
    },
    async (args: any, _extra: any): Promise<any> => {
      const { id, pin_no } = args;
      const bridge = await getBridge();
      const r = await bridge.readPin(id, pin_no);
      return { content: [{ type: 'text', text: `${r.id} pin${r.pinNo} (${r.pinName}) = ${r.pinValue}` }] };
    },
  );

  server.registerTool<any, any>(
    'read_all_pins',
    {
      description: '读元件所有引脚值。',
      inputSchema: z.object({ id: z.string() }),
    },
    async (args: any, _extra: any): Promise<any> => {
      const { id } = args;
      const bridge = await getBridge();
      const pins = await bridge.readAllPins(id);
      const rows = pins.map((p) => `${p.pinNo}\t${p.pinName}\tfn=${p.pinFunction}\t=${p.pinValue}`);
      return { content: [{ type: 'text', text: `${id}:\n` + rows.join('\n') }] };
    },
  );

  server.registerTool<any, any>(
    'read_memory',
    {
      description: '读 RAM6116/EPROM 的 memory 数组。注意:memory 硬编码在源码,不随电路 txt 保存,刷新页面会重置。',
      inputSchema: z.object({ id: z.string() }),
    },
    async (args: any, _extra: any): Promise<any> => {
      const { id } = args;
      const bridge = await getBridge();
      try {
        const r = await bridge.readMemory(id);
        const memStr = r.memory.map((v: number, i: number) => `${i.toString(16).toUpperCase().padStart(3, '0')}:${v}`).join(' ');
        return { content: [{ type: 'text', text: `${id} memory (${r.memory.length} 单元):\n` + memStr }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `❌ ${e.message}` }], isError: true };
      }
    },
  );

  server.registerTool<any, any>(
    'write_memory',
    {
      description: '写 RAM6116/EPROM 的 memory 某单元(运行时)。注意:不随 txt 保存,刷新页面会重置回源码值。',
      inputSchema: z.object({
        id: z.string(),
        address: z.number().int().min(0).describe('地址(数组下标)'),
        value: z.number().int().describe('该单元的值(按芯片位宽,如 0-255)'),
      }),
    },
    async (args: any, _extra: any): Promise<any> => {
      const { id, address, value } = args;
      const bridge = await getBridge();
      try {
        await bridge.writeMemory(id, address, value);
        return { content: [{ type: 'text', text: `✅ ${id}[${address}] = ${value}` }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `❌ ${e.message}` }], isError: true };
      }
    },
  );

  server.registerTool<any, any>(
    'snapshot',
    { description: '全电路快照:每个元件的 pinValue(及 memory)。' },
    async (_args: any, _extra: any): Promise<any> => {
      const bridge = await getBridge();
      const snap = await bridge.snapshot();
      const lines = snap.map((c) => `${c.id} ${c.name}: [${c.pinValue.join(',')}]${c.memory ? ` mem[${c.memory.length}]` : ''}`);
      return { content: [{ type: 'text', text: `快照 ${snap.length} 元件:\n` + lines.join('\n') }] };
    },
  );
}
