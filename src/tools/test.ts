// 批量测试工具:真值表 / 多引脚断言
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getBridge } from '../lifecycle';

export function registerTestTools(server: McpServer): void {
  server.registerTool<any, any>(
    'run_truth_table',
    {
      description: '对组合逻辑批量跑真值表。switch_ids 按顺序对应每个 case 中的输入位;outputs 指定要读取的输出引脚。cases 不传则自动遍历 2^n 全组合。每个 case:设置开关→单步→读输出。返回完整真值表。',
      inputSchema: z.object({
        switch_ids: z.array(z.string()).min(1).describe('输入开关 id 列表,顺序对应 case 各位'),
        outputs: z.array(z.object({ id: z.string(), pin: z.number().int() })).min(1).describe('要读的输出引脚'),
        cases: z.array(z.array(z.number().int().min(0).max(1))).optional().describe('自定义输入组合;不传则遍历全 2^n'),
      }),
    },
    async (args: any, _extra: any): Promise<any> => {
      const { switch_ids, outputs, cases } = args;
      const bridge = await getBridge();
      const n: number = switch_ids.length;
      // 生成输入组合
      let combos: number[][];
      if (cases && cases.length > 0) {
        combos = cases;
      } else {
        const total = 1 << n;
        combos = [];
        for (let m = 0; m < total; m++) combos.push(switch_ids.map((_: string, i: number) => (m >> (n - 1 - i)) & 1));
      }

      await bridge.reset();

      const table: { inputs: number[]; outputs: { id: string; pin: number; value: number }[] }[] = [];
      for (const combo of combos) {
        for (let i = 0; i < n; i++) await bridge.setSwitch(switch_ids[i], combo[i]);
        await bridge.step();
        const outVals: { id: string; pin: number; value: number }[] = [];
        for (const o of outputs) {
          const r = await bridge.readPin(o.id, o.pin);
          outVals.push({ id: o.id, pin: o.pin, value: r.pinValue });
        }
        table.push({ inputs: combo, outputs: outVals });
      }

      const header = switch_ids.map((s: string, i: number) => `${s}[${i}]`).join(' ') + '  ->  ' + outputs.map((o: any) => `${o.id}.p${o.pin}`).join(' ');
      const rows = table.map((r) => r.inputs.join(' ') + '  ->  ' + r.outputs.map((o) => o.value).join(' '));
      return {
        content: [{
          type: 'text',
          text: `真值表(${table.length} 行):\n${header}\n` + rows.join('\n') + `\n注:pinValue 0=低 1=高 2=高阻`,
        }],
      };
    },
  );

  server.registerTool<any, any>(
    'assert_pins',
    {
      description: '一次性断言多个引脚的当前值,返回 pass/fail 明细。用于测试断言。',
      inputSchema: z.object({
        expected: z.array(z.object({
          id: z.string(),
          pin: z.number().int(),
          value: z.number().int().min(0).max(2).describe('期望值(2=高阻)'),
        })).min(1),
      }),
    },
    async (args: any, _extra: any): Promise<any> => {
      const { expected } = args;
      const bridge = await getBridge();
      const results: { id: string; pin: number; expected: number; actual: number; pass: boolean }[] = [];
      for (const e of expected) {
        const r = await bridge.readPin(e.id, e.pin);
        const pass = r.pinValue === e.value;
        results.push({ id: e.id, pin: e.pin, expected: e.value, actual: r.pinValue, pass });
      }
      const allPass = results.every((r) => r.pass);
      const lines = results.map((r) => `${r.pass ? '✅' : '❌'} ${r.id} pin${r.pin}: 期望=${r.expected} 实际=${r.actual}`);
      return {
        content: [{ type: 'text', text: `${allPass ? '✅ 全部通过' : '❌ 存在失败'} (${results.filter((r) => r.pass).length}/${results.length})\n` + lines.join('\n') }],
        isError: !allPass,
      };
    },
  );
}
