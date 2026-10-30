const fs = require('fs');
const path = require('path');

const FONTS_DIR = path.join(__dirname, 'fonts');
const HTML_FILE = path.join(__dirname, 'index.html');

// Google fonts defined via <link> in your HTML
const GOOGLE_FONTS = [
  'Amaranth',
  'Arya',
  'Birthstone',
  'Cinzel',
  'Ephesis',
  'Fredericka the Great',
  'IM Fell English SC',
  'Inter'
];

// Read font name directly from TTF/OTF metadata table
function getFontName(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    const numTables = buf.readUInt16BE(4);
    for (let i = 0; i < numTables; i++) {
      const tag = buf.toString('utf8', 12 + i * 16, 16 + i * 16);
      if (tag === 'name') {
        const offset = buf.readUInt32BE(12 + i * 16 + 8);
        const count = buf.readUInt16BE(offset + 2);
        const stringOffset = offset + buf.readUInt16BE(offset + 4);

        let fullName = null;
        let familyName = null;

        for (let j = 0; j < count; j++) {
          const rec = offset + 6 + j * 12;
          const platformID = buf.readUInt16BE(rec);
          const nameID = buf.readUInt16BE(rec + 6);
          const length = buf.readUInt16BE(rec + 8);
          const strOffset = stringOffset + buf.readUInt16BE(rec + 10);

          // nameID 4 = Full Name, nameID 1 = Family Name
          if (nameID === 4 || nameID === 1) {
            let str = '';
            if (platformID === 0 || platformID === 3) {
              str = buf.toString('utf16be', strOffset, strOffset + length);
            } else if (platformID === 1) {
              str = buf.toString('latin1', strOffset, strOffset + length);
            }
            str = str.replace(/\0/g, '').trim();
            if (str) {
              if (nameID === 4 && !fullName) fullName = str;
              if (nameID === 1 && !familyName) familyName = str;
            }
          }
        }
        if (fullName || familyName) return fullName || familyName;
      }
    }
  } catch (e) {}

  // Fallback to cleaned filename if font metadata cannot be parsed
  return path.basename(filePath, path.extname(filePath)).replace(/[-_]/g, ' ').trim();
}

function run() {
  if (!fs.existsSync(FONTS_DIR)) {
    console.warn('fonts folder does not exist!');
    return;
  }

  const files = fs.readdirSync(FONTS_DIR).filter(f => /\.(ttf|otf|woff|woff2)$/i.test(f));
  const localFonts = [];
  const cssRules = [];

  for (const file of files) {
    const filePath = path.join(FONTS_DIR, file);
    const fontName = getFontName(filePath);
    const encodedFile = encodeURIComponent(file).replace(/%2F/g, '/');

    cssRules.push(`@font-face{font-family:"${fontName}";src:local("${fontName}"),url("fonts/${encodedFile}")}`);
    localFonts.push(fontName);
  }

  const allFonts = [...new Set([...GOOGLE_FONTS, ...localFonts])].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );

  let html = fs.readFileSync(HTML_FILE, 'utf8');

  // Replace CSS @font-face block
  html = html.replace(
    /\/\* FONTS_CSS_START \*\/[\s\S]*?\/\* FONTS_CSS_END \*\//,
    `/* FONTS_CSS_START */\n${cssRules.join('')}\n/* FONTS_CSS_END */`
  );

  // Replace Javascript FONTS array
  html = html.replace(
    /\/\* FONTS_LIST_START \*\/[\s\S]*?\/\* FONTS_LIST_END \*\//,
    `/* FONTS_LIST_START */\nconst FONTS=${JSON.stringify(allFonts)};\n/* FONTS_LIST_END */`
  );

  fs.writeFileSync(HTML_FILE, html, 'utf8');
  console.log(`Successfully synced ${allFonts.length} fonts into index.html!`);
}

run();