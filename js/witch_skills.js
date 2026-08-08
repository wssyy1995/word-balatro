// ===== 女巫技能配置 =====
const WITCH_SKILLS = [
  { level: 3, name: '女巫_A', reward: 'card_change_letter',rate:1, has_reward: true, reward_desc: '有概率获得一张: 字母置换' },
  { level: 5, name: '女巫_B', reward: 'global_letter_1',rate:0.1, has_reward: false, reward_desc: '本赛局,字母手牌+1' },
  { level: 8, name: '女巫_C',  reward: 'global_letter_1',rate:1, has_reward: true, reward_desc: '本赛局,字母手牌+1'},
  { level: 11, name: '女巫_D', reward: 'shop_discount_5',rate:1, has_reward: false, reward_desc: '本回合卡牌商店，打5折'},
  { level: 14, name: '女巫_E', reward: 'global_witch_card_1',rate:1, has_reward: true, reward_desc: '本赛局，增加一张女巫牌槽位' },
  { level: 16, name: '女巫_F', reward: 'card_random_upgrade',rate:1, has_reward: false, reward_desc: '有概率获得一张: 随机强化'},
  { level: 18, name: '女巫_G', reward: 'global_hand_1',rate:1, has_reward: true, reward_desc: '本赛局,出牌次数 +1'  },
  { level: 21, name: '女巫_H',  reward: 'card_upgrade_letter',rate:0.3, has_reward: false, reward_desc: '有概率获得一张: 字母升级' },
  { level: 24, name: '女巫_I',  reward: 'shop_discount_5',rate:1, has_reward: true, reward_desc: '本回合卡牌商店，打5折' },
  { level: 27, name: '女巫_J',  reward: 'card_upgrade_letter',rate:0.3, has_reward: false, reward_desc: '有概率获得一张: 字母升级' },
  { level: 29, name: '女巫_K', reward: 'global_letter_1',rate:1, has_reward: true, reward_desc: '本赛局,字母手牌+1' },
  { level: 32, name: '女巫_L', reward: 'card_upgrade_letter',    rate: 0.3, has_reward: false, reward_desc: '有概率获得一张: 字母升级' },
  { level: 35, name: '女巫_M', reward: 'card_upgrade_letter',    rate: 0.3, has_reward: true, reward_desc: '有概率获得一张: 字母升级' },
  { level: 38, name: '女巫_N', reward: 'card_upgrade_letter',    rate: 0.3, has_reward: false, reward_desc: '有概率获得一张: 字母升级' },
  { level: 41, name: '女巫_O', reward: 'global_letter_1',rate:1, has_reward: true, reward_desc: '本赛局,字母手牌+1' },
  { level: 44, name: '女巫_P', reward: 'card_upgrade_letter',    rate: 0.3, has_reward: false, reward_desc: '有概率获得一张: 字母升级' },
  { level: 47, name: '女巫_Q', reward: 'card_upgrade_letter',    rate: 0.3, has_reward: true, reward_desc: '有概率获得一张: 字母升级' },
  { level: 50, name: '女巫_R', reward: 'card_upgrade_letter',    rate: 0.3, has_reward: false, reward_desc: '有概率获得一张: 字母升级' },
  { level: 53, name: '女巫_S', reward: 'card_upgrade_letter',    rate: 0.3, has_reward: true, reward_desc: '有概率获得一张: 字母升级' },
  { level: 56, name: '女巫_T', reward: 'card_upgrade_letter',    rate: 0.3, has_reward: false, reward_desc: '有概率获得一张: 字母升级' },
  { level: 59, name: '女巫_U', reward: 'card_upgrade_letter',    rate: 0.3, has_reward: true, reward_desc: '有概率获得一张: 字母升级' },
  { level: 62, name: '女巫_V', reward: 'card_upgrade_letter',    rate: 0.3, has_reward: false, reward_desc: '有概率获得一张: 字母升级' },
  { level: 65, name: '女巫_W', reward: 'card_upgrade_letter',    rate: 0.3, has_reward: true, reward_desc: '有概率获得一张: 字母升级' },
  { level: 68, name: '女巫_X', reward: 'card_upgrade_letter',    rate: 0.3, has_reward: false, reward_desc: '有概率获得一张: 字母升级' },
  { level: 71, name: '女巫_Y', reward: 'card_upgrade_letter',    rate: 0.3, has_reward: true, reward_desc: '有概率获得一张: 字母升级' },
  { level: 74, name: '女巫_Z', reward: 'card_upgrade_letter',    rate: 0.3, has_reward: false, reward_desc: '有概率获得一张: 字母升级' }

];

//技能池（skill + desc + angry_tip 绑定，游戏开始时打乱顺序分配）
const SKILL_POOL = [
  { skill: 'force_letter_3', desc: '每次出牌,只能出3张字母牌', angry_tip: '要遵守规矩哦，我生气的后果很严重。' },
  { skill: 'need_letter_4', desc: '每次出牌,不能少于4个字母', angry_tip: '要遵守规矩哦，我生气的后果很严重。' },
  { skill: 'forbid_illegal_words', desc: '出现非法单词，游戏结束', angry_tip: '要遵守规矩哦，我生气的后果很严重。' },
  { skill: 'force_letter_4', desc: '每次出牌,只能出4张字母牌', angry_tip: '要遵守规矩哦，我生气的后果很严重。' },
  { skill: 'letter_a_mult_half', desc: '出牌如果包含字母 \'A\', 单词倍率减半', angry_tip: '要遵守规矩哦，我生气的后果很严重。' },
  { skill: 'no_letter_a', desc: '本回合不会出现字母牌\'A\'', angry_tip: 'A去哪儿了' },
  { skill: 'letter_e_mult_half', desc: '出牌如果包含字母 \'E\', 单词倍率减半', angry_tip: '要遵守规矩哦，我生气的后果很严重。' },
  { skill: 'letter_s_mult_half', desc: '出牌如果包含字母 \'S\', 单词倍率减半', angry_tip: '要遵守规矩哦，我生气的后果很严重。' },
  { skill: 'letter_i_mult_half', desc: '出牌如果包含字母 \'I\', 单词倍率减半', angry_tip: '要遵守规矩哦，我生气的后果很严重。' },
  { skill: 'disable_one_witch_card', desc: '随机禁用1张女巫牌', angry_tip: '要遵守规矩哦，我生气的后果很严重。' },
  { skill: 'disable_two_witch_card', desc: '随机禁用2张女巫牌', angry_tip: '要遵守规矩哦，我生气的后果很严重。' },
  { skill: 'disable_potion_card', desc: '本回合，禁用魔法药水牌', angry_tip: '要遵守规矩哦，我生气的后果很严重。'},
  { skill: 'force_contain_A', desc: '打出的单词必须包含\'A\'', angry_tip: '要遵守规矩哦，我生气的后果很严重。'},
  { skill: 'force_contain_B', desc: '打出的单词必须包含\'B\'', angry_tip: '要遵守规矩哦，我生气的后果很严重。'},
  { skill: 'force_contain_O', desc: '打出的单词必须包含\'O\'', angry_tip: '要遵守规矩哦，我生气的后果很严重。'},
  { skill: 'witch_card_value_half', desc: '所有女巫牌的倍率效果都减半', angry_tip: '太依赖道具，也不行哦。'}
];
// const SKILL_POOL = [
//   { skill: 'disable_one_witch_card', desc: '随机禁用1张女巫牌', angry_tip: '要遵守规矩哦，我生气的后果很严重。' }
// ];
// ===== 女巫卡牌配置 =====
// const WITCH_CARDS = [
//   { card_id: 'witch_card_3', witch_name: '爱莉亚', witch_desc:'金之女巫，黄金时代的最后守望者',card_skill_name: 'each_round_coin_plus1',card_skill_desc:'每回合结算，基础金币+1'},
//   { card_id: 'witch_card_5', witch_name: '柏丽桑忒', witch_desc:'荆棘花园的看守者，玫瑰马车拉开天幕',card_skill_name: 'each_round_hand_plus1',card_skill_desc:'每回合出牌次数+1,但基础金币-2'},
//   { card_id: 'witch_card_8', witch_name: '喀薇娅', witch_desc:'虚空中编织咒文之人',card_skill_name: 'illegal_words_one',card_skill_desc:'每回合,首次非法单词不扣除出牌次数'},
//   { card_id: 'witch_card_11', witch_name: '德莱薇尔', witch_desc:'以亡魂之丝纺命运的织者',card_skill_name: 'last_letter_double',card_skill_desc:'单词最后一个字母，触发结算2次'},
//   { card_id: 'witch_card_14', witch_name: '艾莉瑟瑞丝', witch_desc:'挣脱枷锁者，禁咒破译者',card_skill_name: 'witch_skill_protect',card_skill_desc:'有女巫的回合,首次出牌不会触发试炼规则'},
//   { card_id: 'witch_card_16', witch_name: '菲兰瑟娅', witch_desc:'牵动命运之线的人',card_skill_name: 'shop_discount',card_skill_desc:'每回合分数超过目标分30%，则该回合的卡牌商店打6折'},
//   { card_id: 'witch_card_18', witch_name: '格莱薇妮娅', witch_desc:'持重者，不动如山的审判官',card_skill_name: 'score_overflow',card_skill_desc:'每回合溢出分数（超过目标分部分）的10%计入下回合初始分'},
//   { card_id: 'witch_card_21', witch_name: '赫丝佩瑞丝', witch_desc:'异界来客，裂隙彼岸之人',card_skill_name: 'out_card_different',card_skill_desc:'每次弃牌后补入的字母,一定会排除原弃牌字母'},
//   { card_id: 'witch_card_24', witch_name: '伊洛薇尔', witch_desc:'暮光行者，昼夜的守门人',card_skill_name: 'witch_skill_extra_hands',card_skill_desc:'若本回合有女巫，出牌和弃牌次数均+1'},
//   { card_id: 'witch_card_27', witch_name: '薇尔莉特', witch_desc:'星语者，以字母编织命运之人',card_skill_name: 'letter_trigger_twice_A',card_skill_desc:'打出单词包含字母A，该字母触发2次计分'}

// ];
//将WITCH_CARDS 统一改成字母触发2次
const WITCH_CARDS = [
  { card_id: 'witch_card_3',  card_letter: 'A', witch_name: '爱莉亚',     witch_desc: '爱之女巫，喜悦和希望的守望者',          card_skill_name: 'letter_trigger_twice_A', card_skill_desc: '打出单词包含字母A，该字母触发2次计分' },
  { card_id: 'witch_card_5',  card_letter: 'B', witch_name: '柏丽桑忒',   witch_desc: '荆棘花园的看守者',                      card_skill_name: 'letter_trigger_twice_B', card_skill_desc: '打出单词包含字母B，该字母触发2次计分' },
  { card_id: 'witch_card_8',  card_letter: 'C', witch_name: '喀薇娅',     witch_desc: '虚空中编织咒文之人',                    card_skill_name: 'letter_trigger_twice_C', card_skill_desc: '打出单词包含字母C，该字母触发2次计分' },
  { card_id: 'witch_card_11', card_letter: 'D', witch_name: '德莱薇尔',   witch_desc: '以亡魂之丝纺命运的织者',                card_skill_name: 'letter_trigger_twice_D', card_skill_desc: '打出单词包含字母D，该字母触发2次计分' },
  { card_id: 'witch_card_14', card_letter: 'E', witch_name: '艾莉瑟瑞丝', witch_desc: '挣脱枷锁者，禁咒破译者',                card_skill_name: 'letter_trigger_twice_E', card_skill_desc: '打出单词包含字母E，该字母触发2次计分' },
  { card_id: 'witch_card_16', card_letter: 'F', witch_name: '菲兰瑟娅',   witch_desc: '牵动命运之线的人',                      card_skill_name: 'letter_trigger_twice_F', card_skill_desc: '打出单词包含字母F，该字母触发2次计分' },
  { card_id: 'witch_card_18', card_letter: 'G', witch_name: '格莱薇妮娅', witch_desc: '持重者，不动如山的审判官',              card_skill_name: 'letter_trigger_twice_G', card_skill_desc: '打出单词包含字母G，该字母触发2次计分' },
  { card_id: 'witch_card_21', card_letter: 'H', witch_name: '赫丝佩瑞丝', witch_desc: '异界来客，裂隙彼岸之人',                card_skill_name: 'letter_trigger_twice_H', card_skill_desc: '打出单词包含字母H，该字母触发2次计分' },
  { card_id: 'witch_card_24', card_letter: 'I', witch_name: '伊洛薇尔',   witch_desc: '暮光行者，昼夜的守门人',                card_skill_name: 'letter_trigger_twice_I', card_skill_desc: '打出单词包含字母I，该字母触发2次计分' },
  { card_id: 'witch_card_27', card_letter: 'J', witch_name: '柔莉丝特',   witch_desc: '诡笑之星，以戏法乱人心的嘲弄者',        card_skill_name: 'letter_trigger_twice_J', card_skill_desc: '打出单词包含字母J，该字母触发2次计分' },
  { card_id: 'witch_card_29', card_letter: 'K', witch_name: '卡莉瑟薇',   witch_desc: '美之守望者，容颜即武器',                card_skill_name: 'letter_trigger_twice_K', card_skill_desc: '打出单词包含字母K，该字母触发2次计分' },
  { card_id: 'witch_card_32', card_letter: 'L', witch_name: '莉丝薇娜',   witch_desc: '消融咒缚之脉，解除一切禁锢',            card_skill_name: 'letter_trigger_twice_L', card_skill_desc: '打出单词包含字母L，该字母触发2次计分' },
  { card_id: 'witch_card_35', card_letter: 'M', witch_name: '莫薇希娅',   witch_desc: '衔尾之女，轮回的见证者',                card_skill_name: 'letter_trigger_twice_M', card_skill_desc: '打出单词包含字母M，该字母触发2次计分' },
  { card_id: 'witch_card_38', card_letter: 'N', witch_name: '妮瓦瑞丝',   witch_desc: '永冬的守夜人，寒霜为袍',                card_skill_name: 'letter_trigger_twice_N', card_skill_desc: '打出单词包含字母N，该字母触发2次计分' },
  { card_id: 'witch_card_41', card_letter: 'O', witch_name: '奥菲妮娅',   witch_desc: '寂静王座的掌灯人',                      card_skill_name: 'letter_trigger_twice_O', card_skill_desc: '打出单词包含字母O，该字母触发2次计分' },
  { card_id: 'witch_card_44', card_letter: 'P', witch_name: '佩洛薇拉',   witch_desc: '帷幕后的低语者，只向挚爱现身',                      card_skill_name: 'letter_trigger_twice_P', card_skill_desc: '打出单词包含字母P，该字母触发2次计分' },
  { card_id: 'witch_card_47', card_letter: 'Q', witch_name: '奎薇莉娅',   witch_desc: '千面者，无定形之巫',                      card_skill_name: 'letter_trigger_twice_Q', card_skill_desc: '打出单词包含字母Q，该字母触发2次计分' },
  { card_id: 'witch_card_50', card_letter: 'R', witch_name: '拉薇希娅',   witch_desc: '以沙哑咒语催魂的唤灵人',                      card_skill_name: 'letter_trigger_twice_R', card_skill_desc: '打出单词包含字母R，该字母触发2次计分' },
  { card_id: 'witch_card_53', card_letter: 'S', witch_name: '茜达尔',   witch_desc: '古木之心，根脉蔓延整片幽林',                      card_skill_name: 'letter_trigger_twice_S', card_skill_desc: '打出单词包含字母S，该字母触发2次计分' },
  { card_id: 'witch_card_56', card_letter: 'T', witch_name: '翠诺莎',   witch_desc: '寂静王座的掌灯人',                      card_skill_name: 'letter_trigger_twice_T', card_skill_desc: '打出单词包含字母T，该字母触发2次计分' },
  { card_id: 'witch_card_59', card_letter: 'U', witch_name: '安柏瑞拉',   witch_desc: '微暗之女，影中行走之人',                      card_skill_name: 'letter_trigger_twice_U', card_skill_desc: '打出单词包含字母U，该字母触发2次计分' },
  { card_id: 'witch_card_62', card_letter: 'V', witch_name: '薇尔菲拉',   witch_desc: '面纱织爱者，以神秘为礼',                      card_skill_name: 'letter_trigger_twice_V', card_skill_desc: '打出单词包含字母V，该字母触发2次计分' },
];

// 打乱数组（Fisher-Yates）
function shuffleSkills(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// 解析 force_contain_X 类技能，返回要求的字母（如 'A'）
function getForceContainLetter(skillName) {
  if (!skillName) return null;
  const match = skillName.match(/^force_contain_([A-Z])$/);
  return match ? match[1] : null;
}

// 获取指定回合的女巫技能
// shuffledSkills：打乱后的 SKILL_POOL 数组，若传入则按索引动态分配 skill + desc + angry_tip
function getSkillForLevel(level, shuffledSkills = null) {
  const config = WITCH_SKILLS.find(s => s.level === level);
  if (!config) return null;
  const idx = WITCH_SKILLS.indexOf(config);
  // SKILL_POOL 长度可能小于 WITCH_SKILLS，超出时循环复用技能定义
  if (shuffledSkills && shuffledSkills.length > 0) {
    const skillDef = shuffledSkills[idx % shuffledSkills.length];
    return { ...config, skill: skillDef.skill, desc: skillDef.desc, angry_tip: skillDef.angry_tip };
  }
  return { ...config, skill: '', desc: '' };
}

// 检查技能是否满足
function checkSkill(skillName, game, playedCards) {
  // force_contain_X：打出的单词必须包含指定字母
  const requiredLetter = getForceContainLetter(skillName);
  if (requiredLetter) {
    const word = playedCards.map(c => c.letter.toUpperCase()).join('');
    return word.includes(requiredLetter);
  }

  switch (skillName) {
    case 'need_letter_4':
      return playedCards.length >= 4;
    case 'force_letter_3':
      return playedCards.length === 3;
    case 'force_letter_4':
      return playedCards.length === 4;
    case 'disable_potion_card':
    case 'disable_one_witch_card':
    case 'disable_two_witch_card':
      // 禁用类试炼：限制在道具/女巫牌点击层处理，出牌本身不受限制
      return true;
    case 'witch_card_value_half':
      // 倍率效果减半：不影响出牌本身是否合法
      return true;
    default:
      return true;
  }
}

// 获取技能失败提示文字
function getSkillFailText(skillName) {
  // force_contain_X
  const requiredLetter = getForceContainLetter(skillName);
  if (requiredLetter) {
    return `女巫试炼：本回合打出的单词必须包含字母 '${requiredLetter}'`;
  }

  switch (skillName) {
    case 'need_letter_4':
      return '女巫试炼：每次出牌必须不少于4个字母';
    case 'force_letter_3':
      return '女巫试炼：每次出牌只能出3张字母牌';
    case 'force_letter_4':
      return '女巫试炼：每次出牌只能出4张字母牌';
    case 'disable_potion_card':
      return '女巫试炼：本回合禁用魔法药水牌';
    case 'disable_one_witch_card':
      return '女巫试炼：本回合随机禁用1张女巫牌';
    case 'disable_two_witch_card':
      return '女巫试炼：本回合随机禁用2张女巫牌';
    case 'witch_card_value_half':
      return '女巫试炼：本回合所有女巫牌倍率效果减半';
    default:
      return '女巫试炼未满足';
  }
}

// 获取奖励名称
function getRewardName(rewardType) {
  const map = {
    'card_upgrade_letter': '字母强化药水',
    'card_random_upgrade': '随机强化药水',
    'card_change_letter': '字母置换药水',
    'global_hand_1': '额外出牌',
    'global_letter_1': '额外字母',
    'global_witch_card_1': '女巫槽位+1',
    'double_coin': '金币翻倍',
    'shop_discount_5': '商店5折',
  };
  return map[rewardType] || rewardType;
}

// 创建奖励物品（不直接加入 potions）
function createRewardItem(rewardType) {
  switch (rewardType) {
    case 'card_upgrade_letter':
      return {
        name: '字母强化',
        type: 'potion',
        effect: 'upgrade_letter',
        value: 2,
        cost: 4,
        desc: '选择一张字母牌升级，本赛局内有效'
      };
    case 'card_random_upgrade':
      return {
        name: '随机强化',
        type: 'potion',
        effect: 'random_upgrade',
        value: 4,
        cost: 5,
        desc: '随机强化1个字母，分数×1.5~4.0'
      };
    case 'card_change_letter':
      return {
        name: '字母置换',
        type: 'potion',
        effect: 'change_letter',
        scope: 'game',
        value: 2,
        cost: 6,
        desc: '游戏中,可选择一张字母牌切换字母'
      };
    case 'global_hand_1':
      return {
        name: '额外出牌',
        type: 'buff',
        effect: 'extra_hand',
        value: 1,
        desc: '本赛局，出牌次数+1'
      };
    case 'global_letter_1':
      return {
        name: '额外字母',
        type: 'buff',
        effect: 'extra_letter',
        value: 1,
        desc: '本赛局，字母手牌+1'
      };
    case 'double_coin':
      return {
        name: '金币翻倍',
        type: 'buff',
        effect: 'double_coin',
        value: 2,
        desc: '已拥有金币翻倍'
      };
    case 'global_witch_card_1':
      return {
        name: '女巫槽位+1',
        type: 'buff',
        effect: 'extra_witch_slot',
        value: 1,
        desc: '本赛局，女巫牌槽位+1'
      };
    case 'shop_discount_5':
      return {
        name: '商店5折',
        type: 'buff',
        effect: 'shop_discount_5',
        value: 0.5,
        desc: '本回合卡牌商店,所有商品打5折'
      };
    default:
      return null;
  }
}

// 发放奖励
function giveReward(rewardType, game) {
  switch (rewardType) {
    case 'card_upgrade_letter':
    case 'card_random_upgrade': {
      if (!game.potions) game.potions = [];
      // 如果道具栏已满（2格），不发放
      if (game.potions.length >= 2) return false;
      game.potions.push(createRewardItem(rewardType));
      return true;
    }
    case 'global_hand_1': {
      game.extraHands = (game.extraHands || 0) + 1;
      return true;
    }
    case 'global_letter_1': {
      game._globalExtraLetters = (game._globalExtraLetters || 0) + 1;
      return true;
    }
    case 'global_witch_card_1': {
      game.maxJokerSlots = (game.maxJokerSlots || 4) + 1;
      return true;
    }
    case 'shop_discount_5': {
      game._shopDiscountActive = true;
      game._shopDiscountRate = 0.5;
      return true;
    }
    default:
      return false;
  }
}

// 解析 letter_trigger_twice_X 技能，返回目标字母（大写），不是则返回 null
function parseLetterTriggerTwiceSkill(skillName) {
  const match = skillName && skillName.match(/^letter_trigger_twice_([a-zA-Z])$/);
  return match ? match[1].toUpperCase() : null;
}

// 渲染用描述文本：将 desc 中的 'value' 占位符替换为实际生效值（real_value 优先，未升级时为 value）
// 例：{ value: 3, desc: '元音字母分×value' } → '元音字母分×3'
function formatItemDesc(item) {
  if (!item || !item.desc) return '';
  const v = (item.real_value !== undefined && item.real_value !== null) ? item.real_value : item.value;
  if (v === undefined || v === null) return item.desc;
  return item.desc.replace(/value/g, String(v));
}

module.exports = {
  WITCH_SKILLS,
  WITCH_CARDS,
  SKILL_POOL,
  getSkillForLevel,
  checkSkill,
  getSkillFailText,
  getRewardName,
  createRewardItem,
  giveReward,
  shuffleSkills,
  parseLetterTriggerTwiceSkill,
  getForceContainLetter,
  formatItemDesc
};
