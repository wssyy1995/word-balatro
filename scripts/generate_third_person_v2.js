const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '..', 'raw_words', 'expand_words.csv');
const wordsPath = path.join(__dirname, '..', 'js', 'words.js');

// 已有的单词集合（用于去重）
const existingWords = new Set();

// 从 words.js 读取 WORD_DATA
const { WORD_DATA } = require(wordsPath);
for (const word of WORD_DATA.keys()) {
  existingWords.add(word);
}

// 变形标记：包含这些说明该词条本身已是变形，不应再生成三单
const DERIVATIVE_MARKERS = ['[三单]', '的过去式', '的现在分词', '的复数', '的复数形式'];

function isDerivativeMeaning(meaning) {
  return DERIVATIVE_MARKERS.some(m => meaning.includes(m));
}

// 判断是否为动词词性前缀
function isVerbPrefix(meaning) {
  return /^(v|vt|vi|n&v|v&n|n&vi|n&vt|vt&n|vi&n|modal|aux)/.test(meaning);
}

// 解析 CSV
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

// 收集所有动词原形
const verbBases = []; // [{word, meaning, source}]

// 1. 从 WORD_DATA 收集
for (const [word, info] of WORD_DATA) {
  const posHasVerb = info.pos && info.pos.includes('v');
  const meaningHasVerb = info.meaning && /vt\.|vi\.|v\./.test(info.meaning);
  if (posHasVerb || meaningHasVerb) {
    verbBases.push({ word, meaning: info.meaning, source: 'WORD_DATA' });
  }
}

// 2. 从 expand_words.csv 收集
const lines = fs.readFileSync(csvPath, 'utf-8').split('\n');
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
  
  // 只取动词原形：是动词词性且不是已有变形
  if (isVerbPrefix(meaning) && !isDerivativeMeaning(meaning)) {
    verbBases.push({ word, meaning, source: 'expand' });
  }
}

// 不规则动词三单映射
const irregularThird = {
  'have': 'has',
  'be': 'is',
  'do': 'does',
  'go': 'goes',
};

function isConsonant(ch) {
  return 'bcdfghjklmnpqrstvwxz'.includes(ch.toLowerCase());
}

function generateThirdPerson(word) {
  // 不规则
  if (irregularThird[word]) {
    return irregularThird[word];
  }
  
  // 规则
  if (word.endsWith('ch') || word.endsWith('sh') || word.endsWith('s') || word.endsWith('x') || word.endsWith('z') || word.endsWith('o')) {
    return word + 'es';
  }
  if (word.endsWith('y') && word.length > 1 && isConsonant(word[word.length - 2])) {
    return word.slice(0, -1) + 'ies';
  }
  return word + 's';
}

const thirdPersonEntries = [];
let skipIrregular = 0;
let dupCount = 0;
let alreadyThirdCount = 0;

for (const { word, meaning, source } of verbBases) {
  const third = generateThirdPerson(word);
  if (!third) continue;
  
  // 如果生成的三单和原形一样（如 is→is），跳过
  if (third === word) {
    alreadyThirdCount++;
    continue;
  }
  
  if (existingWords.has(third)) {
    dupCount++;
    continue;
  }
  
  existingWords.add(third);
  
  // 构建三单的 meaning
  let posPrefix = '';
  const posMatch = meaning.match(/^([a-z&]+\.)/);
  if (posMatch) posPrefix = posMatch[1] + ' ';
  
  const thirdMeaning = posPrefix + '[三单] ' + meaning.replace(/^[a-z&]+\.\s*/, '');
  thirdPersonEntries.push({ word: third, meaning: thirdMeaning });
}

console.log(`动词原形总数: ${verbBases.length} (WORD_DATA + expand)`);
console.log(`已是三单(原形=三单): ${alreadyThirdCount}`);
console.log(`去重(已存在): ${dupCount}`);
console.log(`新增三单词条: ${thirdPersonEntries.length}`);

// 追加到 CSV
if (thirdPersonEntries.length > 0) {
  const appendLines = thirdPersonEntries.map(e => {
    let m = e.meaning;
    if (m.includes(',') || m.includes('"')) {
      m = '"' + m.replace(/"/g, '""') + '"';
    }
    return `${e.word},${m}`;
  });
  fs.appendFileSync(csvPath, '\n' + appendLines.join('\n') + '\n', 'utf-8');
  console.log(`✅ 已追加到 ${csvPath}`);
}

console.log('\n请运行: node scripts/build_expand_words.js');
