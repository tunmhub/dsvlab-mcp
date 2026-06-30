// 电路管理工具:加载 / 清空
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getBridge, recordLoadCircuit } from '../lifecycle';
import { validateCircuitText } from '../lib/validate';

export function registerCircuitTools(server: McpServer): void {
  server.registerTool<any, any>(
    'load_circuit',
    {
      description: '加载 DS-VLAB 电路 txt 文本到浏览器并渲染。默认先用 circuit-validator-core 校验,有 errors 则拒绝加载。返回元件数与 id 列表。若电路来自文件,可传 file_path,卡死重启时优先从磁盘重读最新内容。',
      inputSchema: z.object({
        text: z.string().describe('电路文件全文,格式: 元件段$...& 连线段,...@count'),
        validate: z.boolean().default(true).describe('加载前是否校验(建议 true)'),
        file_path: z.string().optional().describe('电路文件磁盘路径(可选);提供后,卡死重开会重读最新文件'),
      }),
    },
    async (args: any, _extra: any): Promise<any> => {
      const { text, validate, file_path } = args;
      const bridge = await getBridge();
      if (validate) {
        const r = validateCircuitText(text);
        if (r.errors.length > 0) {
          return {
            content: [{ type: 'text', text: '❌ 校验失败,拒绝加载:\n' + r.errors.map((e, i) => `${i + 1}. ${e}`).join('\n') }],
            isError: true,
          };
        }
      }
      const r = await bridge.load(text);
      recordLoadCircuit(text, file_path); // 记录会话状态(卡死后重放,优先读磁盘)
      return { content: [{ type: 'text', text: `✅ 已加载:元件 ${r.count} 个\nIDs: ${r.ids.join(', ')}` }] };
    },
  );

  server.registerTool(
    'clear_circuit',
    { description: '清空当前电路画布(不改变电源状态)。' },
    async () => {
      const bridge = await getBridge();
      await bridge.clear();
      return { content: [{ type: 'text', text: '✅ 已清空画布' }] };
    },
  );
}
