// 注入到浏览器页面的桥接脚本(字符串形式,由 Playwright addInitScript / evaluate 执行)。
//
// 设计:把对原项目的所有调用集中在此处,Node 侧只通过 window.__bridge.<method>(...args)
// 调用,返回可序列化 JSON。这样减少跨进程往返,也便于审查对原系统接口的使用。
//
// 调用对照(已查源码确认):
//   recovercircuit('demo', mycircuit, txt)  fileoperation.js:136  加载电路
//   mycircuit.deletecircuit()              circuitdiagram.js:758  清空
//   mycircuit.findById(id)                 circuitdiagram.js:420  查元件
//   mycircuit.componentAll                  circuitdiagram.js:16   元件表
//   cDispatch.powerOn/powerOff              dispatch.js:93/99      电源
//   cDispatch.runCircuit()                  dispatch.js:75         单步(跑空队列)
//   cDispatch.sourceTrigger(c|id)           dispatch.js:86         触发源器件
//   cDispatch.pulseWidth                    dispatch.js:22         时钟周期(ms)
//   cDispatch.runState                      dispatch.js:21         0关/1开
//   comp.input(pinNo, value)                各 component           写引脚
//   comp.pinValue[pinNo]                    各 component           读引脚(0低/1高/2高阻)
//   comp.memory                             ram6116/eprom2716      存储内容

export const INJECT_SCRIPT = `
(() => {
  if (window.__bridge) return 'already';
  const W = window;
  const err = (m) => { throw new Error('[dsvlab-bridge] ' + m); };
  const getC = (id) => {
    const c = W.mycircuit ? W.mycircuit.findById(id) : null;
    if (!c) err('元件不存在: ' + id);
    return c;
  };
  const powered = () => W.cDispatch && W.cDispatch.runState === 1;

  W.__bridge = {
    // 是否已就绪(mycircuit / cDispatch 已创建)
    ready: () => !!(W.mycircuit && W.cDispatch),

    // 加载电路 txt(先清空再恢复)。返回元件数与 id 列表。
    load: (txt) => {
      if (!W.recovercircuit) err('recovercircuit 未就绪(页面未加载 fileoperation.js)');
      if (W.mycircuit.deletecircuit) W.mycircuit.deletecircuit();
      W.recovercircuit('demo', W.mycircuit, txt);
      const all = W.mycircuit.componentAll;
      return { count: all.length, ids: all.map((c) => c.id) };
    },

    // 清空电路
    clear: () => { W.mycircuit.deletecircuit(); return { count: 0 }; },

    // 电源
    powerOn: () => { W.cDispatch.powerOn(); return { runState: W.cDispatch.runState }; },
    powerOff: () => { W.cDispatch.powerOff(); return { runState: W.cDispatch.runState }; },
    reset: () => { W.cDispatch.powerOff(); W.cDispatch.powerOn(); return { runState: W.cDispatch.runState }; },

    // 单步:跑空一次就绪队列(一次稳定传播)
    step: () => { W.cDispatch.runCircuit(); return { ok: true }; },

    // 设置时钟周期(ms)
    setPulseWidth: (ms) => { W.cDispatch.pulseWidth = ms; return { pulseWidth: W.cDispatch.pulseWidth }; },
    getPulseWidth: () => W.cDispatch.pulseWidth,
    getRunState: () => W.cDispatch.runState,

    // 翻转开关(电源开时传播,关时仅翻转)
    pressSwitch: (id) => {
      const c = getC(id);
      if (powered()) W.cDispatch.sourceTrigger(c);
      else c.input();
      return { id, pinValue: c.pinValue[0] };
    },

    // 设置开关到指定值(0/1):当前值不等则翻转一次。
    // 用宽松比较 != (而非 !==):原系统 Switch 的 pinValue 初值为 [0](new Array([0]) 产生的数组套数组),
    // [0] == 0 成立但 [0] === 0 不成立。与原系统 input()/beReady() 一律使用 == 的语义保持一致。
    setSwitch: (id, value) => {
      const c = getC(id);
      if (c.pinValue[0] != value) {
        if (powered()) W.cDispatch.sourceTrigger(c);
        else c.input();
      }
      return { id, pinValue: c.pinValue[0] };
    },

    // 触发单脉冲(必须电源开)
    triggerPulse: (id) => {
      const c = getC(id);
      if (!powered()) err('电源未开,无法触发脉冲');
      W.cDispatch.sourceTrigger(c);
      return { id };
    },

    // 给指定元件指定引脚施加电平(0/1),电源开时自动传播
    applyInput: (id, pinNo, value) => {
      const c = getC(id);
      c.input(pinNo, value);
      if (powered()) W.cDispatch.runCircuit();
      return { id, pinNo, pinValue: c.pinValue[pinNo] };
    },

    // 停止所有连续脉冲(清 timer)。不清元件状态。
    stop: () => {
      W.mycircuit.componentAll.forEach((c) => {
        if (c.timer) { clearTimeout(c.timer); c.timer = null; }
      });
      return { ok: true };
    },

    // 枚举元件
    listComponents: () => W.mycircuit.componentAll.map((c) => ({
      id: c.id, name: c.name, customName: c.customName, pinCount: c.pinValue.length,
      hasMemory: Array.isArray(c.memory),
    })),

    // 取元件全量引脚信息
    getComponent: (id) => {
      const c = getC(id);
      return {
        id: c.id, name: c.name, customName: c.customName,
        pinName: c.pinName, pinFunction: c.pinFunction, pinValue: c.pinValue,
        hasMemory: Array.isArray(c.memory),
      };
    },

    // 读单个引脚
    readPin: (id, pinNo) => {
      const c = getC(id);
      return { id, pinNo, pinName: c.pinName[pinNo], pinValue: c.pinValue[pinNo] };
    },

    // 读全部引脚
    readAllPins: (id) => {
      const c = getC(id);
      return c.pinValue.map((v, i) => ({
        pinNo: i, pinName: c.pinName[i], pinFunction: c.pinFunction[i], pinValue: v,
      }));
    },

    // 读 RAM6116/EPROM memory
    readMemory: (id) => {
      const c = getC(id);
      if (!Array.isArray(c.memory)) err('该元件无 memory 字段: ' + id);
      return { id, memory: c.memory };
    },

    // 写 memory(运行时,不随 txt 保存,刷新页面会重置)
    writeMemory: (id, addr, value) => {
      const c = getC(id);
      if (!Array.isArray(c.memory)) err('该元件无 memory 字段: ' + id);
      c.memory[addr] = value;
      return { id, addr, value };
    },

    // 全电路快照
    snapshot: () => W.mycircuit.componentAll.map((c) => ({
      id: c.id, name: c.name, pinValue: c.pinValue.slice(),
      memory: Array.isArray(c.memory) ? c.memory.slice() : null,
    })),
  };
  return 'ok';
})()
`;
