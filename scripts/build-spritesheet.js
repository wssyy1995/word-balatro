const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function buildSpritesheet(groupNum, cols = 4) {
  const inputDir = path.join(__dirname, '../images/witch', `witch_guide_${groupNum}`);
  const outputDir = path.join(__dirname, '../images/witch');
  const backupDir = path.join(outputDir, `witch_guide_${groupNum}_frames_backup`);
  
  if (!fs.existsSync(inputDir)) {
    console.log(`目录不存在: ${inputDir}`);
    return;
  }
  
  const files = fs.readdirSync(inputDir)
    .filter(f => f.endsWith('.png') && !f.includes('spritesheet'))
    .sort((a, b) => parseInt(a) - parseInt(b));
  
  if (files.length === 0) {
    console.log(`没有图片: ${inputDir}`);
    return;
  }
  
  console.log(`[build] witch_guide_${groupNum}: ${files.length} 帧`);
  
  // 读取第一帧获取尺寸
  const firstFrame = await sharp(path.join(inputDir, files[0])).metadata();
  const frameW = firstFrame.width;
  const frameH = firstFrame.height;
  
  const rows = Math.ceil(files.length / cols);
  const sheetW = frameW * cols;
  const sheetH = frameH * rows;
  
  console.log(`[build] 精灵图尺寸: ${sheetW}x${sheetH} (${cols}x${rows})`);
  
  // 创建空白画布
  const composite = [];
  const frameCoords = [];
  
  for (let i = 0; i < files.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * frameW;
    const y = row * frameH;
    
    composite.push({
      input: path.join(inputDir, files[i]),
      left: x,
      top: y,
    });
    
    frameCoords.push({ x, y, w: frameW, h: frameH });
  }
  
  const outputPath = path.join(inputDir, `spritesheet.png`);
  
  await sharp({
    create: {
      width: sheetW,
      height: sheetH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composite)
    .png()
    .toFile(outputPath);
  
  // 生成坐标配置 JSON
  const configPath = path.join(inputDir, `spritesheet.json`);
  const config = {
    group: groupNum,
    frameCount: files.length,
    frameW,
    frameH,
    cols,
    rows,
    sheetW,
    sheetH,
    frameCoords,
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  
  // 备份原始单帧到独立目录，上传目录只保留精灵图
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
  files.forEach(f => {
    const src = path.join(inputDir, f);
    const dst = path.join(backupDir, f);
    fs.renameSync(src, dst);
  });
  
  const stats = fs.statSync(outputPath);
  console.log(`[build] 输出: ${outputPath} (${(stats.size / 1024).toFixed(1)} KB)`);
  console.log(`[build] 配置: ${configPath}`);
  console.log(`[build] 单帧已备份到: ${backupDir}`);
}

// 构建 witch_guide_4
buildSpritesheet(4, 4).catch(console.error);
