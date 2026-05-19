const fs = require('fs');
const path = require('path');
const nlp = require('compromise');

const csvPath = path.join(__dirname, '..', 'raw_words', 'expand_words.csv');
const wordsPath = path.join(__dirname, '..', 'js', 'words.js');

const { WORD_DATA } = require(wordsPath);

// 已有单词集合
const existingWords = new Set();
for (const word of WORD_DATA.keys()) existingWords.add(word);

// 变形标记
const DERIVATIVE_MARKERS = ['[三单]', '的过去式', '的现在分词', '的复数', '的复数形式'];
function isDerivativeMeaning(meaning) {
  return DERIVATIVE_MARKERS.some(m => meaning.includes(m));
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

// 判断是否为动词原形（compromise + 词性前缀双重判断）
function isVerbBase(word, meaning) {
  // 1. compromise 识别为动词 Infinitive
  const doc = nlp(word);
  const tags = doc.out('tags');
  const isInfinitive = tags.length > 0 && tags[0][word] && tags[0][word].includes('Infinitive');
  
  // 2. meaning 中有动词词性标记
  const hasVerbPrefix = /^(v|vt|vi|n&v|v&n|n&vi|n&vt|vt&n|vi&n|modal|aux)/.test(meaning);
  
  return isInfinitive || hasVerbPrefix;
}

// 收集所有动词原形
const verbBases = [];

// 1. 从 WORD_DATA
for (const [word, info] of WORD_DATA) {
  const meaning = info.meaning || '';
  if (isVerbBase(word, meaning)) {
    verbBases.push({ word, meaning });
  }
}

// 2. 从 expand_words.csv（只取非变形词条）
const lines = fs.readFileSync(csvPath, 'utf-8').split('\n');
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  const parts = parseCSVLine(line);
  if (parts.length < 2) continue;
  const word = parts[0].toLowerCase().trim();
  let meaning = parts.slice(1).join(',').trim();
  if (meaning.startsWith('"') && meaning.endsWith('"')) meaning = meaning.slice(1, -1);
  if (!word || !meaning) continue;
  existingWords.add(word);
  
  if (!isDerivativeMeaning(meaning) && isVerbBase(word, meaning)) {
    verbBases.push({ word, meaning });
  }
}

// 不规则三单
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
  if (irregularThird[word]) return irregularThird[word];
  if (word.endsWith('ch') || word.endsWith('sh') || word.endsWith('s') || word.endsWith('x') || word.endsWith('z') || word.endsWith('o')) {
    return word + 'es';
  }
  if (word.endsWith('y') && word.length > 1 && isConsonant(word[word.length - 2])) {
    return word.slice(0, -1) + 'ies';
  }
  return word + 's';
}

const thirdPersonEntries = [];
let dupCount = 0;
let sameCount = 0;

for (const { word, meaning } of verbBases) {
  const third = generateThirdPerson(word);
  if (!third) continue;
  if (third === word) { sameCount++; continue; }
  if (existingWords.has(third)) { dupCount++; continue; }
  
  existingWords.add(third);
  
  let posPrefix = '';
  const posMatch = meaning.match(/^([a-z&]+\.)/);
  if (posMatch) posPrefix = posMatch[1] + ' ';
  
  const thirdMeaning = posPrefix + '[三单] ' + meaning.replace(/^[a-z&]+\.\s*/, '');
  thirdPersonEntries.push({ word: third, meaning: thirdMeaning });
}

console.log(`动词原形总数: ${verbBases.length}`);
console.log(`三单=原形(跳过): ${sameCount}`);
console.log(`去重(已存在): ${dupCount}`);
console.log(`新增三单词条: ${thirdPersonEntries.length}`);

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
