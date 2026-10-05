/**
 * 计算器领域错误定义。
 *
 * 所有由「用户表达式本身有问题」引起的失败都通过 CalculatorError 抛出，
 * 并携带一个稳定的机器可读 code，便于：
 *   1. 后端统一映射为 HTTP 状态码与标准响应体；
 *   2. 前端根据 code 做差异化提示（例如除零时高亮表达式）；
 *   3. 单元测试断言具体错误类型，而不是去比对中文字符串。
 *
 * 参考：Google JavaScript Style Guide —— 常量集合使用 Object.freeze 冻结，
 * 避免在运行期被意外修改。
 */

/** 错误码枚举。 */
export const ErrorCode = Object.freeze({
  EMPTY_EXPRESSION: 'EMPTY_EXPRESSION',
  EXPRESSION_TOO_LONG: 'EXPRESSION_TOO_LONG',
  EXPRESSION_TOO_COMPLEX: 'EXPRESSION_TOO_COMPLEX',
  INVALID_CHARACTER: 'INVALID_CHARACTER',
  INVALID_NUMBER: 'INVALID_NUMBER',
  UNKNOWN_IDENTIFIER: 'UNKNOWN_IDENTIFIER',
  UNEXPECTED_TOKEN: 'UNEXPECTED_TOKEN',
  MISSING_OPERAND: 'MISSING_OPERAND',
  UNCLOSED_PARENTHESIS: 'UNCLOSED_PARENTHESIS',
  UNEXPECTED_PARENTHESIS: 'UNEXPECTED_PARENTHESIS',
  DIVISION_BY_ZERO: 'DIVISION_BY_ZERO',
  MODULO_BY_ZERO: 'MODULO_BY_ZERO',
  INVALID_FUNCTION_ARGUMENT: 'INVALID_FUNCTION_ARGUMENT',
  UNDEFINED_RESULT: 'UNDEFINED_RESULT',
  NUMBER_OVERFLOW: 'NUMBER_OVERFLOW',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  HISTORY_NOT_FOUND: 'HISTORY_NOT_FOUND',
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

/**
 * 计算器业务异常。
 *
 * @property {string} code 机器可读错误码，取值见 {@link ErrorCode}。
 * @property {number|null} position 出错字符在表达式中的下标，用于前端定位。
 * @property {number} statusCode 建议的 HTTP 状态码。
 */
export class CalculatorError extends Error {
  /**
   * @param {string} code 错误码。
   * @param {string} message 面向用户的中文提示。
   * @param {{position?: number|null, statusCode?: number}} [options] 附加信息。
   */
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'CalculatorError';
    this.code = code;
    this.position = options.position === undefined ? null : options.position;
    this.statusCode = options.statusCode === undefined ? 400 : options.statusCode;
    // 便于 V8 在堆栈中省略本构造帧。
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CalculatorError);
    }
  }

  /**
   * 序列化为 API 错误对象。
   * @returns {{code: string, message: string, position: number|null}}
   */
  toJSON() {
    return { code: this.code, message: this.message, position: this.position };
  }
}

/**
 * 断言失败时抛出 CalculatorError 的小工具。
 *
 * @param {boolean} condition 断言条件。
 * @param {string} code 失败时的错误码。
 * @param {string} message 失败时的提示。
 * @param {{position?: number|null}} [options] 附加信息。
 * @returns {void}
 */
export function invariant(condition, code, message, options = {}) {
  if (!condition) {
    throw new CalculatorError(code, message, options);
  }
}
