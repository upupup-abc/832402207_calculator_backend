/**
 * 静态资源托管。
 *
 * 用途：把前端构建产物（或前端仓库 src/ 的副本）与 API 放在同一个域名下，
 * 这样助教只需访问一个链接即可完成评测，同时前端仍然是通过 HTTP/JSON
 * 调用后端接口的独立单页应用，前后端分离的架构没有被破坏。
 *
 * 安全要点：必须防御路径穿越（../ 读取仓库外文件），
 * 这里通过 path.resolve 之后校验前缀来实现。
 */

import { createReadStream, promises as fs } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

/** 扩展名 → MIME 类型映射。 */
const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
});

/** 不需要缓存的开发态资源。 */
const NO_CACHE_EXTENSIONS = new Set(['.html']);

/**
 * 判断目标路径是否位于根目录内。
 * @param {string} rootDir 根目录绝对路径。
 * @param {string} targetPath 目标绝对路径。
 * @returns {boolean} 是否安全。
 */
function isInside(rootDir, targetPath) {
  const root = resolve(rootDir);
  return targetPath === root || targetPath.startsWith(root + sep);
}

/**
 * 尝试把 URL 路径映射为磁盘上的静态文件。
 *
 * @param {string} rootDir 静态根目录。
 * @param {string} urlPath 已解码的 URL 路径（不含查询串）。
 * @returns {Promise<string|null>} 存在的文件绝对路径，不存在返回 null。
 */
async function resolveStaticFile(rootDir, urlPath) {
  const relative = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  const candidates = relative === '' || relative === '.'
    ? [join(rootDir, 'index.html')]
    : [join(rootDir, relative), join(rootDir, relative, 'index.html')];

  for (const candidate of candidates) {
    const absolute = resolve(candidate);
    if (!isInside(rootDir, absolute)) {
      continue;
    }
    try {
      const stat = await fs.stat(absolute);
      if (stat.isFile()) {
        return absolute;
      }
    } catch {
      // 文件不存在，继续尝试下一个候选。
    }
  }
  return null;
}

/**
 * 处理静态资源请求。
 *
 * @param {import('node:http').IncomingMessage} req 请求对象。
 * @param {import('node:http').ServerResponse} res 响应对象。
 * @param {string} rootDir 静态根目录。
 * @param {string} urlPath 已解码的 URL 路径。
 * @returns {Promise<boolean>} 是否已经处理该请求。
 */
export async function serveStatic(req, res, rootDir, urlPath) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return false;
  }
  const filePath = await resolveStaticFile(rootDir, urlPath);
  if (filePath === null) {
    return false;
  }
  const extension = extname(filePath).toLowerCase();
  const headers = {
    'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
    'Cache-Control': NO_CACHE_EXTENSIONS.has(extension)
      ? 'no-cache'
      : 'public, max-age=3600',
  };
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  createReadStream(filePath).pipe(res);
  return true;
}

export { MIME_TYPES };
