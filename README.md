# dsvlab-mcp — DS-VLAB 电路测试 MCP 服务器

让 AI(MCP 客户端)程序化控制 [DS-VLAB v2.0 多思计组原理虚拟实验室](../../index.html)中的电路:加载电路、上电、施加输入、单步/连续运行、读取引脚与存储、批量跑真值表,实现自动化测试。

## 架构

```
AI 客户端 ─stdio─► dsvlab-mcp(本服务) ─Playwright─► Edge/Chromium(加载 index.html)
                                                    │ page.evaluate()
                                                    ▼
                                          window.mycircuit / cDispatch
                                          / recovercircuit()(原系统全局)
```

- **不改动原项目任何源码**(18 个 component、dispatch、circuitdiagram、fileoperation 一律不动)。
- 全部新文件集中在 `mcp/dsvlab-mcp/`。
- 复用原项目 `tools/circuit-validator-core.js`(UMD)做加载前校验。
- 默认用系统自带的 **Edge**(`channel: 'msedge'`),**无需下载 Chromium**。

## 安装

```bash
cd mcp/dsvlab-mcp
npm install
npm run build          # tsc 编译到 dist/
# 可选:跑集成测试(会用 Edge headless 加载 example_bus_demo.txt)
npm test
```

> 不需要 `npx playwright install` —— 默认走系统 Edge。若想用 Playwright 自带 Chromium,设环境变量 `DSVLAB_CHANNEL=chromium` 后执行 `npx playwright install chromium`。

## 配置(MCP 客户端)

### ZCode / Claude Desktop

把 `files/config.sample.json` 的内容并入客户端的 MCP 配置(按本机实际路径调整):

```json
{
  "mcpServers": {
    "dsvlab": {
      "command": "node",
      "args": ["C:/.../dsvlab2.0/mcp/dsvlab-mcp/dist/index.js"],
      "env": {
        "DSVLAB_INDEX": "C:/.../dsvlab2.0/index.html",
        "DSVLAB_CHANNEL": "msedge",
        "DSVLAB_HEADLESS": "0"
      }
    }
  }
}
```

### 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `DSVLAB_INDEX` | `<项目根>/index.html` | index.html 绝对路径 |
| `DSVLAB_CHANNEL` | `msedge` | 浏览器 channel:`msedge` / `chrome` / `chromium` |
| `DSVLAB_HEADLESS` | `0`(可见) | `1` = 无头(不弹窗,适合 CI) |

> 浏览器是 **lazy 启动**:MCP 服务连上后不立即弹窗,第一次调用工具时才启动。

## 工具清单(共 27 个)

> **防护补丁**:浏览器启动时自动注入,防止组合反馈环导致 `runCircuit` 死循环卡死主线程(原型 `input` 加 WeakMap+run token 计数,单拍每元件超 200 次 input 饿死)。卡死时工具调用超时(8s)自动重启浏览器并重放会话(电路 txt 优先从磁盘重读 + memory 写操作去重最终态 + 电源状态)。`get_guard_status` 返回触发次数/元件/第几次 runCircuit;`run_steps` 返回 `triggeredAt` 定位第几步触发。
>
> **边界**:阈值是 per-component 的,多个独立反馈环各自饿死互不影响;但若两个环共享某元件(如三态门同时被两环驱动),该元件计数会叠加,可能比预期更快触发 guard。课设电路一般不会出现。

### 电路
| 工具 | 说明 |
|---|---|
| `load_circuit` | 加载电路 txt(默认先校验,有 errors 拒绝加载) |
| `clear_circuit` | 清空画布 |

### 画电路(辅助生成,配合 docs/AI画电路手册.md 流程)
| 工具 | 说明 |
|---|---|
| `list_component_catalog` | 列出全部 23 种元件:名称/类型/引脚数 |
| `get_component_pins` | 查元件引脚表(画电路必查,引脚号禁止臆测) |
| `build_circuit` | 由结构化描述生成合法 txt(带校验),可直接 load_circuit 加载 |

### 电源
| 工具 | 说明 |
|---|---|
| `power_on` / `power_off` / `reset` | 开/关/复位电源 |

### 仿真
| 工具 | 说明 |
|---|---|
| `step` | 单步:跑空一次就绪队列(一次稳定传播) |
| `run` | 连续运行:启动 ContinuousPulse 跑 N 毫秒后停(有防护,安全) |
| `run_steps` | MCP 主动节拍(推荐):每步触发单脉冲/step 后让出主线程,跑 N 拍,响应最好 |
| `stop` | 停止所有连续脉冲(清 timer) |
| `press_switch` | 翻转开关(toggle) |
| `set_switch` | 设置开关到 0/1(处理初值高阻,自动判断是否需要翻转) |
| `trigger_pulse` | 触发单脉冲(须先 power_on) |
| `apply_input` | 给指定引脚施加 0/1 并传播 |
| `set_pulse_width` | 设置时钟周期(ms,默认 800,测试建议 50) |

### 读取
| 工具 | 说明 |
|---|---|
| `list_components` | 所有元件概览 |
| `get_component` | 元件全部引脚(pinName/pinFunction/pinValue) |
| `read_pin` / `read_all_pins` | 读引脚值(0低 / 1高 / 2高阻) |
| `read_memory` / `write_memory` | 读写 RAM6116/EPROM memory;write 标量按芯片位宽自动拆位数组,read 返回 bits+scalar |
| `snapshot` | 全电路所有引脚快照 |
| `get_guard_status` | 查防护状态(是否启用/阈值/饿死触发次数) |

### 批量测试
| 工具 | 说明 |
|---|---|
| `run_truth_table` | 批量跑真值表(自动遍历 2^n 或自定义 cases) |
| `assert_pins` | 一次性断言多引脚值,返回 pass/fail |

## 使用示例(AI 视角)

```
1. load_circuit(text=<电路txt全文>)        → 加载并校验
2. power_on()
3. set_switch(id="CP8", value=0)           → 使能 74LS245
4. for each 输入组合: set_switch + step + read_pin
   或直接: run_truth_table(switch_ids=["CP0",...], outputs=[{id,pin}])
5. assert_pins(expected=[{id,pin,value},...])
```

## 关键技术点

1. **桥接层**(`src/inject.ts`):注入到页面的一段 `window.__bridge` 脚本,把对原系统 `cDispatch`/`mycircuit`/`recovercircuit` 的调用集中封装,Node 侧通过 `page.evaluate` 一次性调用,返回可序列化 JSON。减少跨进程往返。
2. **调用对照**(均已查源码确认):
   - 加载:`recovercircuit('demo', mycircuit, txt)`(fileoperation.js:136)
   - 上电/断电:`cDispatch.powerOn()/powerOff()`(dispatch.js:93/99)
   - 单步:`cDispatch.runCircuit()`(dispatch.js:75)
   - 触发源器件:`cDispatch.sourceTrigger(c|id)`(dispatch.js:86)
   - 读引脚:`comp.pinValue[pinNo]`(0低/1高/2高阻)
3. **pinValue 三态**:0 低 / 1 高 / 2 高阻未驱动,断言要区分。
4. **Switch 初值坑**:原系统 `new Array([0])` 产生 `[[0]]`,`pinValue[0]` 实际是数组 `[0]`,`[0]==0` 成立但 `[0]===0` 不成立。故 `setSwitch` 用宽松比较 `!=`,与原系统一律 `==` 的语义一致。
5. **memory 限制**:RAM6116/EPROM 的 memory 硬编码在源码(`js/component/ram6116.js` 等),不随电路 txt 保存;运行时 `component.memory` 可读写,但**刷新页面会重置**回源码值。
6. **异步脉冲**:`ContinuousPulse`/`SinglePulse` 用 `setTimeout` 自驱动(默认 800ms);`run(duration)` 用真实等待,`stop()` 清 timer。测试时 `set_pulse_width(50)` 加速。
7. **MCP 用 stdio**:禁用 `console.log`(破坏协议流),用 `console.error`。
8. **TS + zod + MCP SDK 的 TS2589**:zod `ZodRawShape` 与 SDK 泛型组合会触发 "Type instantiation excessively deep"。本项目统一用 `server.registerTool<any, any>` + handler `(args:any, _extra:any): Promise<any>` 规避。

## 调试

```bash
# MCP Inspector:浏览器里查看所有工具、手动调用
npx @modelcontextprotocol/inspector node dist/index.js

# 跑集成测试
npm test
```

## 已知限制

- 不改原项目源码,因此 RAM/EPROM memory 初值仍需改 `js/component/*.js`(本工具只在运行时改 `component.memory`,刷新即失)。
- `run(duration)` 基于真实时钟等待,大批量时序测试较慢;组合逻辑用 `step`/`run_truth_table` 即可。
- 单步无 GUI 按钮,`step` = `cDispatch.runCircuit()`(跑空就绪队列)。

## 集成测试结果

`tests/integration.test.ts` 用 `files/examples/example_bus_demo.txt`(8 开关 → 74LS245 → 8 LED)端到端验证:
- ✅ 加载 18 个元件
- ✅ `-E=0` 使能时 A→B 透传,8 个 LED 全亮
- ✅ `-E=1` 禁能时 B 侧高阻,LED 不亮
