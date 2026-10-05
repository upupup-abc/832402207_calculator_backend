/**
 * 单位换算面板视图（附加功能）。
 *
 * 单位清单与换算结果都来自后端：
 *   GET  /api/convert/units
 *   POST /api/convert
 */

import { api, ApiError } from './api.js';
import { formatNumber } from './format.js';
import { h, qs } from './dom.js';
import { showToast } from './toast.js';

/**
 * 创建单位换算视图。
 *
 * @returns {{initialize: () => Promise<void>}} 视图接口。
 */
export function createConverter() {
  const categorySelect = /** @type {HTMLSelectElement} */ (qs('#convertCategory'));
  const fromSelect = /** @type {HTMLSelectElement} */ (qs('#convertFromUnit'));
  const toSelect = /** @type {HTMLSelectElement} */ (qs('#convertToUnit'));
  const valueInput = /** @type {HTMLInputElement} */ (qs('#convertValue'));
  const swapButton = qs('#convertSwap');
  const convertButton = qs('#convertButton');
  const resultOutput = qs('#convertResult');
  const description = qs('#convertDesc');

  /** 后端返回的类别清单。 */
  let categories = [];

  /**
   * 用给定选项填充下拉框。
   *
   * @param {HTMLSelectElement} select 下拉框。
   * @param {Array<{code: string, label: string}>} units 单位列表。
   * @param {string} [selected] 需要选中的单位代码。
   * @returns {void}
   */
  function fillUnits(select, units, selected) {
    select.replaceChildren(...units.map((unit) => h('option', {
      text: unit.label,
      attrs: { value: unit.code },
    })));
    if (selected !== undefined && units.some((unit) => unit.code === selected)) {
      select.value = selected;
    }
  }

  /**
   * 根据当前选中的类别刷新单位下拉框。
   *
   * @param {string} categoryKey 类别键。
   * @returns {void}
   */
  function applyCategory(categoryKey) {
    const category = categories.find((item) => item.category === categoryKey);
    if (category === undefined) {
      return;
    }
    const codes = category.units.map((unit) => unit.code);
    fillUnits(fromSelect, category.units, codes[0]);
    fillUnits(toSelect, category.units, codes[1] === undefined ? codes[0] : codes[1]);
  }

  /**
   * 调用后端执行换算。
   * @returns {Promise<void>} 无返回值。
   */
  async function convert() {
    const rawValue = valueInput.value.trim();
    if (rawValue === '') {
      resultOutput.textContent = '—';
      description.textContent = '请输入需要换算的数值';
      return;
    }

    convertButton.disabled = true;
    try {
      const data = await api.convert({
        category: categorySelect.value,
        from: fromSelect.value,
        to: toSelect.value,
        value: Number(rawValue),
      });
      resultOutput.textContent = formatNumber(data.result);
      description.textContent = data.formatted;
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError('换算失败');
      resultOutput.textContent = '—';
      description.textContent = apiError.message;
      showToast({
        type: 'error',
        title: apiError.isConnectionError ? '无法连接后端' : '换算失败',
        text: apiError.message,
      });
    } finally {
      convertButton.disabled = false;
    }
  }

  // ------------------------------------------------------------ 事件绑定

  categorySelect.addEventListener('change', () => {
    applyCategory(categorySelect.value);
    convert();
  });

  fromSelect.addEventListener('change', convert);
  toSelect.addEventListener('change', convert);
  valueInput.addEventListener('input', convert);
  valueInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      convert();
    }
  });

  swapButton.addEventListener('click', () => {
    const from = fromSelect.value;
    fromSelect.value = toSelect.value;
    toSelect.value = from;
    convert();
  });

  convertButton.addEventListener('click', convert);

  /**
   * 初始化：拉取单位清单并完成一次默认换算。
   * @returns {Promise<void>} 无返回值。
   */
  async function initialize() {
    try {
      const data = await api.convertUnits();
      categories = data.categories;
      categorySelect.replaceChildren(...categories.map((category) => h('option', {
        text: category.label,
        attrs: { value: category.category },
      })));
      applyCategory(categories[0].category);
      await convert();
    } catch (error) {
      showToast({
        type: 'error',
        title: '无法加载单位清单',
        text: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { initialize, convert };
}
