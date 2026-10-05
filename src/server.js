/**
 * 服务入口。
 *
 * 启动顺序：初始化数据库 → 创建 HTTP 服务 → 监听端口 → 注册优雅退出。
 *
 * 所有环境相关参数来自 config，本文件不出现任何硬编码的路径或端口。
 */

import { createServer } from 'node:http';

import { createRequestHandler } from './app.js';
import { config } from './config/index.js';
import { closeDatabase, initDatabase } from './model/database.js';
import { logger } from './util/logger.js';

/** 启动 HTTP 服务。 @returns {import('node:http').Server} HTTP 服务实例。 */
export function startServer() {
  initDatabase();
  const server = createServer(createRequestHandler());

  server.listen(config.port, config.host, () => {
    logger.info('计算器后端服务已启动', {
      url: `http://localhost:${config.port}`,
      env: config.env,
      dbPath: config.dbPath,
      staticDir: config.staticDir,
      node: process.version,
    });
    logger.info(`浏览器打开 http://localhost:${config.port} 即可使用计算器`);
  });

  const shutdown = (signal) => {
    logger.info(`收到 ${signal}，正在关闭服务…`);
    server.close(() => {
      closeDatabase();
      logger.info('服务已安全退出');
      process.exit(0);
    });
    // 兜底：5 秒内没有正常关闭就强制退出，避免容器挂死。
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

startServer();
