/**
 * API 集成测试。
 *
 * 在随机端口上真实启动一个 HTTP 服务（数据库使用内存库），
 * 用真实 HTTP 请求验证「计算 → 落库 → 查询 → 删除」的完整闭环，
 * 这也正是助教验收时会走的路径。
 *
 * 运行方式：npm test
 */

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test, { after, before, describe, it } from 'node:test';

// 必须在导入 config 之前设置环境变量，保证使用内存数据库，
// 避免测试污染开发用的 data/calculator.db。
process.env.DB_PATH = ':memory:';
process.env.ACCESS_LOG = 'false';

const { createRequestHandler } = await import('../src/app.js');
const { closeDatabase, initDatabase } = await import('../src/model/database.js');

let baseUrl = '';
let server = null;

before(async () => {
  initDatabase(':memory:');
  server = createServer(createRequestHandler());
  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolvePromise) => server.close(resolvePromise));
  closeDatabase();
});

/**
 * 发起一次 JSON 请求。
 *
 * @param {string} method HTTP 方法。
 * @param {string} path 请求路径。
 * @param {object} [body] 请求体。
 * @returns {Promise<{status: number, body: object}>} 状态码与响应体。
 */
async function request(method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text === '' ? {} : JSON.parse(text) };
}

describe('GET /api/health', () => {
  it('返回服务健康状态', async () => {
    const { status, body } = await request('GET', '/api/health');
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'UP');
  });
});

describe('POST /api/calculate', () => {
  it('由后端完成计算，返回 201 并落库', async () => {
    const { status, body } = await request('POST', '/api/calculate', { expression: '(1+2)*3' });
    assert.equal(status, 201);
    assert.equal(body.success, true);
    assert.equal(body.data.result, 9);
    assert.equal(body.data.expression, '(1+2)*3');
    assert.equal(typeof body.data.id, 'number');
    assert.equal(typeof body.data.createdAt, 'string');
  });

  it('除零返回 400 与明确的错误码', async () => {
    const { status, body } = await request('POST', '/api/calculate', { expression: '1/0' });
    assert.equal(status, 400);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'DIVISION_BY_ZERO');
  });

  it('非法表达式返回 400', async () => {
    const { status, body } = await request('POST', '/api/calculate', { expression: '1++' });
    assert.equal(status, 400);
    assert.equal(body.success, false);
  });

  it('缺少 expression 参数返回 400', async () => {
    const { status, body } = await request('POST', '/api/calculate', {});
    assert.equal(status, 400);
    assert.equal(body.error.code, 'EMPTY_EXPRESSION');
  });

  it('错误的 HTTP 方法返回 405', async () => {
    const { status } = await request('GET', '/api/calculate');
    assert.equal(status, 405);
  });
});

describe('GET /api/history', () => {
  it('计算记录可以从数据库读回（验证持久化而非前端缓存）', async () => {
    await request('POST', '/api/calculate', { expression: '12+8' });
    await request('POST', '/api/calculate', { expression: '5*8' });
    const { status, body } = await request('GET', '/api/history?page=1&pageSize=10');
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.ok(body.data.total >= 3, '至少包含此前插入的记录');
    assert.ok(body.data.items.some((item) => item.expression === '12+8'));
    assert.ok(body.data.items.some((item) => item.result === 20));
  });

  it('支持关键词检索', async () => {
    const { body } = await request('GET', '/api/history?keyword=12%2B8');
    assert.ok(body.data.items.every((item) => item.expression.includes('12+8')));
  });

  it('分页参数非法返回 400', async () => {
    const { status } = await request('GET', '/api/history?page=0');
    assert.equal(status, 400);
  });
});

describe('DELETE /api/history/:id', () => {
  it('删除指定记录后数据库中不再存在', async () => {
    const created = await request('POST', '/api/calculate', { expression: '8-3*2' });
    const id = created.body.data.id;

    const removed = await request('DELETE', `/api/history/${id}`);
    assert.equal(removed.status, 200);
    assert.equal(removed.body.data.id, id);

    const list = await request('GET', '/api/history?page=1&pageSize=50');
    assert.equal(list.body.data.items.some((item) => item.id === id), false);
  });

  it('删除不存在的记录返回 404', async () => {
    const { status, body } = await request('DELETE', '/api/history/999999');
    assert.equal(status, 404);
    assert.equal(body.error.code, 'HISTORY_NOT_FOUND');
  });
});

describe('PATCH /api/history/:id/favorite', () => {
  it('可以收藏与取消收藏', async () => {
    const created = await request('POST', '/api/calculate', { expression: '2^10' });
    const id = created.body.data.id;

    const starred = await request('PATCH', `/api/history/${id}/favorite`, { isFavorite: true });
    assert.equal(starred.body.data.isFavorite, true);

    const unstarred = await request('PATCH', `/api/history/${id}/favorite`, { isFavorite: false });
    assert.equal(unstarred.body.data.isFavorite, false);
  });
});

describe('GET /api/history/stats 与 /api/history/export', () => {
  it('统计接口返回聚合数据', async () => {
    const { status, body } = await request('GET', '/api/history/stats');
    assert.equal(status, 200);
    assert.ok(body.data.total >= 1);
    assert.equal(Array.isArray(body.data.dailyCounts), true);
  });

  it('导出接口返回 CSV', async () => {
    const response = await fetch(`${baseUrl}/api/history/export`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /text\/csv/);
    const text = await response.text();
    assert.match(text, /ID,表达式/);
  });
});

describe('GET /api/grammar', () => {
  it('返回后端支持的运算符与函数清单', async () => {
    const { status, body } = await request('GET', '/api/grammar');
    assert.equal(status, 200);
    assert.ok(body.data.operators.length >= 4);
    assert.ok(body.data.functions.length > 0);
  });
});

describe('未知接口', () => {
  it('返回 404 JSON 而不是 HTML', async () => {
    const { status, body } = await request('GET', '/api/not-exist');
    assert.equal(status, 404);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'ROUTE_NOT_FOUND');
  });
});
