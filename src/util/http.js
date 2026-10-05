/**
 * HTTP 工具函数：统一响应体、请求体解析、CORS 头。
 *
 * 设计要点：把「响应格式」收敛到一处，保证所有接口返回同一种信封结构，
 * 前端只需写一次解包逻辑，也便于助教按统一规则调试。
 *
 * 统一成功响应：
 *   { "success": true,  "data": { ... }, "message": "ok" }
 * 统一失败响应：
 *   { "success": false, "error": { "code": "...", "message": "...", "position": null } }
 */

import { CalculatorError, ErrorCode } from '../calculator/errors.js';
import { config } from '../config/index.js';

/**
 * 生成 CORS 响应头。
 * @param {string} requestOrigin 请求的 Origin 头。
 * @returns {Record<string, string>} 响应头集合。
 */
export function corsHeaders(requestOrigin) {
  const { corsOrigin } = config;
  let allowOrigin = '*';
  if (Array.isArray(corsOrigin)) {
    allowOrigin = corsOrigin.includes(requestOrigin) ? requestOrigin : corsOrigin[0];
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Accept',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/**
 * 发送 JSON 响应。
 * @param {import('node:http').ServerResponse} res 响应对象。
 * @param {number} status HTTP 状态码。
 * @param {object} body 响应体。
 * @returns {void}
 */
export function sendJson(res, status, body) {
  const payload = Buffer.from(`${JSON.stringify(body)}\n`, 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': payload.byteLength,
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

/**
 * 发送成功响应。
 * @param {import('node:http').ServerResponse} res 响应对象。
 * @param {object} data 业务数据。
 * @param {number} [status] HTTP 状态码，默认 200。
 * @param {string} [message] 提示信息。
 * @returns {void}
 */
export function sendSuccess(res, data, status = 200, message = 'ok') {
  sendJson(res, status, { success: true, message, data });
}

/**
 * 发送失败响应。
 * @param {import('node:http').ServerResponse} res 响应对象。
 * @param {CalculatorError|Error} error 错误对象。
 * @returns {void}
 */
export function sendFailure(res, error) {
  if (error instanceof CalculatorError) {
    sendJson(res, error.statusCode, {
      success: false,
      message: error.message,
      error: error.toJSON(),
    });
    return;
  }
  sendJson(res, 500, {
    success: false,
    message: '服务器内部错误',
    error: { code: ErrorCode.INTERNAL_ERROR, message: '服务器内部错误', position: null },
  });
}

/**
 * 读取并解析 JSON 请求体。
 *
 * @param {import('node:http').IncomingMessage} req 请求对象。
 * @param {number} [maxBytes] 体积上限。
 * @returns {Promise<object>} 解析后的对象；空体返回 {}。
 * @throws {CalculatorError} 体积超限或 JSON 非法时抛出。
 */
export function readJsonBody(req, maxBytes = config.maxBodyBytes) {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        rejectPromise(new CalculatorError(
          ErrorCode.INVALID_NUMBER,
          `请求体过大，上限为 ${maxBytes} 字节`,
          { statusCode: 413 },
        ));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (text === '') {
        resolvePromise({});
        return;
      }
      try {
        const parsed = JSON.parse(text);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          rejectPromise(new CalculatorError(
            ErrorCode.UNEXPECTED_TOKEN,
            '请求体必须是 JSON 对象',
          ));
          return;
        }
        resolvePromise(parsed);
      } catch {
        rejectPromise(new CalculatorError(
          ErrorCode.UNEXPECTED_TOKEN,
          '请求体不是合法的 JSON',
        ));
      }
    });
    req.on('error', () => {
      rejectPromise(new CalculatorError(
        ErrorCode.INTERNAL_ERROR,
        '读取请求体失败',
        { statusCode: 500 },
      ));
    });
  });
}
