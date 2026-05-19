const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '..', 'raw_words', 'expand_words.csv');
const wordsPath = path.join(__dirname, '..', 'js', 'words.js');

// 已有的单词集合（用于去重）
const existingWords = new Set();

// 从 words.js 读取
const { WORD_DATA } = require(wordsPath);
for (const word of WORD_DATA.keys()) {
  existingWords.add(word);
}

// 解析 CSV，收集动词和已有词
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

const lines = fs.readFileSync(csvPath, 'utf-8').split('\n');
const verbs = []; // [{word, meaning}]

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  const parts = parseCSVLine(line);
  if (parts.length < 2) continue;
  const word = parts[0].toLowerCase().trim();
  let meaning = parts.slice(1).join(',').trim();
  if (meaning.startsWith('"') && meaning.endsWith('"')) {
    meaning = meaning.slice(1, -1);
  }
  if (!word || !meaning) continue;
  existingWords.add(word);
  
  // 判断是否为动词：meaning 开头包含 v. 或 vt. 或 vi. 或 modal. 或 aux.
  if (/^(v|vt|vi|n&v|v&n|n&vi|n&vt|vt&n|vi&n|modal|aux)/.test(meaning)) {
    verbs.push({ word, meaning });
  }
}

// 不规则动词三单映射
const irregularThird = {
  'have': 'has',
  'be': 'is',      // am/are 已经存在
  'do': 'does',
  'go': 'goes',
};

function isConsonant(ch) {
  return 'bcdfghjklmnpqrstvwxz'.includes(ch.toLowerCase());
}

function isVowel(ch) {
  return 'aeiou'.includes(ch.toLowerCase());
}

function generateThirdPerson(word) {
  // 不规则动词
  if (irregularThird[word]) {
    return irregularThird[word];
  }
  
  // 已经是三单形式（简单判断：以 s/es 结尾的常见三单）
  // 这些不生成
  const alreadyThird = new Set(['has', 'is', 'was', 'does', 'goes', 'says', 'eats', 'makes', 'takes', 'runs', 'gives', 'lives', 'comes', 'becomes', 'sees', 'knows', 'gets', 'puts', 'reads', 'sits', 'sets', 'lets', 'hits', 'fits', 'cuts']);
  if (alreadyThird.has(word)) return null;
  
  // 规则生成
  if (word.endsWith('ch') || word.endsWith('sh') || word.endsWith('s') || word.endsWith('x') || word.endsWith('z') || word.endsWith('o')) {
    return word + 'es';
  }
  
  if (word.endsWith('y') && word.length > 1 && isConsonant(word[word.length - 2])) {
    return word.slice(0, -1) + 'ies';
  }
  
  // 一般情况
  return word + 's';
}

const thirdPersonEntries = [];
let skipCount = 0;
let dupCount = 0;
let irregularCount = 0;

for (const { word, meaning } of verbs) {
  const third = generateThirdPerson(word);
  if (!third) {
    skipCount++;
    continue;
  }
  if (existingWords.has(third)) {
    dupCount++;
    continue;
  }
  
  existingWords.add(third);
  
  // 构建三单的 meaning：提取原词性前缀，加上 [三单] 标记
  let posPrefix = '';
  const posMatch = meaning.match(/^([a-z&]+\.)/);
  if (posMatch) posPrefix = posMatch[1] + ' ';
  
  const thirdMeaning = posPrefix + '[三单] ' + meaning.replace(/^[a-z&]+\.\s*/, '');
  thirdPersonEntries.push({ word: third, meaning: thirdMeaning });
  
  if (irregularThird[word]) irregularCount++;
}

console.log(`动词原形总数: ${verbs.length}`);
console.log(`跳过(已是三单/无法生成): ${skipCount}`);
console.log(`去重(已存在): ${dupCount}`);
console.log(`不规则三单: ${irregularCount}`);
console.log(`新增三单词条: ${thirdPersonEntries.length}`);

// 追加到 CSV
if (thirdPersonEntries.length > 0) {
  const appendLines = thirdPersonEntries.map(e => {
    // 如果 meaning 包含逗号或引号，需要引号包裹
    let m = e.meaning;
    if (m.includes(',') || m.includes('"')) {
      m = '"' + m.replace(/"/g, '""') + '"';
    }
    return `${e.word},${m}`;
  });
  fs.appendFileSync(csvPath, '\n' + appendLines.join('\n') + '\n', 'utf-8');
  console.log(`✅ 已追加到 ${csvPath}`);
}

// 重新生成 expand_words.js
console.log('请运行 node scripts/build_expand_words.js 重新生成 JS 模块');
