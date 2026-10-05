/**
 * 计算引擎单元测试。
 *
 * 覆盖作业「Feature 1 基本计算」与「Feature 2 复合表达式计算」中列出的
 * 全部评分点：四则运算、运算符优先级、括号、一元正负号、小数、
 * 非法表达式处理、除零处理。
 *
 * 运行方式：npm test（等价于 node --test test/）
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test, { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { calculate, describeGrammar, formatResult } from '../src/service/calculatorService.js';
import { ErrorCode } from '../src/calculator/errors.js';
import { FUNCTIONS } from '../src/calculator/tokenizer.js';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 断言表达式计算结果。
 *
 * @param {string} expression 表达式。
 * @param {number} expected 期望结果。
 * @returns {void}
 */
function expectResult(expression, expected) {
  const outcome = calculate(expression);
  assert.equal(outcome.result, expected, `${expression} 应等于 ${expected}`);
}

/**
 * 断言表达式抛出指定错误码。
 *
 * @param {string} expression 表达式。
 * @param {string} code 期望错误码。
 * @returns {void}
 */
function expectError(expression, code) {
  assert.throws(
    () => calculate(expression),
    (error) => error.code === code,
    `${expression} 应抛出 ${code}`,
  );
}

describe('Feature 1：基本四则运算', () => {
  it('支持加法', () => expectResult('12+8', 20));
  it('支持减法', () => expectResult('12-8', 4));
  it('支持乘法', () => expectResult('12*8', 96));
  it('支持除法', () => expectResult('12/8', 1.5));
  it('支持全角乘除号 × ÷', () => {
    expectResult('12×8', 96);
    expectResult('12÷8', 1.5);
  });
  it('支持中文输入法下的全角数字与符号', () => {
    expectResult('１２＋８', 20);
    expectResult('１．５×２', 3);
    expectResult('（１＋２）×３', 9);
  });
  it('支持负数结果', () => expectResult('8-20', -12));
});

describe('Feature 2：复合表达式', () => {
  it('遵守乘除优先于加减', () => {
    expectResult('1+2*3', 7);
    expectResult('8-3*2', 2);
    expectResult('10/2+7', 12);
  });
  it('支持括号改变优先级', () => {
    expectResult('(1+2)*3', 9);
    expectResult('(2+3)*4', 20);
    expectResult('2*(3+(4-1))', 12);
  });
  it('支持一元正负号', () => {
    expectResult('-5+8', 3);
    expectResult('3*-2', -6);
    expectResult('-(-5)', 5);
    expectResult('+7', 7);
  });
  it('支持小数与科学计数法', () => {
    expectResult('0.1+0.2', 0.3);
    expectResult('3.14*2', 6.28);
    expectResult('.5+.25', 0.75);
    expectResult('1.5e-3*1000', 1.5);
  });
  it('幂运算右结合，且可与一元负号组合', () => {
    expectResult('2^3^2', 512);
    expectResult('2^-3', 0.125);
    expectResult('-2^2', -4);
  });
  it('支持阶乘', () => {
    expectResult('5!', 120);
    expectResult('3!+2', 8);
    expectResult('0!', 1);
  });
  it('支持取余', () => expectResult('10%3', 1));
  it('支持隐式乘法', () => {
    expectResult('2(3+4)', 14);
    expectResult('(1+2)(3+4)', 21);
    expectResult('3pi', Number((3 * Math.PI).toPrecision(12)));
  });
  it('支持数学函数与常量', () => {
    expectResult('sqrt(144)', 12);
    expectResult('log(1000)', 3);
    expectResult('ln(e)', 1);
    expectResult('log2(1024)', 10);
    expectResult('abs(-3.5)', 3.5);
    expectResult('floor(2.9)', 2);
    expectResult('round(2.5)', 3);
    expectResult('cbrt(27)', 3);
  });
  it('消除浮点噪声：sin(pi) 应为 0', () => expectResult('sin(pi)', 0));
  it('普通极小值不被误判为 0', () => {
    const outcome = calculate('1e-13');
    assert.equal(outcome.result, 1e-13);
  });
  it('返回归一化后的表达式', () => {
    const outcome = calculate(' 12 × 8 ');
    assert.equal(outcome.normalizedExpression, '12*8');
    assert.equal(outcome.result, 96);
  });
});

describe('异常处理', () => {
  it('除数为 0', () => {
    expectError('1/0', ErrorCode.DIVISION_BY_ZERO);
    expectError('5/(3-3)', ErrorCode.DIVISION_BY_ZERO);
  });
  it('取余除数为 0', () => expectError('5%0', ErrorCode.MODULO_BY_ZERO));
  it('空表达式', () => {
    expectError('', ErrorCode.EMPTY_EXPRESSION);
    expectError('   ', ErrorCode.EMPTY_EXPRESSION);
  });
  it('非法字符', () => expectError('1+@', ErrorCode.INVALID_CHARACTER));
  it('未知标识符', () => expectError('foo(1)', ErrorCode.UNKNOWN_IDENTIFIER));
  it('括号不匹配', () => {
    expectError('(1+2', ErrorCode.UNCLOSED_PARENTHESIS);
    expectError('1+2)', ErrorCode.UNEXPECTED_PARENTHESIS);
  });
  it('缺少操作数', () => {
    expectError('1+', ErrorCode.MISSING_OPERAND);
    expectError('*3', ErrorCode.MISSING_OPERAND);
  });
  it('函数定义域错误', () => {
    expectError('sqrt(-1)', ErrorCode.INVALID_FUNCTION_ARGUMENT);
    expectError('ln(0)', ErrorCode.INVALID_FUNCTION_ARGUMENT);
    expectError('asin(2)', ErrorCode.INVALID_FUNCTION_ARGUMENT);
    expectError('1.5!', ErrorCode.INVALID_FUNCTION_ARGUMENT);
  });
  it('阶乘溢出', () => expectError('200!', ErrorCode.NUMBER_OVERFLOW));
  it('表达式过长', () => {
    expectError('1'.repeat(201), ErrorCode.EXPRESSION_TOO_LONG);
  });
  it('嵌套过深', () => {
    expectError(`${'('.repeat(80)}1${')'.repeat(80)}`, ErrorCode.EXPRESSION_TOO_COMPLEX);
  });
});

describe('结果格式化', () => {
  it('整数不带小数点', () => assert.equal(formatResult(20), '20'));
  it('小数去掉末尾多余的 0', () => assert.equal(formatResult(1.5), '1.5'));
  it('极小值使用科学计数法', () => assert.equal(formatResult(1.2246467991473532e-16), '1.2246468e-16'));
});

describe('安全合规：禁止 eval / exec 等任意代码执行', () => {
  const sourceFiles = [
    'src/calculator/tokenizer.js',
    'src/calculator/parser.js',
    'src/calculator/evaluator.js',
    'src/service/calculatorService.js',
  ];

  it('计算链路源码中不出现 eval / Function 构造器 / child_process', () => {
    for (const relative of sourceFiles) {
      const source = readFileSync(resolve(PROJECT_ROOT, relative), 'utf8');
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      assert.equal(/\beval\s*\(/.test(code), false, `${relative} 不应包含 eval(`);
      assert.equal(/new\s+Function\s*\(/.test(code), false, `${relative} 不应包含 new Function(`);
      assert.equal(
        /child_process|vm\.runIn/.test(code),
        false,
        `${relative} 不应引用动态执行相关模块`,
      );
    }
  });

  it('恶意输入不会被当成代码执行', () => {
    expectError('process.exit(1)', ErrorCode.UNKNOWN_IDENTIFIER);
    expectError('1;console.log(1)', ErrorCode.INVALID_CHARACTER);
  });
});

describe('能力清单一致性：/api/grammar 必须与真实支持的函数完全对应', () => {
  // 背景：GET /api/grammar 号称是「能力清单的唯一事实来源」，
  // 所以它列出的函数必须与 tokenizer 里 FUNCTIONS 集合、evaluator 里
  // FUNCTION_TABLE 三者严格一致。曾经因为漏登记 log10 而出现
  // 「能算但文档里没有」的不一致，这里用测试把三者钉死。
  const advertised = describeGrammar().functions.map((item) => item.name);

  it('grammar 列出的函数数量等于 tokenizer 的 FUNCTIONS 数量', () => {
    assert.equal(
      advertised.length,
      FUNCTIONS.size,
      `grammar 列了 ${advertised.length} 个，FUNCTIONS 有 ${FUNCTIONS.size} 个`,
    );
  });

  it('tokenizer 支持的每个函数都在 grammar 里被列出', () => {
    for (const name of FUNCTIONS) {
      assert.ok(advertised.includes(name), `函数 ${name} 能算，但没有被 /api/grammar 列出`);
    }
  });

  it('grammar 里列出的每个函数都真的能算出结果', () => {
    for (const name of advertised) {
      // 参数 1 对所有已登记函数都在定义域内
      const outcome = calculate(`${name}(1)`);
      assert.equal(typeof outcome.result, 'number', `${name}(1) 应当返回数值`);
    }
  });

  it('grammar 里不出现重复登记', () => {
    assert.equal(new Set(advertised).size, advertised.length, 'grammar 里有重复的函数名');
  });
});
