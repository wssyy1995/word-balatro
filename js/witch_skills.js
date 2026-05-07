// ===== 女巫技能配置 =====

const WITCH_SKILLS = [
  { level: 2, skill: 'need_letter_4', reward: 'card_upgrade_letter',rate:0.5,reward_desc: '50%概率获得一张: 字母强化', desc: '每次出牌必须不少于4个字母' },
  { level: 4, skill: 'need_letter_a', reward: 'change_letter',rate:0.5,reward_desc: '30%概率获得一张: 字母置换', desc: '每次出牌必须包含字母A' },
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
    default:
      return true;
  }
}

// 获取技能失败提示文字
function getSkillFailText(skillName) {
  switch (skillName) {
    case 'need_letter_4':
      return '女巫约束：每次出牌必须不少于4个字母';
    default:
      return '女巫约束未满足';
  }
}

// 获取奖励名称
function getRewardName(rewardType) {
  const map = {
    'card_upgrade_letter': '字母强化药水',
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
