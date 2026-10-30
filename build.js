const fs = require('fs');
const path = require('path');

const FONTS_DIR = path.join(__dirname, 'fonts');
const HTML_FILE = path.join(__dirname, 'index.html');

// Read real font family/full name from the font file's binary metadata
function getFontName(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.length < 12) throw new Error('File too small');
    const numTables = buf.readUInt16BE(4);
    for (let i = 0; i < numTables; i++) {
      const tagOffset = 12 + i * 16;
      if (tagOffset + 16 > buf.length) break;
      const tag = buf.toString('utf8', tagOffset, tagOffset + 4);
      if (tag === 'name') {
        const tableOffset = buf.readUInt32BE(tagOffset + 8);
        if (tableOffset + 6 > buf.length) break;
        const count = buf.readUInt16BE(tableOffset + 2);
        const stringOffset = tableOffset + buf.readUInt16BE(tableOffset + 4);

        let fullName = null;
        let familyName = null;

        for (let j = 0; j < count; j++) {
          const rec = tableOffset + 6 + j * 12;
          if (rec + 12 > buf.length) break;
          const platformID = buf.readUInt16BE(rec);
          const nameID = buf.readUInt16BE(rec + 6);
          const length = buf.readUInt16BE(rec + 8);
          const strOffset = stringOffset + buf.readUInt16BE(rec + 10);

          if (strOffset + length > buf.length) continue;

          // nameID 4 = Full Name, nameID 1 = Family Name
          if (nameID === 4 || nameID === 1) {
            let str = '';
            if (platformID === 0 || platformID === 3) {
              str = buf.toString('utf16be', strOffset, strOffset + length);
            } else {
              str = buf.toString('latin1', strOffset, strOffset + length);
            }
            str = str.replace(/\0/g, '').trim();
            if (str && str.length > 0) {
              if (nameID === 4 && !fullName) fullName = str;
              if (nameID === 1 && !familyName) familyName = str;
            }
          }
        }
        if (fullName) return fullName;
        if (familyName) return familyName;
      }
    }
  } catch (e) {}

  // Fallback to filename without extension
  return path.basename(filePath, path.extname(filePath)).replace(/[_-]/g, ' ').trim();
}

function run() {
  console.log('--- SCANNING FONTS FOLDER ---');
  if (!fs.existsSync(FONTS_DIR)) {
    console.warn('fonts folder does not exist!');
    return;
  }

  // Only grab actual font files (ignores .DS_Store, .gitkeep, etc.)
  const files = fs.readdirSync(FONTS_DIR).filter(f => /\.(ttf|otf|woff|woff2)$/i.test(f));
  console.log(`Found ${files.length} real font files in /fonts`);

  const fontList = [];
  const cssRules = [];
  const seen = new Set();

  for (const file of files) {
    const filePath = path.join(FONTS_DIR, file);
    let fontName = getFontName(filePath);

    // Prevent duplicates
    if (seen.has(fontName)) {
      fontName = `${fontName} (${path.basename(file, path.extname(file))})`;
    }
    seen.add(fontName);

    const encodedFile = encodeURI(file);
    cssRules.push(`@font-face{font-family:"${fontName}";src:local("${fontName}"),url("fonts/${encodedFile}")}`);
    fontList.push(fontName);
  }

  // Sort alphabetically
  fontList.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  let html = fs.readFileSync(HTML_FILE, 'utf8');

  // Replace CSS @font-face rules with ONLY real existing fonts
  html = html.replace(
    /\/\* FONTS_CSS_START \*\/[\s\S]*?\/\* FONTS_CSS_END \*\//,
    `/* FONTS_CSS_START */\n${cssRules.join('\n')}\n/* FONTS_CSS_END */`
  );

  // Replace Javascript FONTS array with ONLY real existing fonts
  html = html.replace(
    /\/\* FONTS_LIST_START \*\/[\s\S]*?\/\* FONTS_LIST_END \*\//,
    `/* FONTS_LIST_START */\nconst FONTS = ${JSON.stringify(fontList)};\n/* FONTS_LIST_END */`
  );

  fs.writeFileSync(HTML_FILE, html, 'utf8');
  console.log(`Updated index.html with ${fontList.length} fonts:`);
  console.log(fontList);
  console.log('--- FONT SYNC COMPLETE ---');
}

run();