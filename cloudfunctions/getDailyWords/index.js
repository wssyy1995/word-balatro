/**
 * 云函数：getDailyWords
 *
 * 职责：
 * 1. 获取当前日期（北京时间）
 * 2. 查询 daily_words 集合中 date = 今天的记录
 * 3. 若有记录，返回 words 列表（含释义、例句）
 * 4. 若无记录，自动生成 1 个随机单词并入库（兜底）
 *
 * 调用方式（前端）：
 *   wx.cloud.callFunction({
 *     name: 'getDailyWords',
 *     data: {}
 *   })
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 兜底词库（用于自动生成）
const FALLBACK_WORDS = [
  { word: 'apple', meaning: 'n. 苹果', phonetic: '/ˈæpl/', example: 'I eat an apple every day.', example_meaning: '我每天吃一个苹果。' },
  { word: 'brave', meaning: 'adj. 勇敢的', phonetic: '/breɪv/', example: 'He is a brave soldier.', example_meaning: '他是一名勇敢的士兵。' },
  { word: 'cloud', meaning: 'n. 云', phonetic: '/klaʊd/', example: 'The sky is full of dark clouds.', example_meaning: '天空布满了乌云。' },
  { word: 'dream', meaning: 'n. 梦想；v. 做梦', phonetic: '/driːm/', example: 'She has a dream to become a doctor.', example_meaning: '她有一个成为医生的梦想。' },
  { word: 'eagle', meaning: 'n. 鹰', phonetic: '/ˈiːɡl/', example: 'The eagle soared high in the sky.', example_meaning: '那只鹰在高空翱翔。' },
  { word: 'flame', meaning: 'n. 火焰', phonetic: '/fleɪm/', example: 'The candle flame flickered in the wind.', example_meaning: '烛火在风中摇曳。' },
  { word: 'grace', meaning: 'n. 优雅；恩典', phonetic: '/ɡreɪs/', example: 'She danced with grace and beauty.', example_meaning: '她舞姿优雅而美丽。' },
  { word: 'heart', meaning: 'n. 心脏；内心', phonetic: '/hɑːrt/', example: 'My heart beats faster when I run.', example_meaning: '我跑步时心跳得更快。' },
  { word: 'ideal', meaning: 'adj. 理想的；n. 理想', phonetic: '/aɪˈdiːəl/', example: 'This is the ideal solution.', example_meaning: '这是理想的解决方案。' },
  { word: 'jolly', meaning: 'adj. 愉快的', phonetic: '/ˈdʒɑːli/', example: 'We had a jolly time at the party.', example_meaning: '我们在聚会上玩得很愉快。' },
  { word: 'knack', meaning: 'n. 诀窍；本领', phonetic: '/næk/', example: 'She has a knack for languages.', example_meaning: '她有语言天赋。' },
  { word: 'lunar', meaning: 'adj. 月亮的；阴历的', phonetic: '/ˈluːnər/', example: 'The lunar calendar is different from the solar calendar.', example_meaning: '阴历与阳历不同。' },
  { word: 'magic', meaning: 'n. 魔法；adj. 神奇的', phonetic: '/ˈmædʒɪk/', example: 'The magician performed a magic trick.', example_meaning: '魔术师表演了一个魔术。' },
  { word: 'noble', meaning: 'adj. 高尚的；贵族的', phonetic: '/ˈnoʊbl/', example: 'It was a noble gesture.', example_meaning: '那是一个高尚的举止。' },
  { word: 'ocean', meaning: 'n. 海洋', phonetic: '/ˈoʊʃn/', example: 'The Pacific Ocean is the largest ocean.', example_meaning: '太平洋是最大的海洋。' },
  { word: 'peace', meaning: 'n. 和平', phonetic: '/piːs/', example: 'We all hope for world peace.', example_meaning: '我们都希望世界和平。' },
  { word: 'quest', meaning: 'n. 探索；追求', phonetic: '/kwest/', example: 'Life is a quest for happiness.', example_meaning: '人生是对幸福的追求。' },
  { word: 'shine', meaning: 'v. 发光；照耀', phonetic: '/ʃaɪn/', example: 'The sun will shine tomorrow.', example_meaning: '明天太阳会照耀。' },
  { word: 'trust', meaning: 'n./v. 信任', phonetic: '/trʌst/', example: 'Trust is the foundation of friendship.', example_meaning: '信任是友谊的基础。' },
  { word: 'unity', meaning: 'n. 团结；统一', phonetic: '/ˈjuːnəti/', example: 'Unity gives us strength.', example_meaning: '团结就是力量。' },
  { word: 'vivid', meaning: 'adj. 生动的；鲜艳的', phonetic: '/ˈvɪvɪd/', example: 'The painting has vivid colors.', example_meaning: '这幅画色彩鲜艳。' },
  { word: 'witty', meaning: 'adj. 机智的；诙谐的', phonetic: '/ˈwɪti/', example: 'He made a witty remark.', example_meaning: '他说了一句机智的话。' },
  { word: 'youth', meaning: 'n. 青年；青春', phonetic: '/juːθ/', example: 'Youth is the time to learn.', example_meaning: '青春是学习的好时光。' },
  { word: 'zeal', meaning: 'n. 热情；热忱', phonetic: '/ziːl/', example: 'He works with great zeal.', example_meaning: '他工作非常热情。' },
  { word: 'amber', meaning: 'n. 琥珀；adj. 琥珀色的', phonetic: '/ˈæmbər/', example: 'The necklace is made of amber.', example_meaning: '这条项链是琥珀做的。' },
  { word: 'bliss', meaning: 'n. 幸福；极乐', phonetic: '/blɪs/', example: 'Living by the sea is pure bliss.', example_meaning: '住在海边是纯粹的幸福。' },
  { word: 'crisp', meaning: 'adj. 脆的；清爽的', phonetic: '/krɪsp/', example: 'The autumn air was crisp and cool.', example_meaning: '秋天气清爽凉爽。' },
  { word: 'dawn', meaning: 'n. 黎明；开端', phonetic: '/dɔːn/', example: 'We set off at dawn.', example_meaning: '我们在黎明时分出发。' },
  { word: 'elite', meaning: 'n. 精英；adj. 杰出的', phonetic: '/eɪˈliːt/', example: 'Only the elite athletes made the team.', example_meaning: '只有精英运动员入选了队伍。' },
  { word: 'fancy', meaning: 'adj. 精致的；花哨的', phonetic: '/ˈfænsi/', example: 'She wore a fancy dress to the ball.', example_meaning: '她穿了一件精致的礼服去参加舞会。' },
  { word: 'glow', meaning: 'n./v. 发光；发热', phonetic: '/ɡloʊ/', example: 'The embers still glowed in the fireplace.', example_meaning: '余烬仍在壁炉中发光。' },
  { word: 'halo', meaning: 'n. 光环；光轮', phonetic: '/ˈheɪloʊ/', example: 'The saint was painted with a golden halo.', example_meaning: '圣徒被画上了金色的光环。' },
  { word: 'ivory', meaning: 'n. 象牙；adj. 象牙色的', phonetic: '/ˈaɪvəri/', example: 'The piano keys were made of ivory.', example_meaning: '钢琴键是用象牙做的。' },
  { word: 'jewel', meaning: 'n. 宝石；珠宝', phonetic: '/ˈdʒuːəl/', example: 'She wore a crown of jewels.', example_meaning: '她戴着珠宝皇冠。' },
  { word: 'keen', meaning: 'adj. 敏锐的；热衷的', phonetic: '/kiːn/', example: 'He has a keen interest in science.', example_meaning: '他对科学有浓厚的兴趣。' },
  { word: 'light', meaning: 'n. 光；灯；adj. 轻的', phonetic: '/laɪt/', example: 'The room was filled with soft light.', example_meaning: '房间里充满了柔和的光。' },
  { word: 'mirth', meaning: 'n. 欢乐；欢笑', phonetic: '/mɜːrθ/', example: 'The party was full of mirth.', example_meaning: '聚会上充满了欢笑。' },
  { word: 'novel', meaning: 'n. 小说；adj. 新颖的', phonetic: '/ˈnɑːvl/', example: 'She is writing a historical novel.', example_meaning: '她正在写一部历史小说。' },
  { word: 'oasis', meaning: 'n. 绿洲；宜人之地', phonetic: '/oʊˈeɪsɪs/', example: 'The town is an oasis of calm.', example_meaning: '这个小镇是一片宁静的绿洲。' },
];

function getBeijingDate() {
  const now = new Date();
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return beijing.toISOString().slice(0, 10);
}

function generateDailyWords() {
  const shuffled = [...FALLBACK_WORDS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 1);
}

exports.main = async (event, context) => {
  const today = getBeijingDate();
  console.log('[GetDailyWords] 查询日期:', today);

  try {
    const res = await db.collection('daily_words')
      .where({ date: today })
      .limit(1)
      .get();

    if (res.data.length > 0) {
      const record = res.data[0];
      console.log('[GetDailyWords] 命中记录:', record.words);
      return { code: 0, date: today, words: record.words };
    }

    // 无记录，自动生成并入库
    const words = generateDailyWords();
    await db.collection('daily_words').add({
      data: {
        date: today,
        words,
        create_time: db.serverDate(),
      }
    });
    console.log('[GetDailyWords] 自动生成并入库:', words);
    return { code: 0, date: today, words, generated: true };

  } catch (e) {
    console.error('[GetDailyWords] 数据库操作失败:', e);
    // 失败时返回兜底词，保证前端可用
    return { code: 0, date: today, words: FALLBACK_WORDS.slice(0, 1), fallback: true };
  }
};
