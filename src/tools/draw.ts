// 画电路辅助工具:查元件目录 / 查引脚表 / 结构化生成电路 txt(带校验)
// 配合 docs/AI画电路手册.md 流程:AI 查引脚→描述元件连线→build_circuit 生成合法 txt→load_circuit 加载测试。
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { CATALOG, getComponentMeta, getPins, pfLabel } from '../lib/catalog';
import { validateCircuitText } from '../lib/validate';

export interface CompSpec {
  name: string; x: string; y: string; id: string; customName?: string;
}
export interface LineSpec {
  from_id: string; from_pin: number; to_id: string; to_pin: number;
}

/** 由结构化描述拼装 DS-VLAB 电路 txt 文本(格式权威来源:js/fileoperation.js)。 */
export function buildCircuitText(components: CompSpec[], lines: LineSpec[] = []): string {
  const compPart = components.map((c) =>
    `${c.name},${c.x},${c.y},${c.id}${c.customName ? ',' + c.customName : ''}`,
  ).join('$') + '$';
  const linePart = lines.map((l) =>
    `${l.from_id}Pin${l.from_pin}To${l.to_id}Pin${l.to_pin}`,
  ).join(',') + (lines.length ? ',' : '');
  return compPart + '&' + linePart + '@' + components.length;
}

export function registerDrawTools(server: McpServer): void {
  server.registerTool<any, any>(
    'list_component_catalog',
    {
      description: '列出 DS-VLAB 所有可用元件(23 种):显示名 / 类型(s源 i中间 d目的) / 引脚数 / 是否显示名称。用于画电路前选元件。',
    },
    async (_args: any, _extra: any): Promise<any> => {
      const rows = CATALOG.map(
        (c) => `${c.name}\t${c.type}\t${c.pinFunction.length} pins\tshowName=${c.showName}`,
      );
      return { content: [{ type: 'text', text: `元件目录(${CATALOG.length} 种):\n名称\t类型\t引脚数\t备注\n` + rows.join('\n') }] };
    },
  );

  server.registerTool<any, any>(
    'get_component_pins',
    {
      description: '查指定元件的引脚表(画电路必查,引脚号禁止臆测)。返回每个引脚的 pinNo / pinName / pinFunction(0输入 10必要输入 1输出 11双向 2地 3电源 4其它)。连线起点必须是输出(1)/双向(11),终点必须是输入(0)/必要输入(10)/双向(11)。',
      inputSchema: z.object({ name: z.string().describe('元件显示名,如 74LS245 / Switch / RAM6116') }),
    },
    async (args: any, _extra: any): Promise<any> => {
      const { name } = args;
      const pins = getPins(name);
      if (!pins) {
        return { content: [{ type: 'text', text: `❌ 未知元件: ${name}。可用 list_component_catalog 查全部。` }], isError: true };
      }
      const rows = pins.map((p) => `${p.pinNo}\t${p.pinName}\t${pfLabel(p.pinFunction)}`);
      return { content: [{ type: 'text', text: `${name} 引脚表(${pins.length} 引脚):\npinNo\tpinName\tfunction\n` + rows.join('\n') }] };
    },
  );

  server.registerTool<any, any>(
    'build_circuit',
    {
      description: '由结构化描述生成 DS-VLAB 电路 txt 文本,并用 circuit-validator-core 校验。格式: 元件段(每段 name,x,y,id[,customName] 以 $ 连接,末尾 $)& 连线段(每条 fromIdPinXToToIdPinY 以逗号连接,末尾逗号)@元件数。校验通过返回 txt 全文,可直接用 load_circuit 加载到浏览器。',
      inputSchema: z.object({
        components: z.array(z.object({
          name: z.string().describe('元件显示名,如 Switch / 74LS245'),
          x: z.string().describe('x 坐标(带 px,如 100px)'),
          y: z.string().describe('y 坐标(带 px,如 200px)'),
          id: z.string().describe('元件 id,如 CP0(全局唯一)'),
          customName: z.string().optional().describe('自定义显示名(仅 showName=true 的芯片有意义)'),
        })).min(1).describe('元件列表'),
        lines: z.array(z.object({
          from_id: z.string().describe('起点元件 id'),
          from_pin: z.number().int().describe('起点引脚号(须输出/双向)'),
          to_id: z.string().describe('终点元件 id'),
          to_pin: z.number().int().describe('终点引脚号(须输入/必要输入/双向)'),
        })).default([]).describe('连线列表'),
      }),
    },
    async (args: any, _extra: any): Promise<any> => {
      const { components, lines } = args;
      // 校验元件名存在
      for (const c of components) {
        if (!getComponentMeta(c.name)) {
          return { content: [{ type: 'text', text: `❌ 未知元件名: ${c.name}(元件 ${c.id})。可用 list_component_catalog 查全部。` }], isError: true };
        }
      }
      // 拼装(用导出的纯函数,与测试同源)
      const txt = buildCircuitText(components, lines);

      const v = validateCircuitText(txt);
      const header = v.errors.length > 0
        ? `❌ 校验失败(${v.errors.length} 错误):\n` + v.errors.map((e: string, i: number) => `${i + 1}. ${e}`).join('\n')
        : `✅ 校验通过(元件 ${v.components.length}, 连线 ${v.lines.length})${v.warnings.length ? `\n⚠️ ${v.warnings.length} 警告:\n` + v.warnings.map((w: string, i: number) => `${i + 1}. ${w}`).join('\n') : ''}`;
      return {
        content: [{ type: 'text', text: `${header}\n\n--- 生成的 txt ---\n${txt}` }],
        isError: v.errors.length > 0,
      };
    },
  );
}
