// ===== 完形填空（fill_blanks 女巫试炼）纯逻辑工具 =====
// 职责：根据目标词在例句中定位挖空位置（允许常见变形），产出渲染用分段数据。
// 本模块不依赖 wx / canvas，可在 node 中直接测试。

// 生成目标词的常见变形集合（小写）
// 覆盖：原形、+s/+es/+d/+ed/+ing、去 e 变形、辅音双写、y→i 变形
// 允许过度生成（集合里多出的形式不会匹配到真实文本，无副作用）
function getWordForms(word) {
  const w = String(word || '').toLowerCase();
  const forms = new Set();
  if (!w) return forms;
  forms.add(w);
  const last = w[w.length - 1];
  const isVowel = (ch) => 'aeiou'.includes(ch);

  // 直接加后缀
  ['s', 'es', 'd', 'ed', 'ing'].forEach(suf => forms.add(w + suf));

  // 以 e 结尾：去 e 再加后缀（cease→ceased, vie→vied/vies）
  if (last === 'e' && w.length > 1) {
    const stem = w.slice(0, -1);
    ['d', 'ed', 'ing', 'es'].forEach(suf => forms.add(stem + suf));
  }

  // 以"辅音+y"结尾：y→i（comply→complied/complies）
  if (last === 'y' && w.length > 1 && !isVowel(w[w.length - 2])) {
    const stem = w.slice(0, -1);
    ['ies', 'ied'].forEach(suf => forms.add(stem + suf));
  }

  // 末字母为辅音且前一个为元音：双写末字母（stop→stopped/stopping）
  if (w.length >= 2 && !isVowel(last) && isVowel(w[w.length - 2]) && !'wxy'.includes(last)) {
    ['ed', 'ing'].forEach(suf => forms.add(w + last + suf));
  }

  return forms;
}

// 在例句中定位挖空位置
// 返回 { start, end, surface }（surface 为例句中实际出现的词形），未匹配返回 null
function locateBlank(example, word) {
  if (!example || !word) return null;
  const forms = getWordForms(word);
  const re = /[A-Za-z]+(?:'[A-Za-z]+)?/g;
  let m;
  while ((m = re.exec(example)) !== null) {
    if (forms.has(m[0].toLowerCase())) {
      return { start: m.index, end: m.index + m[0].length, surface: m[0] };
    }
  }
  return null;
}

// 切分例句为渲染片段
// 返回 { segments: [{ text } | { isBlank: true }], surface }
// segments 按顺序拼接即还原例句（挖空处以 isBlank 占位）；surface 为匹配到的变形词（用于答对后展示完整句子）
// 数据异常（例句中找不到目标词或其变形）时，在句尾追加一个挖空位兜底
function buildFillBlankParts(example, word) {
  const loc = locateBlank(example, word);
  if (!loc) {
    const text = String(example || '');
    return {
      segments: [{ text: text ? text + ' ' : '' }, { isBlank: true }],
      surface: String(word || '').toLowerCase()
    };
  }
  const segments = [];
  if (loc.start > 0) segments.push({ text: example.slice(0, loc.start) });
  segments.push({ isBlank: true });
  if (loc.end < example.length) segments.push({ text: example.slice(loc.end) });
  return { segments, surface: loc.surface };
}

// 渲染层缓存：同一数据对象只切分一次（WeakMap 不参与存档序列化）
const _partsCache = new WeakMap();
function getFillBlankParts(data) {
  if (!data) return { segments: [], surface: '' };
  let cached = _partsCache.get(data);
  if (!cached) {
    cached = buildFillBlankParts(data.example, data.word);
    _partsCache.set(data, cached);
  }
  return cached;
}

module.exports = { getWordForms, locateBlank, buildFillBlankParts, getFillBlankParts };
