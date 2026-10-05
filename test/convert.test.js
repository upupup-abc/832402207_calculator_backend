/**
 * 单位换算接口测试（附加功能）。
 */

import assert from 'node:assert/strict';
import test, { describe, it } from 'node:test';

import { convert, describeUnits } from '../src/service/convertService.js';
import { ErrorCode } from '../src/calculator/errors.js';

describe('单位换算', () => {
  it('长度：1 千米 = 1000 米', () => {
    const outcome = convert({ category: 'length', from: 'km', to: 'm', value: 1 });
    assert.equal(outcome.result, 1000);
  });

  it('长度：1 英寸 = 2.54 厘米', () => {
    const outcome = convert({ category: 'length', from: 'in', to: 'cm', value: 1 });
    assert.equal(outcome.result, 2.54);
  });

  it('质量：1 磅 ≈ 0.45359237 千克', () => {
    const outcome = convert({ category: 'mass', from: 'lb', to: 'kg', value: 1 });
    assert.equal(outcome.result, 0.45359237);
  });

  it('温度：100°C = 212°F', () => {
    const outcome = convert({ category: 'temperature', from: 'C', to: 'F', value: 100 });
    assert.equal(outcome.result, 212);
  });

  it('温度：0°C = 273.15K', () => {
    const outcome = convert({ category: 'temperature', from: 'C', to: 'K', value: 0 });
    assert.equal(outcome.result, 273.15);
  });

  it('数据存储：1 GiB = 1073.741824 MB', () => {
    const outcome = convert({ category: 'data', from: 'GiB', to: 'MB', value: 1 });
    assert.equal(outcome.result, 1073.741824);
  });

  it('相同的源单位与目标单位返回原值', () => {
    const outcome = convert({ category: 'time', from: 'h', to: 'h', value: 3.5 });
    assert.equal(outcome.result, 3.5);
  });

  it('生成可读的换算描述', () => {
    const outcome = convert({ category: 'length', from: 'km', to: 'm', value: 1 });
    assert.match(outcome.formatted, /1 千米/);
    assert.match(outcome.formatted, /1,000/);
  });

  it('非法类别 / 单位 / 数值均抛出 VALIDATION_ERROR', () => {
    assert.throws(
      () => convert({ category: 'nope', from: 'a', to: 'b', value: 1 }),
      (error) => error.code === ErrorCode.VALIDATION_ERROR,
    );
    assert.throws(
      () => convert({ category: 'length', from: 'km', to: 'nope', value: 1 }),
      (error) => error.code === ErrorCode.VALIDATION_ERROR,
    );
    assert.throws(
      () => convert({ category: 'length', from: 'km', to: 'm', value: 'abc' }),
      (error) => error.code === ErrorCode.VALIDATION_ERROR,
    );
  });

  it('单位清单可供前端渲染', () => {
    const categories = describeUnits();
    assert.ok(categories.length >= 6);
    const length = categories.find((item) => item.category === 'length');
    assert.ok(length.units.some((unit) => unit.code === 'km'));
  });
});
