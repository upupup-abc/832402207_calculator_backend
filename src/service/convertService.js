/**
 * 单位换算服务（附加功能）。
 *
 * 为什么把单位换算也放在后端？
 *   作业要求「核心计算逻辑必须在后端」。单位换算同样是一种计算，
 *   放在后端可以复用统一的错误处理、统一响应格式，也让前端保持纯展示职责。
 *
 * 实现方式：
 *   - 线性单位（长度、质量…）为每个单位记录「相对于基准单位的倍率」，
 *     换算 = 值 × 源倍率 ÷ 目标倍率；
 *   - 温度是仿射变换（存在零点偏移），单独用 toBase/fromBase 两个函数描述。
 */

import { CalculatorError, ErrorCode } from '../calculator/errors.js';
import { normalizeResult } from '../calculator/evaluator.js';

/**
 * 单位定义表。
 * 线性单位：{ ratio } 表示 1 个该单位等于多少个基准单位。
 * 温度：{ toBase, fromBase }，基准为摄氏度。
 */
const UNIT_CATALOG = Object.freeze({
  length: {
    label: '长度',
    baseUnit: 'm',
    units: {
      m: { label: '米 (m)', ratio: 1 },
      km: { label: '千米 (km)', ratio: 1000 },
      cm: { label: '厘米 (cm)', ratio: 0.01 },
      mm: { label: '毫米 (mm)', ratio: 0.001 },
      um: { label: '微米 (μm)', ratio: 1e-6 },
      mi: { label: '英里 (mi)', ratio: 1609.344 },
      yd: { label: '码 (yd)', ratio: 0.9144 },
      ft: { label: '英尺 (ft)', ratio: 0.3048 },
      in: { label: '英寸 (in)', ratio: 0.0254 },
      nmi: { label: '海里 (nmi)', ratio: 1852 },
    },
  },
  mass: {
    label: '质量',
    baseUnit: 'kg',
    units: {
      kg: { label: '千克 (kg)', ratio: 1 },
      g: { label: '克 (g)', ratio: 0.001 },
      mg: { label: '毫克 (mg)', ratio: 1e-6 },
      t: { label: '吨 (t)', ratio: 1000 },
      lb: { label: '磅 (lb)', ratio: 0.45359237 },
      oz: { label: '盎司 (oz)', ratio: 0.028349523125 },
    },
  },
  area: {
    label: '面积',
    baseUnit: 'm2',
    units: {
      m2: { label: '平方米 (m²)', ratio: 1 },
      km2: { label: '平方千米 (km²)', ratio: 1e6 },
      cm2: { label: '平方厘米 (cm²)', ratio: 1e-4 },
      ha: { label: '公顷 (ha)', ratio: 10000 },
      acre: { label: '英亩 (acre)', ratio: 4046.8564224 },
      ft2: { label: '平方英尺 (ft²)', ratio: 0.09290304 },
    },
  },
  volume: {
    label: '体积',
    baseUnit: 'L',
    units: {
      L: { label: '升 (L)', ratio: 1 },
      mL: { label: '毫升 (mL)', ratio: 0.001 },
      m3: { label: '立方米 (m³)', ratio: 1000 },
      gal: { label: '美制加仑 (gal)', ratio: 3.785411784 },
      qt: { label: '美制夸脱 (qt)', ratio: 0.946352946 },
    },
  },
  data: {
    label: '数据存储',
    baseUnit: 'MB',
    units: {
      B: { label: '字节 (B)', ratio: 1e-6 },
      KB: { label: '千字节 (KB)', ratio: 0.001 },
      MB: { label: '兆字节 (MB)', ratio: 1 },
      GB: { label: '吉字节 (GB)', ratio: 1000 },
      TB: { label: '太字节 (TB)', ratio: 1e6 },
      KiB: { label: 'Kibibyte (KiB)', ratio: 1024 / 1e6 },
      MiB: { label: 'Mebibyte (MiB)', ratio: 1048576 / 1e6 },
      GiB: { label: 'Gibibyte (GiB)', ratio: 1073741824 / 1e6 },
    },
  },
  time: {
    label: '时间',
    baseUnit: 's',
    units: {
      ms: { label: '毫秒 (ms)', ratio: 0.001 },
      s: { label: '秒 (s)', ratio: 1 },
      min: { label: '分钟 (min)', ratio: 60 },
      h: { label: '小时 (h)', ratio: 3600 },
      day: { label: '天 (day)', ratio: 86400 },
      week: { label: '周 (week)', ratio: 604800 },
    },
  },
  temperature: {
    label: '温度',
    baseUnit: 'C',
    units: {
      C: {
        label: '摄氏度 (°C)',
        toBase: (value) => value,
        fromBase: (value) => value,
      },
      F: {
        label: '华氏度 (°F)',
        toBase: (value) => (value - 32) * (5 / 9),
        fromBase: (value) => value * (9 / 5) + 32,
      },
      K: {
        label: '开尔文 (K)',
        toBase: (value) => value - 273.15,
        fromBase: (value) => value + 273.15,
      },
    },
  },
});

/**
 * 返回全部换算类别与单位清单（供前端渲染下拉框）。
 *
 * @returns {Array<object>} 类别列表。
 */
export function describeUnits() {
  return Object.entries(UNIT_CATALOG).map(([key, category]) => ({
    category: key,
    label: category.label,
    baseUnit: category.baseUnit,
    units: Object.entries(category.units).map(([code, unit]) => ({
      code,
      label: unit.label,
    })),
  }));
}

/**
 * 执行单位换算。
 *
 * @param {{category?: unknown, from?: unknown, to?: unknown, value?: unknown}} input 换算参数。
 * @returns {{category: string, from: string, to: string, value: number,
 *   result: number, resultText: string, formatted: string}} 换算结果。
 * @throws {CalculatorError} 参数非法时抛出。
 */
export function convert(input) {
  const categoryKey = String(input.category ?? '');
  const category = UNIT_CATALOG[categoryKey];
  if (category === undefined) {
    throw new CalculatorError(
      ErrorCode.VALIDATION_ERROR,
      `不支持的换算类别「${categoryKey}」，可选值：${Object.keys(UNIT_CATALOG).join(', ')}`,
    );
  }

  const fromCode = String(input.from ?? '');
  const toCode = String(input.to ?? '');
  const fromUnit = category.units[fromCode];
  const toUnit = category.units[toCode];
  if (fromUnit === undefined || toUnit === undefined) {
    throw new CalculatorError(
      ErrorCode.VALIDATION_ERROR,
      `类别「${category.label}」不支持单位「${fromUnit === undefined ? fromCode : toCode}」`,
    );
  }

  const value = Number(input.value);
  if (!Number.isFinite(value)) {
    throw new CalculatorError(ErrorCode.VALIDATION_ERROR, '参数 value 必须是有效数字');
  }

  let raw;
  if (typeof fromUnit.toBase === 'function') {
    raw = toUnit.fromBase(fromUnit.toBase(value));
  } else {
    raw = (value * fromUnit.ratio) / toUnit.ratio;
  }

  if (!Number.isFinite(raw)) {
    throw new CalculatorError(ErrorCode.NUMBER_OVERFLOW, '换算结果超出可表示范围');
  }

  const result = normalizeResult(raw, false);
  return {
    category: categoryKey,
    from: fromCode,
    to: toCode,
    value,
    result,
    resultText: String(result),
    formatted: `${formatNumber(value)} ${fromUnit.label} = ${formatNumber(result)} ${toUnit.label}`,
  };
}

/**
 * 以千分位格式化数字，仅用于生成可读描述。
 *
 * @param {number} value 数值。
 * @returns {string} 格式化文本。
 */
function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  if (Number.isInteger(value) && Math.abs(value) < 1e15) {
    return value.toLocaleString('en-US');
  }
  return String(Number(value.toPrecision(12)));
}
