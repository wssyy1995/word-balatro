// ===== 前缀/后缀拼词试炼（prefix_* / postfix_* 女巫试炼）纯逻辑工具 =====
// 职责：解析技能名、拼接完整单词、挑选提示目标词、计算提示字母。
// 本模块不依赖 wx / canvas，可在 node 中直接测试。

// 试炼常量
const AFFIX_TRIAL_NEED = 3;      // 需要拼出的合法单词数量
const AFFIX_TRIAL_HANDS = 6;     // 该试炼回合的出牌次数（3 成功 + 3 容错）
const AFFIX_TYPED_MAX = 10;      // 键盘输入最大字母数
const AFFIX_HINT_MAX = 3;        // 每回合金币提示字母上限

// 各词缀的兜底提示词（词库中实在找不到匹配词时使用）
const AFFIX_FALLBACK_WORDS = {
  'prefix_in': ['indeed', 'inside', 'input', 'income'],
  'prefix_un': ['under', 'until', 'unite', 'uncle'],
  'postfix_able': ['usable', 'readable', 'movable', 'notable'],
  'postfix_es': ['boxes', 'games', 'wishes', 'heroes']
};

// 解析技能名：prefix_in → { kind: 'prefix', affix: 'in' }；非词缀技能返回 null
function parseAffixSkill(skillName) {
  const m = skillName && skillName.match(/^(prefix|postfix)_([a-z]+)$/);
  if (!m) return null;
  return { kind: m[1], affix: m[2].toLowerCase() };
}

// 拼接完整单词：prefix → affix + typed；postfix → typed + affix
// typed 可为字母数组或字符串，返回小写单词
function buildAffixWord(kind, affix, typed) {
  const t = Array.isArray(typed) ? typed.join('') : String(typed || '');
  const body = t.toLowerCase();
  return kind === 'prefix' ? affix + body : body + affix;
}

// 判断单词是否匹配词缀（且词缀之外至少有 1 个字母）
function matchAffix(word, kind, affix) {
  const w = String(word || '').toLowerCase();
  if (!w || w.length <= affix.length) return false;
  return kind === 'prefix' ? w.startsWith(affix) : w.endsWith(affix);
}

// 取单词去掉词缀后的"输入部分"（小写）
function getTypedPart(word, kind, affix) {
  const w = String(word || '').toLowerCase();
  return kind === 'prefix' ? w.slice(affix.length) : w.slice(0, w.length - affix.length);
}

// 从词库中挑选提示目标词
// words：可迭代的单词集合（如 Object.keys(WORD_DATA) 与 EXPAND 合并）
// 规则：匹配词缀、纯字母、输入部分 2~5 个字母、排除已拼过的词
// excludePlayed：Set 或数组（小写单词）；找不到时回退 AFFIX_FALLBACK_WORDS，再找不到返回 null
function pickAffixHintWord(words, kind, affix, excludePlayed) {
  const excluded = new Set((excludePlayed || []).map(w => String(w).toLowerCase()));
  const candidates = [];
  for (const raw of words || []) {
    const w = String(raw).toLowerCase();
    if (!/^[a-z]+$/.test(w) || excluded.has(w)) continue;
    if (!matchAffix(w, kind, affix)) continue;
    const part = getTypedPart(w, kind, affix);
    if (part.length < 2 || part.length > 5) continue;
    candidates.push(w);
  }
  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
  const fallback = (AFFIX_FALLBACK_WORDS[`${kind}_${affix}`] || []).filter(w => !excluded.has(w));
  if (fallback.length > 0) {
    return fallback[Math.floor(Math.random() * fallback.length)];
  }
  return null;
}

// 提示字母：返回目标词"输入部分"的前 count 个字母（大写数组，即键盘应输入的内容）
// count 越界时钳制到输入部分长度
function getHintTypedLetters(targetWord, kind, affix, count) {
  const part = getTypedPart(targetWord, kind, affix);
  const n = Math.max(0, Math.min(Math.floor(count), part.length));
  return part.slice(0, n).toUpperCase().split('');
}

module.exports = {
  AFFIX_TRIAL_NEED,
  AFFIX_TRIAL_HANDS,
  AFFIX_TYPED_MAX,
  AFFIX_HINT_MAX,
  AFFIX_FALLBACK_WORDS,
  parseAffixSkill,
  buildAffixWord,
  matchAffix,
  getTypedPart,
  pickAffixHintWord,
  getHintTypedLetters
};
