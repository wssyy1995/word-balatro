const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '..', 'raw_words', 'expand_words.csv');

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

function trimMeaning(meaning) {
  if (!meaning) return '';
  const matches = [...meaning.matchAll(/([a-z&]+\.\s*)/g)];
  if (matches.length === 0) return meaning;

  const segments = [];
  for (let i = 0; i < matches.length; i++) {
    const pos = matches[i][1];
    const start = matches[i].index + pos.length;
    const end = i + 1 < matches.length ? matches[i + 1].index : meaning.length;
    let content = meaning.slice(start, end).trim();

    const idx = content.indexOf('；');
    if (idx !== -1) {
      content = content.slice(0, idx).trim();
    } else {
      const idx2 = content.indexOf(';');
      if (idx2 !== -1) content = content.slice(0, idx2).trim();
    }

    segments.push(pos + content);
  }
  return segments.join(' ');
}

function escapeCSVField(field) {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return '"' + field.replace(/"/g, '""') + '"';
  }
  return field;
}

const lines = fs.readFileSync(csvPath, 'utf-8').split('\n');
const output = [lines[0]]; // 保留表头
let changed = 0;

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) {
    output.push('');
    continue;
  }
  const parts = parseCSVLine(line);
  if (parts.length < 2) {
    output.push(line);
    continue;
  }
  const word = parts[0];
  let meaning = parts.slice(1).join(',');
  if (meaning.startsWith('"') && meaning.endsWith('"')) {
    meaning = meaning.slice(1, -1);
  }

  const trimmed = trimMeaning(meaning);
  if (trimmed !== meaning) changed++;
  output.push(word + ',' + escapeCSVField(trimmed));
}

fs.writeFileSync(csvPath, output.join('\n') + '\n', 'utf-8');
console.log(`✅ 处理完成: ${csvPath}`);
console.log(`   总词条: ${lines.length - 1}`);
console.log(`   精简数: ${changed}`);
console.log('\n请运行: node scripts/build_expand_words.js');
