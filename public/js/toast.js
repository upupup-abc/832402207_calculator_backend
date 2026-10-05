/**
 * 轻量提示气泡。
 *
 * 所有来自后端的错误（除零、非法表达式、连接失败…）都通过这里反馈给用户，
 * 这是作业「前端应显示后端返回的错误信息」要求的落点。
 */

import { h, qs } from './dom.js';

/** 同时最多显示的提示数量，超出时移除最早的。 */
const MAX_TOASTS = 4;

/** 默认停留时间（毫秒）。 */
const DEFAULT_DURATION = 3200;

/**
 * 获取提示容器。
 * @returns {HTMLElement} 容器元素。
 */
function container() {
  return qs('#toasts');
}

/**
 * 显示一条提示。
 *
 * @param {{type?: 'success'|'error'|'info', title: string, text?: string,
 *   duration?: number}} options 提示内容。
 * @returns {void}
 */
export function showToast(options) {
  const type = options.type || 'info';
  const duration = options.duration === undefined ? DEFAULT_DURATION : options.duration;
  const glyph = type === 'success' ? '✓' : (type === 'error' ? '!' : 'i');

  const node = h('div', {
    className: `toast toast--${type}`,
    attrs: { role: type === 'error' ? 'alert' : 'status' },
    children: [
      h('span', { className: 'toast__icon', text: glyph }),
      h('div', {
        className: 'toast__body',
        children: [
          h('p', { className: 'toast__title', text: options.title }),
          options.text === undefined
            ? null
            : h('p', { className: 'toast__text', text: options.text }),
        ].filter(Boolean),
      }),
    ],
  });

  const host = container();
  host.append(node);
  while (host.children.length > MAX_TOASTS) {
    host.firstElementChild.remove();
  }

  const dismiss = () => {
    node.classList.add('is-leaving');
    node.addEventListener('animationend', () => node.remove(), { once: true });
    // 兜底：动画被 prefers-reduced-motion 关闭时也要移除。
    setTimeout(() => node.remove(), 400);
  };

  node.addEventListener('click', dismiss);
  if (duration > 0) {
    setTimeout(dismiss, duration);
  }
}
