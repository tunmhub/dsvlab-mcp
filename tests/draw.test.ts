// 画电路工具测试:元件目录查询 + build_circuit 生成 txt 并校验。
import { describe, test, expect } from 'vitest';
import { CATALOG, getComponentMeta, getPins, pfLabel } from '../src/lib/catalog';
import { buildCircuitText } from '../src/tools/draw';
import { validateCircuitText } from '../src/lib/validate';

describe('元件目录', () => {
  test('共 23 种元件', () => {
    expect(CATALOG.length).toBe(23);
  });

  test('74LS245 引脚表正确', () => {
    const m = getComponentMeta('74LS245')!;
    expect(m).not.toBeNull();
    expect(m.pinFunction.length).toBe(20);
    expect(m.pinName[0]).toBe('DIR');
    expect(m.pinFunction[0]).toBe(4); // 其它
    expect(m.pinName[9]).toBe('GND');
    expect(m.pinFunction[10]).toBe(1); // B0 输出
  });

  test('Switch 单引脚输出', () => {
    const p = getPins('Switch')!;
    expect(p.length).toBe(1);
    expect(p[0].pinFunction).toBe(1); // 输出
  });

  test('BUS 128 引脚全双向', () => {
    const p = getPins('BUS')!;
    expect(p.length).toBe(128);
    expect(p.every((x) => x.pinFunction === 11)).toBe(true);
  });

  test('pfLabel 类型码翻译', () => {
    expect(pfLabel(0)).toBe('输入');
    expect(pfLabel(10)).toBe('必要输入');
    expect(pfLabel(1)).toBe('输出');
    expect(pfLabel(11)).toBe('双向');
  });

  test('未知元件返回 null', () => {
    expect(getComponentMeta('NotExist')).toBeNull();
    expect(getPins('NotExist')).toBeNull();
  });
});

describe('build_circuit 生成与校验', () => {
  test('生成 Switch→Led 简单电路,校验通过', () => {
    const txt = buildCircuitText(
      [{ name: 'Switch', x: '100px', y: '200px', id: 'CP0' }, { name: 'Led', x: '100px', y: '120px', id: 'CP1' }],
      [{ from_id: 'CP0', from_pin: 0, to_id: 'CP1', to_pin: 0 }],
    );
    const v = validateCircuitText(txt);
    expect(v.errors).toEqual([]);
    expect(v.components.length).toBe(2);
    expect(v.lines.length).toBe(1);
    // 格式检查:组件段末尾 $ 紧接 &,连线末尾逗号紧接 @count
    expect(txt).toMatch(/\$&/); // 组件段以 $ 结尾,后接 &
    expect(txt).toMatch(/CP0Pin0ToCP1Pin0,@2$/); // 连线末尾逗号,后接 @count
    expect(txt).toMatch(/@2$/);
  });

  test('生成 bus demo 等价电路(8 开关→74LS245→8 LED),校验通过', () => {
    const comps = [
      ...Array.from({ length: 8 }, (_, i) => ({ name: 'Switch', x: `${100 + i * 18}px`, y: '200px', id: `CP${i}` })),
      ...Array.from({ length: 8 }, (_, i) => ({ name: 'Led', x: `${100 + i * 18}px`, y: '120px', id: `CP${10 + i}` })),
      { name: '74LS245', x: '120px', y: '300px', id: 'CP9', customName: '74LS245' },
      { name: 'Switch', x: '320px', y: '290px', id: 'CP8' },
    ];
    const lines = [
      ...Array.from({ length: 8 }, (_, i) => ({ from_id: `CP${i}`, from_pin: 0, to_id: 'CP9', to_pin: i + 1 })),
      { from_id: 'CP8', from_pin: 0, to_id: 'CP9', to_pin: 18 }, // -E
      ...Array.from({ length: 8 }, (_, i) => ({ from_id: 'CP9', from_pin: 10 + i, to_id: `CP${10 + i}`, to_pin: 0 })),
    ];
    const txt = buildCircuitText(comps, lines);
    const v = validateCircuitText(txt);
    expect(v.errors).toEqual([]);
    expect(v.components.length).toBe(18);
    expect(v.lines.length).toBe(17);
  });

  test('连线方向错误(输出→输出)应被校验抓住', () => {
    // LED 是输入引脚(function 10),把 LED 当输出连到另一个 LED 输入 — 起点非输出
    const txt = buildCircuitText(
      [{ name: 'Led', x: '100px', y: '120px', id: 'CP0' }, { name: 'Led', x: '120px', y: '120px', id: 'CP1' }],
      [{ from_id: 'CP0', from_pin: 0, to_id: 'CP1', to_pin: 0 }],
    );
    const v = validateCircuitText(txt);
    expect(v.errors.length).toBeGreaterThan(0);
  });
});
