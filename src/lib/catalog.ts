// 元件目录:从原项目 tools/circuit-validator-core.js 源码动态提取 COMPONENT_TABLE。
// 不复制数据,避免双份维护;运行时解析源文件,元件表若更新自动同步。
import { readFileSync } from 'fs';
import { config } from '../config';

export interface ComponentMeta {
  name: string;
  ctor: string;
  type: string; // s=源 i=中间 d=目的
  width: number;
  height: number;
  paddingLR: number;
  showName: boolean;
  showPinNo: boolean;
  pinFunction: number[];
  pinName: string[];
}

export interface PinInfo {
  pinNo: number;
  pinName: string;
  pinFunction: number;
}

// pinFunction 类型码
// 0=输入 10=必要输入 1=输出 11=双向 2=地 3=电源 4=其它
export function pfLabel(pf: number): string {
  switch (pf) {
    case 0: return '输入';
    case 10: return '必要输入';
    case 1: return '输出';
    case 11: return '双向';
    case 2: return '地';
    case 3: return '电源';
    case 4: return '其它';
    default: return `未知(${pf})`;
  }
}

function loadTable(): Record<string, Omit<ComponentMeta, 'name'>> {
  const src = readFileSync(config.validatorCorePath, 'utf8');
  // 提取 makeBusPinNames 函数(BUS 引脚名生成器)
  const busFn = src.match(/function makeBusPinNames\(\) \{[\s\S]*?return names;\s*\}/)?.[0] ?? '';
  // 提取 COMPONENT_TABLE 对象字面量(到行尾缩进为 4 空格的 };)
  const tableLit = src.match(/const COMPONENT_TABLE = (\{[\s\S]*?\n    \});/)?.[1] ?? '{}';
  // 在沙箱里执行:先定义 makeBusPinNames,再求值对象字面量
  // eslint-disable-next-line no-new-func
  return new Function(busFn + ';return ' + tableLit)() as Record<string, Omit<ComponentMeta, 'name'>>;
}

const TABLE = loadTable();

export const CATALOG: ComponentMeta[] = Object.keys(TABLE).map((name) => ({ name, ...TABLE[name] }));

export function getComponentMeta(name: string): ComponentMeta | null {
  const m = TABLE[name];
  return m ? { name, ...m } : null;
}

export function getPins(name: string): PinInfo[] | null {
  const m = getComponentMeta(name);
  if (!m) return null;
  return m.pinFunction.map((pf, i) => ({ pinNo: i, pinName: m.pinName[i] ?? '', pinFunction: pf }));
}
