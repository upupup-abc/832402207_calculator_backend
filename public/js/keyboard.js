/**
 * 全局快捷键（附加功能）。
 *
 * 规则刻意做得保守：只有当焦点不在输入框/下拉框时才接管数字与运算符按键，
 * 保证「打字」与「按键计算」两种交互不会互相干扰。
 */

/**
 * 判断事件目标是否为可编辑元素。
 *
 * @param {EventTarget|null} target 事件目标。
 * @returns {boolean} 是否可编辑。
 */
function isEditable(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * 注册全局快捷键。
 *
 * @param {{calculator: {focus: () => void, calculate: () => Promise<void>,
 *   clear: () => void}, onFocusSearch: () => void,
 *   onToggleTheme: () => void}} handlers 回调集合。
 * @returns {void}
 */
export function registerShortcuts(handlers) {
  // 允许直接输入并追加到表达式的字符。
  const printable = new Set('0123456789.+-*/()^%!');

  document.addEventListener('keydown', (event) => {
    // Ctrl/Cmd + D：切换主题。
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      handlers.onToggleTheme();
      return;
    }

    if (event.key === '/' && !isEditable(event.target)) {
      event.preventDefault();
      handlers.onFocusSearch();
      return;
    }

    if (event.key === 'Escape') {
      handlers.calculator.clear();
      return;
    }

    if (isEditable(event.target)) {
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      handlers.calculator.calculate();
      return;
    }

    if (event.key === 'Backspace') {
      event.preventDefault();
      // 复用输入框自身的退格逻辑：先聚焦再派发一次删除。
      handlers.calculator.focus();
      const input = document.activeElement;
      if (input instanceof HTMLInputElement) {
        const start = input.selectionStart === null ? input.value.length : input.selectionStart;
        if (start > 0) {
          input.value = input.value.slice(0, start - 1) + input.value.slice(start);
          input.setSelectionRange(start - 1, start - 1);
        }
      }
      return;
    }

    if (printable.has(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      handlers.calculator.focus();
      const input = document.activeElement;
      if (input instanceof HTMLInputElement) {
        const caret = input.selectionStart === null ? input.value.length : input.selectionStart;
        input.value = input.value.slice(0, caret) + event.key + input.value.slice(caret);
        input.setSelectionRange(caret + 1, caret + 1);
      }
    }
  });
}
