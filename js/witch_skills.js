// ===== 女巫技能配置 =====
const WITCH_SKILLS = [
  { level: 3, name: '女巫_A', reward: 'card_change_letter',rate:0.5,reward_desc: '有概率获得一张: 字母置换' },
  { level: 5, name: '女巫_B', reward: 'double_coin',rate:0.5,reward_desc: '有概率，已拥有金币翻倍' },
  { level: 8, name: '女巫_C',  reward: 'global_witch_card_1',rate:1,reward_desc: '本赛局，增加一张女巫牌槽位'},
  { level: 11, name: '女巫_D', reward: 'global_letter_1',rate:1,reward_desc: '本赛局,字母手牌+1' },
  { level: 14, name: '女巫_E', reward: 'card_random_upgrade',rate:0.5,reward_desc: '有概率获得一张: 随机强化'},
  { level: 16, name: '女巫_F', reward: 'global_hand_1',rate:1,reward_desc: '本赛局,出牌次数 +1' },
  { level: 18, name: '女巫_G', reward: 'card_random_upgrade',rate:0.3,reward_desc: '有概率获得一张: 随机强化' },
  { level: 21, name: '女巫_H',  reward: 'card_upgrade_letter',rate:0.3,reward_desc: '有概率获得一张: 字母升级' },
  { level: 24, name: '女巫_I',  reward: 'card_upgrade_letter',rate:0.3,reward_desc: '有概率获得一张: 字母升级' },
  { level: 27, name: '女巫_J',  reward: 'card_upgrade_letter',rate:0.3,reward_desc: '有概率获得一张: 字母升级' },
  { level: 30, name: '女巫_K', reward: 'card_upgrade_letter',    rate: 0.3, reward_desc: '有概率获得一张: 字母升级' },
  { level: 33, name: '女巫_L', reward: 'card_upgrade_letter',    rate: 0.3, reward_desc: '有概率获得一张: 字母升级' },
  { level: 36, name: '女巫_M', reward: 'card_upgrade_letter',    rate: 0.3, reward_desc: '有概率获得一张: 字母升级' },
  { level: 39, name: '女巫_N', reward: 'card_upgrade_letter',    rate: 0.3, reward_desc: '有概率获得一张: 字母升级' },
  { level: 42, name: '女巫_O', reward: 'card_upgrade_letter',    rate: 0.3, reward_desc: '有概率获得一张: 字母升级' },
  { level: 45, name: '女巫_P', reward: 'card_upgrade_letter',    rate: 0.3, reward_desc: '有概率获得一张: 字母升级' },
  { level: 48, name: '女巫_Q', reward: 'card_upgrade_letter',    rate: 0.3, reward_desc: '有概率获得一张: 字母升级' },
  { level: 51, name: '女巫_R', reward: 'card_upgrade_letter',    rate: 0.3, reward_desc: '有概率获得一张: 字母升级' },
  { level: 54, name: '女巫_S', reward: 'card_upgrade_letter',    rate: 0.3, reward_desc: '有概率获得一张: 字母升级' },
  { level: 57, name: '女巫_T', reward: 'card_upgrade_letter',    rate: 0.3, reward_desc: '有概率获得一张: 字母升级' },
  { level: 60, name: '女巫_U', reward: 'card_upgrade_letter',    rate: 0.3, reward_desc: '有概率获得一张: 字母升级' },
  { level: 63, name: '女巫_V', reward: 'card_upgrade_letter',    rate: 0.3, reward_desc: '有概率获得一张: 字母升级' },
  { level: 66, name: '女巫_W', reward: 'card_upgrade_letter',    rate: 0.3, reward_desc: '有概率获得一张: 字母升级' },
  { level: 69, name: '女巫_X', reward: 'card_upgrade_letter',    rate: 0.3, reward_desc: '有概率获得一张: 字母升级' },
  { level: 72, name: '女巫_Y', reward: 'card_upgrade_letter',    rate: 0.3, reward_desc: '有概率获得一张: 字母升级' },
  { level: 75, name: '女巫_Z', reward: 'card_upgrade_letter',    rate: 0.3, reward_desc: '有概率获得一张: 字母升级' }

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
  { skill: 'disable_one_witch_card', desc: '随机禁用1张女巫牌', angry_tip: '要遵守规矩哦，我生气的后果很严重。' }
];
// const SKILL_POOL = [
//   { skill: 'disable_one_witch_card', desc: '随机禁用1张女巫牌', angry_tip: '要遵守规矩哦，我生气的后果很严重。' }
// ];
// ===== 女巫卡牌配置 =====
const WITCH_CARDS = [
  { card_id: 'witch_card_3', witch_name: '爱莉亚', witch_desc:'金之女巫，黄金时代的最后守望者',card_skill_name: 'each_round_coin_plus1',card_skill_desc:'每回合结算，基础金币+1'},
  { card_id: 'witch_card_5', witch_name: '柏丽桑忒', witch_desc:'荆棘花园的看守者，玫瑰马车拉开天幕',card_skill_name: 'each_round_hand_plus1',card_skill_desc:'每回合出牌次数+1,但基础金币-2'},
  { card_id: 'witch_card_8', witch_name: '喀薇娅', witch_desc:'虚空中编织咒文之人',card_skill_name: 'illegal_words_one',card_skill_desc:'每回合,首次非法单词不扣除出牌次数'},
  { card_id: 'witch_card_11', witch_name: '德莱薇尔', witch_desc:'以亡魂之丝纺命运的织者',card_skill_name: 'last_letter_double',card_skill_desc:'单词最后一个字母，触发结算2次'},
  { card_id: 'witch_card_14', witch_name: '艾莉瑟瑞丝', witch_desc:'挣脱枷锁者，禁咒破译者',card_skill_name: 'witch_skill_protect',card_skill_desc:'有女巫的回合,首次出牌不会触发约束规则'},
  { card_id: 'witch_card_16', witch_name: '菲兰瑟娅', witch_desc:'牵动命运之线的人',card_skill_name: 'shop_discount',card_skill_desc:'每回合分数超过目标分20%，则该回合的卡牌商店打8折'},
  { card_id: 'witch_card_18', witch_name: '格莱薇妮娅', witch_desc:'持重者，不动如山的审判官',card_skill_name: 'score_overflow',card_skill_desc:'每回合溢出分数（超过目标分部分）的10%计入下回合初始分'}

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

// 获取指定回合的女巫技能
// shuffledSkills：打乱后的 SKILL_POOL 数组，若传入则按索引动态分配 skill + desc + angry_tip
function getSkillForLevel(level, shuffledSkills = null) {
  const config = WITCH_SKILLS.find(s => s.level === level);
  if (!config) return null;
  if (!shuffledSkills) return { ...config, skill: null };
  const idx = WITCH_SKILLS.indexOf(config);
  const skillDef = idx >= 0 && idx < shuffledSkills.length ? shuffledSkills[idx] : null;
  if (!skillDef) return { ...config, skill: null };
  return { ...config, skill: skillDef.skill, desc: skillDef.desc, angry_tip: skillDef.angry_tip };
}

// 检查技能是否满足
function checkSkill(skillName, game, playedCards) {
  switch (skillName) {
    case 'need_letter_4':
      return playedCards.length >= 4;
    case 'force_letter_3':
      return playedCards.length === 3;
    case 'force_letter_4':
      return playedCards.length === 4;
    default:
      return true;
  }
}

// 获取技能失败提示文字
function getSkillFailText(skillName) {
  switch (skillName) {
    case 'need_letter_4':
      return '女巫约束：每次出牌必须不少于4个字母';
    case 'force_letter_3':
      return '女巫约束：每次出牌只能出3张字母牌';
    case 'force_letter_4':
      return '女巫约束：每次出牌只能出4张字母牌';
    default:
      return '女巫约束未满足';
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
        desc: '本赛局出牌次数+1'
      };
    case 'global_letter_1':
      return {
        name: '额外字母',
        type: 'buff',
        effect: 'extra_letter',
        value: 1,
        desc: '本赛局字母手牌+1'
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
        desc: '本赛局女巫牌槽位+1'
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
    default:
      return false;
  }
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
  shuffleSkills
};
