// 仿真控制工具:单步 / 连续运行 / 拨开关 / 触发脉冲 / 施加输入 / 调速 / 停止
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getBridge } from '../lifecycle';

export function registerSimulateTools(server: McpServer): void {
  server.registerTool<any, any>(
    'step',
    { description: '单步推进:跑空一次就绪队列(一次稳定信号传播)。适合组合逻辑逐拍观察。' },
    async (_args: any, _extra: any): Promise<any> => {
      const bridge = await getBridge();
      await bridge.step();
      return { content: [{ type: 'text', text: '✅ 已单步推进一轮' }] };
    },
  );

  server.registerTool<any, any>(
    'run',
    {
      description: '连续运行:启动指定连续脉冲源(ContinuousPulse),运行 duration_ms 后自动停止。用于时序电路测试。',
      inputSchema: z.object({
        source_id: z.string().describe('ContinuousPulse 元件的 id(如 CP5)'),
        duration_ms: z.number().int().min(0).default(1000).describe('运行时长(毫秒)'),
      }),
    },
    async (args: any, _extra: any): Promise<any> => {
      const { source_id, duration_ms } = args;
      const bridge = await getBridge();
      const r = await bridge.run(source_id, duration_ms);
      return { content: [{ type: 'text', text: `✅ 连续运行 ${r.durationMs}ms 后停止` }] };
    },
  );

  server.registerTool<any, any>(
    'run_steps',
    {
      description: 'MCP 主动节拍(推荐):不依赖 ContinuousPulse 自驱动,每步触发单脉冲(或仅 step)后让出主线程,跑 steps 拍。浏览器每拍之间空闲,响应最好,适合批量时序测试。pulse_id 不传则每步仅 step。',
      inputSchema: z.object({
        steps: z.number().int().min(1).default(10).describe('要推进的拍数'),
        pulse_id: z.string().optional().describe('SinglePulse 元件 id;不传则每步仅 step(跑空队列)'),
        step_ms: z.number().int().min(0).default(10).describe('每步之间让出主线程的毫秒数'),
      }),
    },
    async (args: any, _extra: any): Promise<any> => {
      const { steps, pulse_id, step_ms } = args;
      const bridge = await getBridge();
      const r = await bridge.runSteps(steps, pulse_id ?? null, step_ms);
      const trig = r.triggeredAt.length ? `\n⚠️ 第 ${r.triggeredAt.join(', ')} 步触发反馈环饿死(共 ${r.finalTriggers} 次)` : `\n无反馈环触发(triggers=${r.finalTriggers})`;
      return { content: [{ type: 'text', text: `✅ 已推进 ${r.steps} 拍${trig}` }] };
    },
  );

  server.registerTool<any, any>(
    'stop',
    { description: '停止所有连续脉冲(清除元件 timer),不影响元件当前状态。' },
    async (_args: any, _extra: any): Promise<any> => {
      const bridge = await getBridge();
      await bridge.stop();
      return { content: [{ type: 'text', text: '✅ 已停止所有连续脉冲' }] };
    },
  );

  server.registerTool<any, any>(
    'press_switch',
    {
      description: '翻转开关(toggle)。电源开时触发完整传播,关时仅翻转不传播。',
      inputSchema: z.object({ id: z.string().describe('Switch 元件 id') }),
    },
    async (args: any, _extra: any): Promise<any> => {
      const { id } = args;
      const bridge = await getBridge();
      const r = await bridge.pressSwitch(id);
      return { content: [{ type: 'text', text: `✅ 开关 ${r.id} 已翻转,当前值=${r.pinValue}` }] };
    },
  );

  server.registerTool<any, any>(
    'set_switch',
    {
      description: '设置开关到指定值(0 低 / 1 高)。若当前值与目标不同则翻转一次,使开关到达目标态。',
      inputSchema: z.object({
        id: z.string().describe('Switch 元件 id'),
        value: z.number().int().min(0).max(1).describe('目标电平 0 或 1'),
      }),
    },
    async (args: any, _extra: any): Promise<any> => {
      const { id, value } = args;
      const bridge = await getBridge();
      const r = await bridge.setSwitch(id, value);
      return { content: [{ type: 'text', text: `✅ 开关 ${r.id} = ${r.pinValue}` }] };
    },
  );

  server.registerTool<any, any>(
    'trigger_pulse',
    {
      description: '触发单脉冲(SinglePulse)。必须先 power_on。用于给时序元件的 CP 一个上升沿。',
      inputSchema: z.object({ id: z.string().describe('SinglePulse 元件 id') }),
    },
    async (args: any, _extra: any): Promise<any> => {
      const { id } = args;
      const bridge = await getBridge();
      await bridge.triggerPulse(id);
      return { content: [{ type: 'text', text: `✅ 已触发单脉冲 ${id}` }] };
    },
  );

  server.registerTool<any, any>(
    'apply_input',
    {
      description: '给指定元件的指定引脚施加电平(0/1),电源开时自动传播一轮。用于直接驱动输入引脚(非开关场景)。',
      inputSchema: z.object({
        id: z.string().describe('目标元件 id'),
        pin_no: z.number().int().describe('引脚号(数组下标,见 get_component)'),
        value: z.number().int().min(0).max(1).describe('电平 0 或 1'),
      }),
    },
    async (args: any, _extra: any): Promise<any> => {
      const { id, pin_no, value } = args;
      const bridge = await getBridge();
      const r = await bridge.applyInput(id, pin_no, value);
      return { content: [{ type: 'text', text: `✅ ${r.id} pin${r.pinNo}=${r.pinValue}` }] };
    },
  );

  server.registerTool<any, any>(
    'set_pulse_width',
    {
      description: '设置时钟脉冲周期(毫秒)。原系统默认 800ms,测试时建议调小(如 50)以加速。',
      inputSchema: z.object({ ms: z.number().int().min(1).describe('脉冲宽度(毫秒)') }),
    },
    async (args: any, _extra: any): Promise<any> => {
      const { ms } = args;
      const bridge = await getBridge();
      const r = await bridge.setPulseWidth(ms);
      return { content: [{ type: 'text', text: `✅ pulseWidth=${r.pulseWidth}ms` }] };
    },
  );
}
