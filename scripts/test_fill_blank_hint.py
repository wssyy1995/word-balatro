#!/usr/bin/env python3
# fill_blanks「提示字母」逻辑等价测试（本机无 Node，用 Python 复刻 pickFillBlankHintCards 逐字校验）
# 与 js/fill_blank.js 中实现一一对应；改动纯函数后需同步本文件
# 运行：python3 scripts/test_fill_blank_hint.py

def pick_fill_blank_hint_cards(hand, word, hint_count):
    w = str(word or '').upper()
    count = int(hint_count) + 1
    if not w or count <= 0 or count > len(w) or not isinstance(hand, list):
        return None
    used = set()
    picked = []
    for i in range(count):
        ch = w[i]
        candidates = []
        for j, card in enumerate(hand):
            if not card or j in used or card.get('letter') != ch:
                continue
            candidates.append((card, j))
        if not candidates:
            return None
        # 与 JS 一致：_isFillBlank 优先（稳定排序，下标小者优先）
        candidates.sort(key=lambda c: 0 if c[0].get('_isFillBlank') else 1)
        used.add(candidates[0][1])
        picked.append(candidates[0][0])
    return picked


_uid = 0
def card(letter, is_fill_blank=False):
    global _uid
    _uid += 1
    return {'letter': letter, 'id': f'c{_uid}', '_isFillBlank': is_fill_blank}

passed = failed = 0
def check(name, cond, detail=''):
    global passed, failed
    if cond:
        passed += 1
        print('  ✅', name)
    else:
        failed += 1
        print('  ❌', name, detail)

def letters(cards):
    return ''.join(c['letter'] for c in cards) if cards else None

# 用例 1：首次提示（hintCount=0），返回第 1 个字母的牌
hand = [card('D'), card('E'), card('E'), card('M'), card('X')]
r = pick_fill_blank_hint_cards(hand, 'deem', 0)
check('用例1 首次提示返回 [D]', letters(r) == 'D', str(letters(r)))

# 用例 2：依次推进，hintCount=1 → [D,E]，hintCount=2 → [D,E,E]（两张不同的 E 牌）
e1, e2 = card('E'), card('E')
hand = [card('D'), e1, e2, card('M')]
r1 = pick_fill_blank_hint_cards(hand, 'deem', 1)
check('用例2a 第二次提示返回 [D,E]', letters(r1) == 'DE', str(letters(r1)))
r2 = pick_fill_blank_hint_cards(hand, 'deem', 2)
check('用例2b 第三次提示返回 [D,E,E]', letters(r2) == 'DEE', str(letters(r2)))
es = [c for c in r2 if c['letter'] == 'E'] if r2 else []
check('用例2c 两个 E 是不同卡牌实例', len(es) == 2 and es[0]['id'] != es[1]['id'],
      str([c['id'] for c in r2] if r2 else None))

# 用例 3：重复字母去重——word=letter，hintCount=3（前缀 LETT），两张 T 必须不同
hand = [card('L'), card('E'), card('T'), card('T'), card('E'), card('R')]
r = pick_fill_blank_hint_cards(hand, 'letter', 3)
ts = [c for c in r if c['letter'] == 'T'] if r else []
check('用例3 重复字母映射到不同卡牌',
      letters(r) == 'LETT' and len(ts) == 2 and ts[0]['id'] != ts[1]['id'],
      str([c['id'] for c in r] if r else None))

# 用例 4：优先 _isFillBlank 保底牌
normal, fb = card('D'), card('D', True)
hand = [normal, fb]
r = pick_fill_blank_hint_cards(hand, 'deem', 0)
check('用例4 优先保底牌', r and r[0]['id'] == fb['id'],
      str([c['id'] for c in r] if r else None))

# 用例 5：手牌缺字母（异常），返回 null
hand = [card('D'), card('E'), card('E')]  # 缺 M
r = pick_fill_blank_hint_cards(hand, 'deem', 3)
check('用例5 缺字母返回 null', r is None, str(letters(r)))

# 用例 6：hintCount 越界（已全部提示），返回 null
hand = [card('D'), card('E'), card('E'), card('M')]
r = pick_fill_blank_hint_cards(hand, 'deem', 4)
check('用例6 hintCount 越界返回 null', r is None, str(letters(r)))

# 附加：大小写不敏感（word 大写 / 卡牌大写字母）
hand = [card('D'), card('E'), card('E'), card('M')]
r = pick_fill_blank_hint_cards(hand, 'DEEM', 3)
check('附加 大写 word 正常匹配', letters(r) == 'DEEM', str(letters(r)))

# 附加：空参数健壮性
check('附加 空 word 返回 null', pick_fill_blank_hint_cards([card('D')], '', 0) is None)
check('附加 空 hand 返回 null', pick_fill_blank_hint_cards([], 'deem', 0) is None)
check('附加 null hand 返回 null', pick_fill_blank_hint_cards(None, 'deem', 0) is None)

print(f'\n结果: {passed} 通过, {failed} 失败')
exit(1 if failed else 0)
