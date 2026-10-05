/**
 * 表达式词法分析器（Lexer / Tokenizer）。
 *
 * 设计要点：
 *   1. 不做任何字符串替换式的「伪解析」，而是逐字符扫描生成 Token 序列，
 *      把「用户输入」与「可执行代码」彻底隔离——这是不使用 eval/exec 的前提。
 *   2. 统一全角字符与常见数学符号（× ÷ − π 等），让前端可以直接把界面上
 *      显示的符号发给后端，减少前后端之间的隐式约定。
 *   3. 记录每个 Token 的下标位置，便于出错时精确提示。
 *
 * 参考：PEP 8 / Google JavaScript Style Guide —— 模块内私有函数以 file-private
 * 的方式命名并只在文件内部使用，不对外导出。
 */

import { CalculatorError, ErrorCode } from './errors.js';

/** 表达式最大字符数，超过即拒绝，防止构造超长输入消耗 CPU。 */
export const MAX_EXPRESSION_LENGTH = 200;

/** Token 序列长度上限。 */
export const MAX_TOKEN_COUNT = 512;

/** Token 类型枚举。 */
export const TokenType = Object.freeze({
  NUMBER: 'number',
  OPERATOR: 'operator',
  LPAREN: 'lparen',
  RPAREN: 'rparen',
  FUNCTION: 'function',
  CONSTANT: 'constant',
  FACTORIAL: 'factorial',
  EOF: 'eof',
});

/** 支持的二元运算符（幂运算在语法分析层做右结合处理）。 */
export const OPERATORS = Object.freeze(new Set(['+', '-', '*', '/', '^', '%']));

/** 支持的一元数学函数，全部为单参数函数。 */
export const FUNCTIONS = Object.freeze(new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'sinh', 'cosh', 'tanh',
  'ln', 'log', 'log2', 'log10',
  'sqrt', 'cbrt', 'abs', 'exp', 'floor', 'ceil', 'round', 'sign',
]));

/** 支持的数学常量。 */
export const CONSTANTS = Object.freeze({
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
});

/** 全角 / 排版符号归一化映射表。 */
const SYMBOL_ALIASES = Object.freeze({
  '×': '*', '·': '*', '∗': '*', '＊': '*',
  '÷': '/', '／': '/',
  '−': '-', '–': '-', '—': '-', '－': '-',
  '＋': '+',
  '（': '(', '）': ')',
  '！': '!',
  '^': '^',
  // 中文输入法下很容易打出全角数字与全角小数点，一并归一化，
  // 避免用户从文档里复制算式过来时报「无法识别的字符」。
  '０': '0', '１': '1', '２': '2', '３': '3', '４': '4',
  '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
  '．': '.', '。': '.',
});

const DIGIT_PATTERN = /[0-9]/;
const LETTER_PATTERN = /[a-zA-Z]/;
const WHITESPACE_PATTERN = /\s/;

/**
 * 把用户可读的表达式归一化为「规范形式」。
 *
 * 归一化包含两步：
 *   1. 符号替换：全角 × ÷ −、排版用连字符、`**` 等统一成 ASCII 运算符；
 *   2. 去除所有空白字符，得到唯一规范形式。
 *
 * 之所以要「唯一规范形式」，是因为它被用作数据库中的 normalized_expression，
 * 用来做重复表达式归并、统计「最常用表达式」，以及前端「一键复用」时的原文。
 * 注意：这里只做字符级替换，不做任何求值。
 *
 * @param {string} raw 原始表达式。
 * @returns {string} 归一化后的表达式。
 */
export function normalizeExpression(raw) {
  let text = String(raw);
  // 连续两个星号是编程语言里的幂运算写法，前端/学生容易误输入，统一成 ^。
  text = text.replace(/\*\*/g, '^');
  let result = '';
  for (const char of text) {
    if (WHITESPACE_PATTERN.test(char)) {
      continue;
    }
    result += Object.prototype.hasOwnProperty.call(SYMBOL_ALIASES, char)
      ? SYMBOL_ALIASES[char]
      : char;
  }
  return result;
}

/**
 * 判断一个 Token 是否可以作为「主表达式」的开头。
 * 语法分析器用它来识别隐式乘法，例如 2(3+4)、3π、2sin(0)。
 *
 * @param {{type: string}|null|undefined} token 待判断的 Token。
 * @returns {boolean} 是否可以开始一个主表达式。
 */
export function startsPrimary(token) {
  if (!token) {
    return false;
  }
  return token.type === TokenType.NUMBER
    || token.type === TokenType.CONSTANT
    || token.type === TokenType.FUNCTION
    || token.type === TokenType.LPAREN;
}

/**
 * 把表达式切分为 Token 序列。
 *
 * @param {string} raw 归一化后的表达式。
 * @returns {{tokens: Array<object>, normalized: string}} Token 序列与归一化文本。
 * @throws {CalculatorError} 当出现非法字符、非法数字或未知标识符时抛出。
 */
export function tokenize(raw) {
  const source = String(raw);
  const tokens = [];
  let index = 0;

  const push = (token) => {
    if (tokens.length >= MAX_TOKEN_COUNT) {
      throw new CalculatorError(
        ErrorCode.EXPRESSION_TOO_COMPLEX,
        `表达式过于复杂（Token 数量超过 ${MAX_TOKEN_COUNT}）`,
      );
    }
    tokens.push(token);
  };

  while (index < source.length) {
    const char = source[index];

    if (WHITESPACE_PATTERN.test(char)) {
      index += 1;
      continue;
    }

    // ---- 数字字面量：支持小数、前导小数点与科学计数法 1.5e-3 ----
    if (DIGIT_PATTERN.test(char) || char === '.') {
      const start = index;
      while (index < source.length && DIGIT_PATTERN.test(source[index])) {
        index += 1;
      }
      if (source[index] === '.') {
        index += 1;
        while (index < source.length && DIGIT_PATTERN.test(source[index])) {
          index += 1;
        }
      }
      // 科学计数法：只有 e/E 后面紧跟（可选符号 + ）数字时才吞掉。
      if (source[index] === 'e' || source[index] === 'E') {
        let lookahead = index + 1;
        if (source[lookahead] === '+' || source[lookahead] === '-') {
          lookahead += 1;
        }
        if (lookahead < source.length && DIGIT_PATTERN.test(source[lookahead])) {
          while (lookahead < source.length && DIGIT_PATTERN.test(source[lookahead])) {
            lookahead += 1;
          }
          index = lookahead;
        }
      }
      const literal = source.slice(start, index);
      const value = Number(literal);
      if (!Number.isFinite(value)) {
        throw new CalculatorError(
          ErrorCode.INVALID_NUMBER,
          `无法解析的数字「${literal}」`,
          { position: start },
        );
      }
      push({ type: TokenType.NUMBER, value, literal, position: start });
      continue;
    }

    // ---- 标识符：函数名或常量名 ----
    if (LETTER_PATTERN.test(char)) {
      const start = index;
      while (
        index < source.length
        && (LETTER_PATTERN.test(source[index]) || DIGIT_PATTERN.test(source[index]))
      ) {
        index += 1;
      }
      const name = source.slice(start, index);
      const lower = name.toLowerCase();
      if (FUNCTIONS.has(lower)) {
        push({ type: TokenType.FUNCTION, value: lower, literal: name, position: start });
      } else if (Object.prototype.hasOwnProperty.call(CONSTANTS, lower)) {
        push({ type: TokenType.CONSTANT, value: CONSTANTS[lower], literal: name, position: start });
      } else {
        throw new CalculatorError(
          ErrorCode.UNKNOWN_IDENTIFIER,
          `未知的函数或常量「${name}」`,
          { position: start },
        );
      }
      continue;
    }

    // ---- 圆周率符号 π ----
    if (char === 'π') {
      push({ type: TokenType.CONSTANT, value: Math.PI, literal: 'π', position: index });
      index += 1;
      continue;
    }

    // ---- 运算符 ----
    if (OPERATORS.has(char)) {
      push({ type: TokenType.OPERATOR, value: char, position: index });
      index += 1;
      continue;
    }

    if (char === '(') {
      push({ type: TokenType.LPAREN, value: char, position: index });
      index += 1;
      continue;
    }

    if (char === ')') {
      push({ type: TokenType.RPAREN, value: char, position: index });
      index += 1;
      continue;
    }

    if (char === '!') {
      push({ type: TokenType.FACTORIAL, value: char, position: index });
      index += 1;
      continue;
    }

    throw new CalculatorError(
      ErrorCode.INVALID_CHARACTER,
      `表达式中包含无法识别的字符「${char}」`,
      { position: index },
    );
  }

  push({ type: TokenType.EOF, value: null, position: source.length });
  return { tokens, normalized: source };
}
