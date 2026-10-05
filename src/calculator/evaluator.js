/**
 * AST 求值器。
 *
 * 安全说明（对应作业要求「禁止 eval/exec」）：
 *   - 用户输入只经过 tokenizer → parser → AST，最终由本文件的 switch 分支
 *     解释执行。任何用户文本都不会进入 JS 引擎的代码编译路径，
 *     因此不存在任意代码执行的可能。
 *   - 所有运算都被限制在有限集合内（7 个运算符 + 21 个数学函数），
 *     并附加定义域检查、溢出检查与阶乘上限检查。
 *
 * 浮点处理策略：
 *   二进制浮点无法精确表示十进制小数，0.1 + 0.2 会得到 0.30000000000000004。
 *   本模块在最终结果上做两件事：
 *     1. 归一化到 12 位有效数字，消除末位噪声；
 *     2. 对使用了超越函数（sin/cos/…）的表达式，把 |x| < 1e-12 的结果归零
 *        （例如 sin(π) 理论值为 0，实际计算得 1.22e-16）。
 *   这样既保留工程上的正确性，又符合计算器的使用直觉。
 *
 * 参考：Google JavaScript Style Guide。
 */

import { CalculatorError, ErrorCode } from './errors.js';

/** 结果归一化使用的有效数字位数。 */
export const RESULT_PRECISION = 12;

/** 判定「浮点噪声级别的 0」的阈值。 */
export const ZERO_SNAP_THRESHOLD = 1e-12;

/** 阶乘参数上限（170! 已接近 Number.MAX_VALUE）。 */
export const MAX_FACTORIAL_INPUT = 170;

/**
 * 一元数学函数表。
 * 每个条目负责三件事：定义域校验、计算、以及生成友好错误信息。
 */
const FUNCTION_TABLE = Object.freeze({
  sin: (x) => Math.sin(x),
  cos: (x) => Math.cos(x),
  tan: (x) => Math.tan(x),
  asin: (x) => {
    assertDomain(Math.abs(x) <= 1, 'asin 的参数必须落在 [-1, 1] 区间内');
    return Math.asin(x);
  },
  acos: (x) => {
    assertDomain(Math.abs(x) <= 1, 'acos 的参数必须落在 [-1, 1] 区间内');
    return Math.acos(x);
  },
  atan: (x) => Math.atan(x),
  sinh: (x) => Math.sinh(x),
  cosh: (x) => Math.cosh(x),
  tanh: (x) => Math.tanh(x),
  ln: (x) => {
    assertDomain(x > 0, 'ln 的参数必须大于 0');
    return Math.log(x);
  },
  log: (x) => {
    assertDomain(x > 0, 'log（常用对数）的参数必须大于 0');
    return Math.log10(x);
  },
  log10: (x) => {
    assertDomain(x > 0, 'log10 的参数必须大于 0');
    return Math.log10(x);
  },
  log2: (x) => {
    assertDomain(x > 0, 'log2 的参数必须大于 0');
    return Math.log2(x);
  },
  sqrt: (x) => {
    assertDomain(x >= 0, 'sqrt 的参数不能为负数（实数范围内无平方根）');
    return Math.sqrt(x);
  },
  cbrt: (x) => Math.cbrt(x),
  abs: (x) => Math.abs(x),
  exp: (x) => Math.exp(x),
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
  round: (x) => Math.round(x),
  sign: (x) => Math.sign(x),
});

/**
 * 定义域断言。
 * @param {boolean} condition 断言条件。
 * @param {string} message 失败提示。
 * @returns {void}
 * @throws {CalculatorError} 条件不成立时抛出。
 */
function assertDomain(condition, message) {
  if (!condition) {
    throw new CalculatorError(ErrorCode.INVALID_FUNCTION_ARGUMENT, message);
  }
}

/**
 * 阶乘实现（仅接受 0 与非负整数）。
 * @param {number} value 操作数。
 * @returns {number} n! 的结果。
 * @throws {CalculatorError} 参数非法时抛出。
 */
function factorial(value) {
  if (!Number.isInteger(value)) {
    throw new CalculatorError(
      ErrorCode.INVALID_FUNCTION_ARGUMENT,
      '阶乘「!」只能作用于非负整数',
    );
  }
  if (value < 0) {
    throw new CalculatorError(
      ErrorCode.INVALID_FUNCTION_ARGUMENT,
      '阶乘「!」不能作用于负数',
    );
  }
  if (value > MAX_FACTORIAL_INPUT) {
    throw new CalculatorError(
      ErrorCode.NUMBER_OVERFLOW,
      `阶乘参数过大，最多支持 ${MAX_FACTORIAL_INPUT}!`,
    );
  }
  let result = 1;
  for (let i = 2; i <= value; i += 1) {
    result *= i;
  }
  return result;
}

/**
 * 判断 AST 中是否使用了超越函数。
 * 用于决定是否启用「浮点零归零」策略：直接输入的 1e-13 不应被吞掉，
 * 而 sin(π) 这类理论上为 0 的结果应该显示为 0。
 *
 * @param {object} node AST 节点。
 * @returns {boolean} 是否包含函数调用节点。
 */
export function usesFunction(node) {
  if (!node || typeof node !== 'object') {
    return false;
  }
  switch (node.type) {
    case 'call':
      return true;
    case 'binary':
      return usesFunction(node.left) || usesFunction(node.right);
    case 'unary':
    case 'factorial':
      return usesFunction(node.operand);
    default:
      return false;
  }
}

/**
 * 对 AST 求值。
 *
 * @param {object} ast 由 parser 生成的 AST 根节点。
 * @param {{snapZero?: boolean}} [options] 求值选项。
 * @returns {{value: number, rawValue: number}} 归一化结果与未归一化的原始结果。
 * @throws {CalculatorError} 运算非法（除零、定义域错误、溢出等）时抛出。
 */
export function evaluate(ast, options = {}) {
  const rawValue = evaluateNode(ast);
  if (Number.isNaN(rawValue)) {
    throw new CalculatorError(
      ErrorCode.UNDEFINED_RESULT,
      '该运算在实数范围内没有定义（结果不是实数）',
    );
  }
  if (!Number.isFinite(rawValue)) {
    throw new CalculatorError(
      ErrorCode.NUMBER_OVERFLOW,
      '计算结果超出可表示的范围（溢出）',
    );
  }
  return { value: normalizeResult(rawValue, options.snapZero === true), rawValue };
}

/**
 * 递归求值单个节点。
 * @param {object} node AST 节点。
 * @returns {number} 数值结果。
 */
function evaluateNode(node) {
  switch (node.type) {
    case 'number':
      return node.value;

    case 'unary':
      return node.operator === '-' ? -evaluateNode(node.operand) : evaluateNode(node.operand);

    case 'factorial':
      return factorial(evaluateNode(node.operand));

    case 'call': {
      const handler = FUNCTION_TABLE[node.name];
      if (typeof handler !== 'function') {
        throw new CalculatorError(
          ErrorCode.UNKNOWN_IDENTIFIER,
          `不支持的函数「${node.name}」`,
          { position: node.position },
        );
      }
      return handler(evaluateNode(node.argument));
    }

    case 'binary':
      return evaluateBinary(node);

    default:
      throw new CalculatorError(ErrorCode.INTERNAL_ERROR, '表达式解析结果异常', {
        statusCode: 500,
      });
  }
}

/**
 * 求值二元运算。
 * @param {object} node 二元运算节点。
 * @returns {number} 结果。
 */
function evaluateBinary(node) {
  const left = evaluateNode(node.left);
  const right = evaluateNode(node.right);
  switch (node.operator) {
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
      if (right === 0) {
        throw new CalculatorError(
          ErrorCode.DIVISION_BY_ZERO,
          '除数不能为 0',
          { position: node.position },
        );
      }
      return left / right;
    case '%':
      if (right === 0) {
        throw new CalculatorError(
          ErrorCode.MODULO_BY_ZERO,
          '取余运算的除数不能为 0',
          { position: node.position },
        );
      }
      return left % right;
    case '^':
      return left ** right;
    default:
      throw new CalculatorError(
        ErrorCode.UNEXPECTED_TOKEN,
        `不支持的运算符「${node.operator}」`,
        { position: node.position },
      );
  }
}

/**
 * 归一化计算结果。
 *
 * @param {number} value 原始结果。
 * @param {boolean} snapZero 是否把噪声级别的极小值归零。
 * @returns {number} 归一化结果。
 */
export function normalizeResult(value, snapZero) {
  let normalized = Number(value.toPrecision(RESULT_PRECISION));
  if (snapZero && Math.abs(normalized) < ZERO_SNAP_THRESHOLD) {
    normalized = 0;
  }
  // 消除 -0，避免前端显示成 "-0"。
  return normalized === 0 ? 0 : normalized;
}
