#!/usr/bin/env node
// DS-VLAB 电路测试 MCP 服务器入口
// 通过 stdio 与 MCP 客户端通信,通过 Playwright 控制浏览器中的电路。
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerCircuitTools } from './tools/circuit';
import { registerPowerTools } from './tools/power';
import { registerSimulateTools } from './tools/simulate';
import { registerInspectTools } from './tools/inspect';
import { registerTestTools } from './tools/test';
import { registerDrawTools } from './tools/draw';
import { shutdown } from './lifecycle';

async function main(): Promise<void> {
  const server = new McpServer({
    name: 'dsvlab-mcp',
    version: '0.1.0',
  });

  registerCircuitTools(server);
  registerPowerTools(server);
  registerSimulateTools(server);
  registerInspectTools(server);
  registerTestTools(server);
  registerDrawTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // 优雅关闭:收到信号时关闭浏览器再退出
  let closing = false;
  const cleanup = async (sig: string) => {
    if (closing) return;
    closing = true;
    process.stderr.write(`[dsvlab-mcp] ${sig} received, shutting down...\n`);
    try { await shutdown(); } catch (e) { /* 忽略 */ }
    process.exit(0);
  };
  process.on('SIGINT', () => cleanup('SIGINT'));
  process.on('SIGTERM', () => cleanup('SIGTERM'));

  process.stderr.write('[dsvlab-mcp] running on stdio (browser will launch on first tool call)\n');
}

main().catch((e) => {
  console.error('[dsvlab-mcp] fatal:', e);
  process.exit(1);
});
