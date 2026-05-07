// ===== 女巫技能配置 =====

const WITCH_SKILLS = [
  { level: 2, skill: 'force_letter_3', reward: 'card_change_letter',rate:0.5,reward_desc: '50%概率获得一张: 字母置换', desc: '每次出牌只能出3张字母牌' },
  { level: 3, skill: 'need_letter_4', reward: 'card_upgrade_letter',rate:0.5,reward_desc: '50%概率获得一张: 字母强化', desc: '每次出牌必须不少于4个字母' },
  { level: 4, skill: 'force_letter_4', reward: 'global_hand_1',rate:1,reward_desc: '本赛局出牌次数+1', desc: '每次出牌只能出4张字母牌' },
];

// 获取指定回合的女巫技能
function getSkillForLevel(level) {
  return WITCH_SKILLS.find(s => s.level === level);
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
    'card_change_letter': '字母置换药水',
    'global_hand_1': '额外出牌',
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
        desc: '选择一张字母牌，分数翻倍'
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
    default:
      return null;
  }
}

// 发放奖励
function giveReward(rewardType, game) {
  switch (rewardType) {
    case 'card_upgrade_letter': {
      if (!game.potions) game.potions = [];
      // 如果道具栏已满（2格），不发放
      if (game.potions.length >= 2) return false;
      game.potions.push(createRewardItem(rewardType));
      return true;
    }
    default:
      return false;
  }
}

module.exports = {
  WITCH_SKILLS,
  getSkillForLevel,
  checkSkill,
  getSkillFailText,
  getRewardName,
  createRewardItem,
  giveReward
};
