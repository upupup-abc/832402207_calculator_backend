/**
 * 计算服务（Service 层）。
 *
 * 职责边界：
 *   - 校验「表达式」这一业务输入（非空、长度上限）；
 *   - 编排 tokenizer → parser → evaluator 三步，得到计算结果；
 *   - 输出统一的「计算结果 DTO」，供控制器写库与返回前端。
 *
 * 本层不接触 HTTP 对象，也不接触数据库，因此可以被单元测试直接调用。
 * 这正是前后端分离之外的另一层关注点分离：接口层 / 业务层 / 数据层。
 *
 * 参考：Google JavaScript Style Guide。
 */

import { CalculatorError, ErrorCode } from '../calculator/errors.js';
import { MAX_EXPRESSION_LENGTH } from '../calculator/tokenizer.js';
import { parseExpression } from '../calculator/parser.js';
import { evaluate, usesFunction } from '../calculator/evaluator.js';

/**
 * 把数值格式化为便于阅读与检索的文本。
 *
 * 规则：
 *   - 整数直接输出，不加小数点；
 *   - 极大/极小的数使用科学计数法，避免出现一长串 0；
 *   - 其余情况保留最多 10 位小数并去掉末尾多余的 0。
 *
 * @param {number} value 数值。
 * @returns {string} 文本形式。
 */
export function formatResult(value) {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  if (value === 0) {
    return '0';
  }
  const abs = Math.abs(value);
  if (Number.isInteger(value) && abs < 1e15) {
    return String(value);
  }
  if (abs < 1e-6 || abs >= 1e15) {
    return value.toExponential(8).replace(/\.?0+e/, 'e');
  }
  return String(Number(value.toFixed(10)));
}

/**
 * 求值一个表达式字符串。
 *
 * @param {unknown} rawExpression 前端传入的表达式。
 * @returns {{expression: string, normalizedExpression: string, result: number,
 *   rawResult: number, resultText: string}} 计算结果 DTO。
 * @throws {CalculatorError} 输入非法或运算非法时抛出。
 */
export function calculate(rawExpression) {
  if (rawExpression === undefined || rawExpression === null) {
    throw new CalculatorError(ErrorCode.EMPTY_EXPRESSION, '缺少参数 expression');
  }
  if (typeof rawExpression !== 'string') {
    throw new CalculatorError(ErrorCode.VALIDATION_ERROR, '参数 expression 必须是字符串');
  }
  const expression = rawExpression.trim();
  if (expression === '') {
    throw new CalculatorError(ErrorCode.EMPTY_EXPRESSION, '表达式为空，请输入需要计算的内容');
  }
  if (expression.length > MAX_EXPRESSION_LENGTH) {
    throw new CalculatorError(
      ErrorCode.EXPRESSION_TOO_LONG,
      `表达式过长，最多支持 ${MAX_EXPRESSION_LENGTH} 个字符`,
    );
  }

  const { ast, normalized } = parseExpression(expression);
  // 只有用到超越函数的表达式才启用「浮点零归零」，
  // 避免把用户直接输入的 1e-13 误判为 0。
  const { value, rawValue } = evaluate(ast, { snapZero: usesFunction(ast) });

  return {
    expression,
    normalizedExpression: normalized,
    result: value,
    rawResult: rawValue,
    resultText: formatResult(value),
  };
}

/**
 * 计算器支持的语法元数据。
 *
 * 前端启动时拉取一次即可渲染「科学函数面板」与帮助提示，
 * 避免把函数列表硬编码在两端造成不一致。
 *
 * @returns {object} 元数据对象。
 */
export function describeGrammar() {
  return {
    operators: [
      { symbol: '+', name: '加法', example: '12+8' },
      { symbol: '-', name: '减法', example: '12-8' },
      { symbol: '*', name: '乘法', example: '12*8' },
      { symbol: '/', name: '除法', example: '12/8' },
      { symbol: '^', name: '幂运算', example: '2^10' },
      { symbol: '%', name: '取余', example: '10%3' },
      { symbol: '!', name: '阶乘', example: '5!' },
    ],
    functions: [
      { name: 'sin', description: '正弦（弧度）', example: 'sin(pi/6)' },
      { name: 'cos', description: '余弦（弧度）', example: 'cos(0)' },
      { name: 'tan', description: '正切（弧度）', example: 'tan(pi/4)' },
      { name: 'asin', description: '反正弦', example: 'asin(0.5)' },
      { name: 'acos', description: '反余弦', example: 'acos(0.5)' },
      { name: 'atan', description: '反正切', example: 'atan(1)' },
      { name: 'sinh', description: '双曲正弦', example: 'sinh(1)' },
      { name: 'cosh', description: '双曲余弦', example: 'cosh(1)' },
      { name: 'tanh', description: '双曲正切', example: 'tanh(1)' },
      { name: 'ln', description: '自然对数', example: 'ln(e)' },
      { name: 'log', description: '常用对数（底 10）', example: 'log(1000)' },
      { name: 'log2', description: '以 2 为底的对数', example: 'log2(1024)' },
      { name: 'log10', description: '常用对数（log 的同义写法）', example: 'log10(1000)' },
      { name: 'sqrt', description: '平方根', example: 'sqrt(144)' },
      { name: 'cbrt', description: '立方根', example: 'cbrt(27)' },
      { name: 'abs', description: '绝对值', example: 'abs(-3.5)' },
      { name: 'exp', description: 'e 的幂', example: 'exp(1)' },
      { name: 'floor', description: '向下取整', example: 'floor(2.9)' },
      { name: 'ceil', description: '向上取整', example: 'ceil(2.1)' },
      { name: 'round', description: '四舍五入', example: 'round(2.5)' },
      { name: 'sign', description: '符号函数', example: 'sign(-8)' },
    ],
    constants: [
      { name: 'pi', description: '圆周率 π ≈ 3.141592653589793' },
      { name: 'e', description: '自然常数 e ≈ 2.718281828459045' },
      { name: 'tau', description: 'τ = 2π ≈ 6.283185307179586' },
    ],
    syntax: [
      '支持四则运算、幂运算 ^、取余 %、阶乘 !',
      '支持圆括号改变优先级，例如 (1+2)*3',
      '支持一元正负号，例如 -5+8、3*-2',
      '支持小数与科学计数法，例如 3.14、1.5e-3',
      '支持隐式乘法，例如 2(3+4)、3pi、2sin(0)',
      '支持 × ÷ − π 等全角/排版符号，后端自动归一化',
    ],
  };
}
