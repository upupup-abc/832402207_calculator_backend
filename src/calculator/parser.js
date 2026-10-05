/**
 * 表达式语法分析器（递归下降 + 优先级分层）。
 *
 * 文法（EBNF）：
 *
 *   expression   := additive
 *   additive     := multiplicative ( ('+' | '-') multiplicative )*
 *   multiplicative := unary ( ('*' | '/' | '%') unary | implicitMultiply )*
 *   unary        := ('+' | '-') unary | power
 *   power        := postfix ( '^' unary )?            // 右结合
 *   postfix      := primary ( '!' )*                  // 阶乘
 *   primary      := NUMBER
 *                 | CONSTANT
 *                 | FUNCTION '(' expression ')'
 *                 | '(' expression ')'
 *
 * 关键设计：
 *   - 分层即优先级。层越低结合越松，因此不需要额外的优先级数字表，
 *     阅读文法就能验证 `1+2*3` 与 `(1+2)*3` 的差异。这是不使用 eval 的
 *     核心替代方案：先把表达式变成 AST，再解释执行 AST。
 *   - `power` 的右侧调用 `unary`，既实现了右结合（2^3^2 = 512），
 *     又天然支持 `2^-3` 这类「幂运算后面跟一元负号」的写法。
 *   - `multiplicative` 中检测隐式乘法，支持 2(3+4)、3π、2sin(0) 等常见写法。
 *
 * 参考：Google JavaScript Style Guide。
 */

import { CalculatorError, ErrorCode } from './errors.js';
import {
  TokenType,
  normalizeExpression,
  startsPrimary,
  tokenize,
} from './tokenizer.js';

/** 括号最大嵌套深度，防止构造超深表达式导致栈溢出。 */
export const MAX_NESTING_DEPTH = 64;

/**
 * 把表达式文本解析为抽象语法树（AST）。
 *
 * @param {string} rawExpression 用户原始表达式。
 * @returns {{ast: object, normalized: string}} AST 与归一化后的表达式文本。
 * @throws {CalculatorError} 语法错误时抛出。
 */
export function parseExpression(rawExpression) {
  const normalized = normalizeExpression(rawExpression);
  const { tokens } = tokenize(normalized);
  const parser = new Parser(tokens, normalized);
  const ast = parser.parse();
  return { ast, normalized };
}

/** 递归下降语法分析器。 */
class Parser {
  /**
   * @param {Array<object>} tokens Token 序列（以 EOF 结束）。
   * @param {string} source 归一化后的表达式，仅用于错误信息。
   */
  constructor(tokens, source) {
    this.tokens = tokens;
    this.source = source;
    this.cursor = 0;
    this.depth = 0;
  }

  /**
   * 解析入口。
   * @returns {object} AST 根节点。
   */
  parse() {
    if (this.tokens.length === 1) {
      throw new CalculatorError(ErrorCode.EMPTY_EXPRESSION, '表达式为空，请输入需要计算的内容');
    }
    const node = this.parseExpression();
    const token = this.peek();
    if (token.type === TokenType.RPAREN) {
      throw new CalculatorError(
        ErrorCode.UNEXPECTED_PARENTHESIS,
        '右括号「)」没有与之匹配的左括号',
        { position: token.position },
      );
    }
    if (token.type !== TokenType.EOF) {
      throw new CalculatorError(
        ErrorCode.UNEXPECTED_TOKEN,
        `表达式在「${this.describe(token)}」处无法继续解析`,
        { position: token.position },
      );
    }
    return node;
  }

  // ---------------------------------------------------------------- 层次方法

  /** additive := multiplicative ( ('+' | '-') multiplicative )* */
  parseExpression() {
    let left = this.parseMultiplicative();
    for (;;) {
      const token = this.peek();
      if (token.type === TokenType.OPERATOR && (token.value === '+' || token.value === '-')) {
        this.next();
        const right = this.parseMultiplicative();
        left = { type: 'binary', operator: token.value, left, right, position: token.position };
        continue;
      }
      return left;
    }
  }

  /** multiplicative := unary ( ('*' | '/' | '%') unary | implicitMultiply )* */
  parseMultiplicative() {
    let left = this.parseUnary();
    for (;;) {
      const token = this.peek();
      if (token.type === TokenType.OPERATOR && '* / %'.includes(token.value)) {
        this.next();
        const right = this.parseUnary();
        left = { type: 'binary', operator: token.value, left, right, position: token.position };
        continue;
      }
      // 隐式乘法：2(3+4) / 3π / 2sin(0) / (1+2)(3+4)
      if (startsPrimary(token)) {
        const right = this.parseUnary();
        left = { type: 'binary', operator: '*', left, right, position: token.position, implicit: true };
        continue;
      }
      return left;
    }
  }

  /** unary := ('+' | '-') unary | power */
  parseUnary() {
    const token = this.peek();
    if (token.type === TokenType.OPERATOR && (token.value === '+' || token.value === '-')) {
      this.next();
      this.enter();
      const operand = this.parseUnary();
      this.leave();
      return { type: 'unary', operator: token.value, operand, position: token.position };
    }
    return this.parsePower();
  }

  /** power := postfix ( '^' unary )? —— 右结合 */
  parsePower() {
    const base = this.parsePostfix();
    const token = this.peek();
    if (token.type === TokenType.OPERATOR && token.value === '^') {
      this.next();
      this.enter();
      const exponent = this.parseUnary();
      this.leave();
      return { type: 'binary', operator: '^', left: base, right: exponent, position: token.position };
    }
    return base;
  }

  /** postfix := primary ( '!' )* */
  parsePostfix() {
    let node = this.parsePrimary();
    for (;;) {
      const token = this.peek();
      if (token.type === TokenType.FACTORIAL) {
        this.next();
        node = { type: 'factorial', operand: node, position: token.position };
        continue;
      }
      return node;
    }
  }

  /** primary := NUMBER | CONSTANT | FUNCTION '(' expression ')' | '(' expression ')' */
  parsePrimary() {
    const token = this.peek();
    switch (token.type) {
      case TokenType.NUMBER:
        this.next();
        return { type: 'number', value: token.value, literal: token.literal, position: token.position };

      case TokenType.CONSTANT:
        this.next();
        return { type: 'number', value: token.value, literal: token.literal, position: token.position };

      case TokenType.FUNCTION: {
        this.next();
        const open = this.peek();
        if (open.type !== TokenType.LPAREN) {
          throw new CalculatorError(
            ErrorCode.UNEXPECTED_TOKEN,
            `函数「${token.literal}」后面需要紧跟左括号，例如 ${token.literal}(0.5)`,
            { position: open.position },
          );
        }
        this.next();
        this.enter();
        const argument = this.parseExpression();
        this.leave();
        const close = this.peek();
        if (close.type !== TokenType.RPAREN) {
          throw new CalculatorError(
            ErrorCode.UNCLOSED_PARENTHESIS,
            `函数「${token.literal}」缺少右括号「)」`,
            { position: open.position },
          );
        }
        this.next();
        return { type: 'call', name: token.value, argument, position: token.position };
      }

      case TokenType.LPAREN: {
        this.next();
        this.enter();
        const inner = this.parseExpression();
        this.leave();
        const close = this.peek();
        if (close.type !== TokenType.RPAREN) {
          throw new CalculatorError(
            ErrorCode.UNCLOSED_PARENTHESIS,
            '左括号「(」缺少与之匹配的右括号',
            { position: token.position },
          );
        }
        this.next();
        return inner;
      }

      case TokenType.OPERATOR:
        throw new CalculatorError(
          ErrorCode.MISSING_OPERAND,
          `运算符「${token.value}」缺少操作数`,
          { position: token.position },
        );

      case TokenType.RPAREN:
        throw new CalculatorError(
          ErrorCode.UNEXPECTED_PARENTHESIS,
          '右括号「)」没有与之匹配的左括号',
          { position: token.position },
        );

      case TokenType.EOF:
      default:
        throw new CalculatorError(
          ErrorCode.MISSING_OPERAND,
          '表达式不完整，末尾缺少操作数',
          { position: token.position },
        );
    }
  }

  // ---------------------------------------------------------------- 辅助方法

  /** @returns {object} 当前 Token（不前进）。 */
  peek() {
    return this.tokens[this.cursor];
  }

  /** 消费当前 Token 并返回它。 @returns {object} 被消费的 Token。 */
  next() {
    const token = this.tokens[this.cursor];
    this.cursor += 1;
    return token;
  }

  /** 进入一层括号/幂运算嵌套，超出深度上限时报错。 @returns {void} */
  enter() {
    this.depth += 1;
    if (this.depth > MAX_NESTING_DEPTH) {
      throw new CalculatorError(
        ErrorCode.EXPRESSION_TOO_COMPLEX,
        `表达式嵌套层级过深（上限 ${MAX_NESTING_DEPTH} 层）`,
      );
    }
  }

  /** 离开一层嵌套。 @returns {void} */
  leave() {
    this.depth -= 1;
  }

  /**
   * 生成便于阅读的 Token 描述。
   * @param {object} token Token。
   * @returns {string} 描述文本。
   */
  describe(token) {
    if (token.type === TokenType.EOF) {
      return '表达式末尾';
    }
    return String(token.literal === undefined ? token.value : token.literal);
  }
}
