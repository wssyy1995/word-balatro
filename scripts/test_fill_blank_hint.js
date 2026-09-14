// fill_blanks「提示字母」纯函数测试：node scripts/test_fill_blank_hint.js
const { pickFillBlankHintCards } = require('../js/fill_blank');

let uid = 0;
function card(letter, isFillBlank = false) {
  return { letter, id: 'c' + (++uid), _isFillBlank: isFillBlank };
}

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  ✅', name); }
  else { failed++; console.log('  ❌', name, detail || ''); }
}
function letters(cards) { return cards ? cards.map(c => c.letter).join('') : null; }
function ids(cards) { return cards ? cards.map(c => c.id) : []; }

// 用例 1：首次提示（hintCount=0），返回第 1 个字母的牌
{
  const hand = [card('D'), card('E'), card('E'), card('M'), card('X')];
  const r = pickFillBlankHintCards(hand, 'deem', 0);
  check('用例1 首次提示返回 [D]', letters(r) === 'D', letters(r));
}

// 用例 2：依次推进，hintCount=1 → [D,E]，hintCount=2 → [D,E,E]（两张不同的 E 牌）
{
  const e1 = card('E'), e2 = card('E');
  const hand = [card('D'), e1, e2, card('M')];
  const r1 = pickFillBlankHintCards(hand, 'deem', 1);
  check('用例2a 第二次提示返回 [D,E]', letters(r1) === 'DE', letters(r1));
  const r2 = pickFillBlankHintCards(hand, 'deem', 2);
  check('用例2b 第三次提示返回 [D,E,E]', letters(r2) === 'DEE', letters(r2));
  const es = r2 ? r2.filter(c => c.letter === 'E') : [];
  check('用例2c 两个 E 是不同卡牌实例', es.length === 2 && es[0].id !== es[1].id, ids(r2).join(','));
}

// 用例 3：重复字母去重——word=letter，hintCount=3（前缀 LETT），两张 T 必须不同
{
  const hand = [card('L'), card('E'), card('T'), card('T'), card('E'), card('R')];
  const r = pickFillBlankHintCards(hand, 'letter', 3);
  const ts = r ? r.filter(c => c.letter === 'T') : [];
  check('用例3 重复字母映射到不同卡牌', letters(r) === 'LETT' && ts.length === 2 && ts[0].id !== ts[1].id, ids(r).join(','));
}

// 用例 4：优先 _isFillBlank 保底牌
{
  const normal = card('D');
  const fb = card('D', true);
  const hand = [normal, fb];
  const r = pickFillBlankHintCards(hand, 'deem', 0);
  check('用例4 优先保底牌', r && r[0].id === fb.id, ids(r).join(','));
}

// 用例 5：手牌缺字母（异常），返回 null
{
  const hand = [card('D'), card('E'), card('E')]; // 缺 M
  const r = pickFillBlankHintCards(hand, 'deem', 3);
  check('用例5 缺字母返回 null', r === null, letters(r));
}

// 用例 6：hintCount 越界（已全部提示），返回 null
{
  const hand = [card('D'), card('E'), card('E'), card('M')];
  const r = pickFillBlankHintCards(hand, 'deem', 4);
  check('用例6 hintCount 越界返回 null', r === null, letters(r));
}

// 附加：大小写不敏感（word 小写 / 卡牌大写字母）
{
  const hand = [card('D'), card('E'), card('E'), card('M')];
  const r = pickFillBlankHintCards(hand, 'DEEM', 3);
  check('附加 大写 word 正常匹配', letters(r) === 'DEEM', letters(r));
}

// 附加：空参数健壮性
{
  check('附加 空 word 返回 null', pickFillBlankHintCards([card('D')], '', 0) === null);
  check('附加 空 hand 返回 null', pickFillBlankHintCards([], 'deem', 0) === null);
  check('附加 null hand 返回 null', pickFillBlankHintCards(null, 'deem', 0) === null);
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
