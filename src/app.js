/**
 * HTTP 应用层：中间件 + 路由表。
 *
 * 采用「手写最小路由」而不是引入 Express，原因有三：
 *   1. 本作业的接口数量有限，手写路由反而更直观，能清楚看到 URL 与处理函数的映射；
 *   2. 不引入运行时依赖，项目在任意 Node 24 环境中零安装启动，
 *      避免了 Render 免费实例上因依赖安装失败导致部署不成功；
 *   3. 便于在博客中解释「一个请求是如何被走到控制器」的这一关键链路。
 *
 * 请求处理流程：
 *   CORS 预检 → 解析 URL → 匹配路由 → 控制器 → 服务层 → 数据层 → 统一响应
 *
 * 参考：Google JavaScript Style Guide。
 */

import { CalculatorError, ErrorCode } from './calculator/errors.js';
import { config } from './config/index.js';
import {
  corsHeaders,
  sendFailure,
} from './util/http.js';
import { serveStatic } from './util/static.js';
import { logger } from './util/logger.js';

import * as calculateController from './controller/calculateController.js';
import * as historyController from './controller/historyController.js';
import * as metaController from './controller/metaController.js';
import * as convertController from './controller/convertController.js';

/**
 * 规范化 URL 路径：去掉末尾斜杠，空路径视为 `/`。
 *
 * @param {string} pathname 原始路径。
 * @returns {string} 规范化路径。
 */
function normalizePath(pathname) {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/**
 * 记录访问日志。
 *
 * @param {import('node:http').IncomingMessage} req 请求对象。
 * @param {import('node:http').ServerResponse} res 响应对象。
 * @param {number} startedAt 开始时间戳（毫秒）。
 * @returns {void}
 */
function logAccess(req, res, startedAt) {
  if (!config.accessLog) {
    return;
  }
  logger.info('http', {
    method: req.method,
    path: req.url,
    status: res.statusCode,
    durationMs: Date.now() - startedAt,
  });
}

/**
 * 处理 `/api/**` 请求。
 *
 * @param {import('node:http').IncomingMessage} req 请求对象。
 * @param {import('node:http').ServerResponse} res 响应对象。
 * @param {URL} url 解析后的 URL。
 * @returns {Promise<boolean>} 是否已匹配到路由。
 */
async function routeApi(req, res, url) {
  const method = req.method || 'GET';
  const path = normalizePath(url.pathname);
  const segments = path.split('/').filter(Boolean); // ['api', ...]

  if (segments[0] !== 'api') {
    return false;
  }

  // /api/health
  if (segments.length === 2 && segments[1] === 'health') {
    if (method !== 'GET') {
      throw new CalculatorError(ErrorCode.METHOD_NOT_ALLOWED, '该接口仅支持 GET 方法', { statusCode: 405 });
    }
    metaController.health(req, res);
    return true;
  }

  // /api/grammar
  if (segments.length === 2 && segments[1] === 'grammar') {
    if (method !== 'GET') {
      throw new CalculatorError(ErrorCode.METHOD_NOT_ALLOWED, '该接口仅支持 GET 方法', { statusCode: 405 });
    }
    metaController.grammar(req, res);
    return true;
  }

  // /api/calculate
  if (segments.length === 2 && segments[1] === 'calculate') {
    if (method !== 'POST') {
      throw new CalculatorError(ErrorCode.METHOD_NOT_ALLOWED, '该接口仅支持 POST 方法', { statusCode: 405 });
    }
    await calculateController.calculate(req, res);
    return true;
  }

  // /api/convert/units
  if (segments.length === 3 && segments[1] === 'convert' && segments[2] === 'units') {
    if (method !== 'GET') {
      throw new CalculatorError(ErrorCode.METHOD_NOT_ALLOWED, '该接口仅支持 GET 方法', { statusCode: 405 });
    }
    convertController.listUnits(req, res);
    return true;
  }

  // /api/convert
  if (segments.length === 2 && segments[1] === 'convert') {
    if (method !== 'POST') {
      throw new CalculatorError(ErrorCode.METHOD_NOT_ALLOWED, '该接口仅支持 POST 方法', { statusCode: 405 });
    }
    await convertController.convert(req, res);
    return true;
  }

  if (segments[1] === 'history') {    // /api/history/stats
    if (segments.length === 3 && segments[2] === 'stats' && method === 'GET') {
      historyController.getStatistics(req, res);
      return true;
    }
    // /api/history/export
    if (segments.length === 3 && segments[2] === 'export' && method === 'GET') {
      historyController.exportHistory(req, res, url);
      return true;
    }
    // /api/history
    if (segments.length === 2) {
      if (method === 'GET') {
        historyController.listHistory(req, res, url);
        return true;
      }
      if (method === 'DELETE') {
        historyController.clearHistory(req, res);
        return true;
      }
    }
    // /api/history/:id/favorite
    if (segments.length === 4 && segments[3] === 'favorite') {
      if (method !== 'PATCH' && method !== 'PUT') {
        throw new CalculatorError(
          ErrorCode.METHOD_NOT_ALLOWED,
          '该接口仅支持 PATCH / PUT 方法',
          { statusCode: 405 },
        );
      }
      await historyController.updateFavorite(req, res, segments[2]);
      return true;
    }
    // /api/history/:id
    if (segments.length === 3) {
      if (method !== 'DELETE') {
        throw new CalculatorError(
          ErrorCode.METHOD_NOT_ALLOWED,
          '该接口仅支持 DELETE 方法',
          { statusCode: 405 },
        );
      }
      historyController.deleteHistory(req, res, segments[2]);
      return true;
    }
  }

  throw new CalculatorError(
    ErrorCode.ROUTE_NOT_FOUND,
    `接口不存在：${method} ${path}`,
    { statusCode: 404 },
  );
}

/**
 * 创建请求处理函数。
 *
 * @returns {(req: import('node:http').IncomingMessage,
 *   res: import('node:http').ServerResponse) => Promise<void>} 处理函数。
 */
export function createRequestHandler() {
  return async function handleRequest(req, res) {
    const startedAt = Date.now();
    res.on('finish', () => logAccess(req, res, startedAt));

    const origin = req.headers.origin;
    for (const [header, value] of Object.entries(corsHeaders(origin))) {
      res.setHeader(header, value);
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    let url;
    try {
      url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    } catch {
      sendFailure(res, new CalculatorError(ErrorCode.VALIDATION_ERROR, '非法的请求地址'));
      return;
    }

    try {
      if (await routeApi(req, res, url)) {
        return;
      }

      // 非 /api 请求：优先返回静态资源，其次回退到单页应用的 index.html。
      if (await serveStatic(req, res, config.staticDir, url.pathname)) {
        return;
      }
      if ((req.method === 'GET' || req.method === 'HEAD')
        && await serveStatic(req, res, config.staticDir, '/')) {
        return;
      }

      sendFailure(res, new CalculatorError(
        ErrorCode.ROUTE_NOT_FOUND,
        `资源不存在：${url.pathname}`,
        { statusCode: 404 },
      ));
    } catch (error) {
      if (error instanceof CalculatorError) {
        sendFailure(res, error);
        return;
      }
      logger.error('未捕获异常', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      sendFailure(res, new CalculatorError(
        ErrorCode.INTERNAL_ERROR,
        '服务器内部错误',
        { statusCode: 500 },
      ));
    }
  };
}
