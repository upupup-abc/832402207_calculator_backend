/**
 * 计算器视图。
 *
 * 职责边界（严格对应作业要求）：
 *   - 负责表达式输入、按键交互、结果与错误展示；
 *   - 不包含任何数值计算，所有结果一律来自 POST /api/calculate；
 *   - 后端不可用时只提示错误，绝不「本地算一个结果糊弄过去」。
 */

import { api, ApiError } from './api.js';
import { formatNumber } from './format.js';
import { qs, qsa } from './dom.js';
import { showToast } from './toast.js';

/**
 * 创建计算器视图。
 *
 * @param {{onCalculated: (record: object) => void}} hooks 计算成功后的回调。
 * @returns {{getExpression: () => string, setExpression: (text: string) => void,
 *   clear: () => void, focus: () => void, calculate: () => Promise<void>}} 视图接口。
 */
export function createCalculator(hooks) {
  const screen = qs('#screen');
  const input = /** @type {HTMLInputElement} */ (qs('#expressionInput'));
  const resultBox = qs('#resultBox');
  const resultValue = qs('#resultValue');
  const message = qs('#screenMessage');
  const messageText = qs('.screen__messageText', screen);
  const equalsKey = qs('.key--equals');
  const copyResultButton = qs('#copyResult');
  const tip = qs('#screenTip');

  /** 最近一次后端返回的结果文本，用于「复制结果」。 */
  let lastResultText = '';

  /**
   * 设置状态行文案。
   *
   * @param {string} text 文案。
   * @param {'idle'|'success'|'error'} state 状态。
   * @returns {void}
   */
  function setMessage(text, state) {
    messageText.textContent = text;
    message.classList.toggle('is-error', state === 'error');
    message.classList.toggle('is-success', state === 'success');
    screen.classList.toggle('is-error', state === 'error');
    screen.classList.toggle('is-success', state === 'success');
  }

  /**
   * 展示后端返回的结果。
   *
   * @param {number} value 数值结果。
   * @returns {void}
   */
  function renderResult(value) {
    resultValue.textContent = formatNumber(value, { grouping: true });
    resultValue.classList.remove('is-rolled');
    // 触发重排以便重新播放动画。
    void resultValue.offsetWidth;
    resultValue.classList.add('is-rolled');
  }

  /**
   * 在光标处插入文本。
   *
   * @param {string} text 待插入文本。
   * @returns {void}
   */
  function insert(text) {
    const start = input.selectionStart === null ? input.value.length : input.selectionStart;
    const end = input.selectionEnd === null ? input.value.length : input.selectionEnd;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    const caret = start + text.length;
    input.setSelectionRange(caret, caret);
    input.focus();
  }

  /**
   * 退格：删除光标前一个字符，或删除选区。
   * @returns {void}
   */
  function backspace() {
    const start = input.selectionStart === null ? input.value.length : input.selectionStart;
    const end = input.selectionEnd === null ? input.value.length : input.selectionEnd;
    if (start !== end) {
      input.value = input.value.slice(0, start) + input.value.slice(end);
      input.setSelectionRange(start, start);
    } else if (start > 0) {
      input.value = input.value.slice(0, start - 1) + input.value.slice(start);
      input.setSelectionRange(start - 1, start - 1);
    }
    input.focus();
  }

  /**
   * 取反：纯文本层面的正负号切换，不做任何求值。
   * @returns {void}
   */
  function negate() {
    const text = input.value.trim();
    if (text === '') {
      insert('-');
      return;
    }
    input.value = text.startsWith('-') ? text.slice(1) : `-${text}`;
    input.focus();
  }

  /**
   * 清空输入与结果。
   * @returns {void}
   */
  function clear() {
    input.value = '';
    resultValue.textContent = '0';
    lastResultText = '';
    setMessage('等待输入…', 'idle');
    input.focus();
  }

  /**
   * 提交计算请求。
   * @returns {Promise<void>} 无返回值。
   */
  async function calculate() {
    const expression = input.value.trim();
    if (expression === '') {
      setMessage('请先输入表达式', 'error');
      showToast({ type: 'error', title: '表达式为空', text: '例如输入 12+8 或 (1+2)*3' });
      input.focus();
      return;
    }

    equalsKey.classList.add('is-loading');
    setMessage('正在请求后端计算…', 'idle');

    try {
      const record = await api.calculate(expression);
      lastResultText = record.resultText === undefined
        ? String(record.result)
        : record.resultText;
      renderResult(record.result);
      setMessage(
        `已保存到后端数据库 · 记录 #${record.id} · 后端返回 ${record.normalizedExpression}`,
        'success',
      );
      hooks.onCalculated(record);
    } catch (error) {
      const apiError = error instanceof ApiError
        ? error
        : new ApiError('计算失败，请稍后重试');
      resultValue.textContent = '—';
      lastResultText = '';
      setMessage(apiError.isConnectionError
        ? '后端服务不可用，无法得到计算结果'
        : apiError.message, 'error');
      showToast({
        type: 'error',
        title: apiError.isConnectionError ? '无法连接后端' : '计算失败',
        text: apiError.isConnectionError
          ? '请确认后端服务已启动，前端本身不会进行任何计算。'
          : `${apiError.message}${apiError.code ? `（${apiError.code}）` : ''}`,
      });
    } finally {
      equalsKey.classList.remove('is-loading');
    }
  }

  // ------------------------------------------------------------ 事件绑定

  qsa('[data-insert]').forEach((button) => {
    button.addEventListener('click', () => insert(button.dataset.insert || ''));
  });

  qsa('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      switch (button.dataset.action) {
        case 'clear':
          clear();
          break;
        case 'backspace':
          backspace();
          break;
        case 'negate':
          negate();
          break;
        case 'calculate':
          calculate();
          break;
        default:
          break;
      }
    });
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      calculate();
    }
  });

  input.addEventListener('input', () => {
    if (screen.classList.contains('is-error')) {
      setMessage('等待输入…', 'idle');
    }
  });

  copyResultButton.addEventListener('click', async () => {
    const text = lastResultText === '' ? resultValue.textContent || '' : lastResultText;
    if (text === '' || text === '0' || text === '—') {
      showToast({ type: 'info', title: '暂无可复制的结果' });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast({ type: 'success', title: '结果已复制到剪贴板', text });
    } catch {
      showToast({ type: 'error', title: '复制失败', text: '浏览器拒绝了剪贴板访问权限' });
    }
  });

  return {
    getExpression: () => input.value,
    setExpression: (text) => {
      input.value = text;
      input.focus();
      const caret = input.value.length;
      input.setSelectionRange(caret, caret);
    },
    clear,
    focus: () => input.focus(),
    calculate,
    /** 供外部展示语法示例。 */
    setTip: (text) => {
      tip.textContent = text;
    },
    /** 供外部渲染结果（例如点击历史记录后立刻展示已知结果）。 */
    renderResult,
    setMessage,
  };
}
