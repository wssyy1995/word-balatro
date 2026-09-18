// affix_trial（前缀/后缀拼词试炼）纯函数测试：node scripts/test_affix_trial.js
const {
  parseAffixSkill, buildAffixWord, matchAffix, getTypedPart,
  pickAffixHintWord, getHintTypedLetters,
  AFFIX_TRIAL_NEED, AFFIX_TRIAL_HANDS
} = require('../js/affix_trial');

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  ✅', name); }
  else { failed++; console.log('  ❌', name, detail || ''); }
}

// 用例 1：技能名解析
{
  check('用例1a prefix_in 解析', JSON.stringify(parseAffixSkill('prefix_in')) === JSON.stringify({ kind: 'prefix', affix: 'in' }));
  check('用例1b postfix_able 解析', JSON.stringify(parseAffixSkill('postfix_able')) === JSON.stringify({ kind: 'postfix', affix: 'able' }));
  check('用例1c fill_blanks 返回 null', parseAffixSkill('fill_blanks') === null);
  check('用例1d 空值返回 null', parseAffixSkill(null) === null && parseAffixSkill('') === null);
}

// 用例 2：拼词
{
  check('用例2a prefix 拼词 in+deed=indeed', buildAffixWord('prefix', 'in', ['D', 'E', 'E', 'D']) === 'indeed');
  check('用例2b postfix 拼词 box+es=boxes', buildAffixWord('postfix', 'es', 'BOX') === 'boxes');
  check('用例2c postfix_able 拼词 read+able=readable', buildAffixWord('postfix', 'able', ['r', 'e', 'a', 'd']) === 'readable');
}

// 用例 3：词缀匹配
{
  check('用例3a indeed 匹配 prefix_in', matchAffix('indeed', 'prefix', 'in') === true);
  check('用例3b in 本身不匹配（词缀外无字母）', matchAffix('in', 'prefix', 'in') === false);
  check('用例3c spin 不匹配 prefix_in（前缀必须在开头）', matchAffix('spin', 'prefix', 'in') === false);
  check('用例3d boxes 匹配 postfix_es', matchAffix('boxes', 'postfix', 'es') === true);
  check('用例3e bus 不匹配 postfix_es', matchAffix('bus', 'postfix', 'es') === false);
}

// 用例 4：输入部分提取
{
  check('用例4a indeed 输入部分 deed', getTypedPart('indeed', 'prefix', 'in') === 'deed');
  check('用例4b readable 输入部分 read', getTypedPart('readable', 'postfix', 'able') === 'read');
}

// 用例 5：提示目标词挑选
{
  const words = ['indeed', 'inside', 'input', 'spin', 'in', 'inch', 'under', 'boxes', 'games'];
  const w = pickAffixHintWord(words, 'prefix', 'in', []);
  check('用例5a 选出 prefix_in 目标词', ['indeed', 'inside', 'input'].includes(w), w);
  check('用例5b 不选词缀本身/非前缀词/输入部分过短', w !== 'in' && w !== 'spin' && w !== 'inch', w);
}
{
  // 排除已拼过的词后必须换一个
  const words = ['under'];
  const w = pickAffixHintWord(words, 'prefix', 'un', ['under']);
  check('用例5c 已拼词被排除后走兜底词表', w !== null && w !== 'under' && w.startsWith('un'), w);
}
{
  const w = pickAffixHintWord(['abc'], 'postfix', 'es', []);
  check('用例5d 词库无匹配时走兜底词表', typeof w === 'string' && w.endsWith('es'), w);
}

// 用例 6：提示字母
{
  check('用例6a 提示1个字母 [D]', getHintTypedLetters('indeed', 'prefix', 'in', 1).join('') === 'D');
  check('用例6b 提示3个字母 [D,E,E]', getHintTypedLetters('indeed', 'prefix', 'in', 3).join('') === 'DEE');
  check('用例6c postfix 提示2个字母 [R,E]', getHintTypedLetters('readable', 'postfix', 'able', 2).join('') === 'RE');
  check('用例6d count 越界钳制到输入部分长度', getHintTypedLetters('input', 'prefix', 'in', 99).join('') === 'PUT');
  check('用例6e count=0 返回空', getHintTypedLetters('indeed', 'prefix', 'in', 0).length === 0);
}

// 常量
{
  check('常量 需拼出3个单词', AFFIX_TRIAL_NEED === 3);
  check('常量 出牌次数6', AFFIX_TRIAL_HANDS === 6);
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
