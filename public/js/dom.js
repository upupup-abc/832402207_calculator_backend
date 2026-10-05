/**
 * 通用 DOM 辅助函数。
 *
 * 只做三件事：查询、创建元素、事件委托。
 * 保持极简是刻意的 —— 前端只负责「展示与交互」，不需要任何计算能力。
 */

/**
 * 查询单个元素。
 * @param {string} selector CSS 选择器。
 * @param {ParentNode} [scope] 查询范围，默认 document。
 * @returns {HTMLElement} 匹配到的元素。
 */
export function qs(selector, scope = document) {
  const element = scope.querySelector(selector);
  if (element === null) {
    throw new Error(`找不到元素：${selector}`);
  }
  return /** @type {HTMLElement} */ (element);
}

/**
 * 查询全部元素。
 * @param {string} selector CSS 选择器。
 * @param {ParentNode} [scope] 查询范围。
 * @returns {HTMLElement[]} 元素数组。
 */
export function qsa(selector, scope = document) {
  return Array.from(scope.querySelectorAll(selector));
}

/**
 * 创建元素。
 *
 * 使用 textContent 而非 innerHTML 赋值文本，从根上杜绝
 * 「历史记录里的表达式被当成 HTML 执行」这类 XSS 风险。
 *
 * @param {string} tag 标签名。
 * @param {object} [options] 配置项。
 * @param {string} [options.className] class 名。
 * @param {string} [options.text] 文本内容。
 * @param {Record<string, string>} [options.attrs] 属性集合。
 * @param {Array<Node>} [options.children] 子节点。
 * @returns {HTMLElement} 创建的元素。
 */
export function h(tag, options = {}) {
  const element = document.createElement(tag);
  if (options.className !== undefined) {
    element.className = options.className;
  }
  if (options.text !== undefined) {
    element.textContent = options.text;
  }
  for (const [name, value] of Object.entries(options.attrs || {})) {
    element.setAttribute(name, value);
  }
  for (const child of options.children || []) {
    element.append(child);
  }
  return element;
}

/**
 * 在元素内部生成一个内联 SVG 图标。
 *
 * @param {string} pathData SVG 的 path d 属性。
 * @param {number} [size] 边长。
 * @returns {SVGElement} SVG 元素。
 */
export function icon(pathData, size = 15) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  svg.append(path);
  return svg;
}
