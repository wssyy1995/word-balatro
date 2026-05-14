const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '..', 'raw_words', 'expand_words.csv');
const outPath = path.join(__dirname, '..', 'js', 'expand_words.js');

function parseCSVLine(line) {
  // 简单 CSV 解析：处理引号包裹的字段
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

const entries = [];
const seen = new Set();
let dupCount = 0;
let skipCount = 0;

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  
  const parts = parseCSVLine(line);
  if (parts.length < 2) {
    skipCount++;
    continue;
  }
  
  const word = parts[0].toLowerCase().trim();
  let meaning = parts.slice(1).join(',').trim();
  
  // 去除 meaning 首尾的引号
  if (meaning.startsWith('"') && meaning.endsWith('"')) {
    meaning = meaning.slice(1, -1);
  }
  
  if (!word || !meaning) {
    skipCount++;
    continue;
  }
  
  if (seen.has(word)) {
    dupCount++;
    continue;
  }
  
  seen.add(word);
  entries.push([word, meaning]);
}

// 生成 JS 文件，按 word 长度分组以便阅读
entries.sort((a, b) => a[0].length - b[0].length || a[0].localeCompare(b[0]));

let output = `// ===== 扩展本地单词库（含中文释义） =====\n`;
output += `// 格式: Map<word, {meaning: string}>\n`;
output += `// 数据来源: 初中/高中/四级/六级/考研/雅思/SAT 词库 + compromise 变形生成\n`;
output += `// 总词条数: ${entries.length}\n`;
output += `const EXPAND_WORD_DATA = new Map([\n`;

let currentLen = 0;
for (const [word, meaning] of entries) {
  if (word.length !== currentLen) {
    currentLen = word.length;
    output += `  // ===== ${currentLen} 字母单词 =====\n`;
  }
  // 转义单引号和反斜杠
  const safeMeaning = meaning.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  output += `  ['${word}', '${safeMeaning}'],\n`;
}

output += `]);\n\nmodule.exports = { EXPAND_WORD_DATA };\n`;

fs.writeFileSync(outPath, output, 'utf-8');

console.log(`✅ 生成完成: ${outPath}`);
console.log(`   总词条: ${entries.length}`);
console.log(`   跳过行: ${skipCount}`);
console.log(`   去重数: ${dupCount}`);
