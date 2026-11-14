// 천자문.xlsx + 천자문_구절.xlsx → ../data.js 생성
// 사용법:
//   cd build
//   npm install
//   node parse-xlsx.mjs [천자문 엑셀경로] [구절 뜻 엑셀경로]
//
// 엑셀 구조(‘천자문 따라쓰기’ 시트):
//   A열 = 번호(1~1000), B열 = 한자, 다음 행 B열 = 훈음(예: 하늘 천)
//   C~G열의 따라쓰기 칸은 사용하지 않습니다.
//
// 구절 뜻 엑셀(‘Sheet1’):
//   구절마다 2행을 사용합니다.
//   첫 행 A~D = 한자 4자, E열 = 구절 뜻
//   다음 행 A~D = 훈음 (구절 뜻만 사용하고, 앱의 한자/독음은 천자문.xlsx를 따릅니다.)
//
// 1000자를 4자씩 묶어 250개 구절을 만들고,
// 각 글자는 개별 한자 카드로도 사용할 수 있게 함께 저장합니다.

import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_CANDIDATES = [
  path.resolve(__dirname, '../천자문.xlsx'),    // 저장소 안 (GitHub Actions)
  path.resolve(__dirname, '../../천자문.xlsx'), // 저장소 밖
];
const SRC = process.argv[2] || SOURCE_CANDIDATES.find((p) => fs.existsSync(p)) || SOURCE_CANDIDATES[0];
const PHRASE_SOURCE_CANDIDATES = [
  path.resolve(path.dirname(SRC), '천자문_구절.xlsx'),
  path.resolve(__dirname, '../천자문_구절.xlsx'),
  path.resolve(__dirname, '../../천자문_구절.xlsx'),
];
const PHRASE_SRC = process.argv[3] || PHRASE_SOURCE_CANDIDATES.find((p) => fs.existsSync(p)) || PHRASE_SOURCE_CANDIDATES[0];
const OUT = path.resolve(__dirname, '../data.js');

if (!fs.existsSync(SRC)) {
  console.error('엑셀 파일을 찾을 수 없습니다:', SRC);
  process.exit(1);
}

const wb = XLSX.readFile(SRC);
const ws = wb.Sheets['천자문 따라쓰기'] || wb.Sheets[wb.SheetNames[0]];
if (!ws) {
  console.error('시트를 찾을 수 없습니다:', SRC);
  process.exit(1);
}
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

const clean = (s) => String(s ?? '')
  .replace(/\r\n/g, '\n')
  .replace(/[ \t]+$/gm, '')
  .trim();

// 구절 뜻 엑셀에는 보이지 않는 문자(Zero-width space 등)가 섞여 있을 수 있습니다.
const cleanPhrase = (s) => clean(s)
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .replace(/\u00A0/g, ' ');

// ---------- 구절 뜻 읽기 ----------
if (!fs.existsSync(PHRASE_SRC)) {
  console.error('구절 뜻 엑셀을 찾을 수 없습니다:', PHRASE_SRC);
  process.exit(1);
}
const pwb = XLSX.readFile(PHRASE_SRC);
const pws = pwb.Sheets['Sheet1'] || pwb.Sheets[pwb.SheetNames[0]];
if (!pws) {
  console.error('구절 뜻 시트를 찾을 수 없습니다:', PHRASE_SRC);
  process.exit(1);
}
const prows = XLSX.utils.sheet_to_json(pws, { header: 1, defval: '' });

const phraseMeanings = [];
for (let i = 0; i < prows.length; i += 2) {
  const h = prows[i] || [];
  const u = prows[i + 1] || [];
  const hanja = h.slice(0, 4).map(cleanPhrase).join('');
  if (!hanja) continue;

  const no = phraseMeanings.length + 1;
  const hun = u.slice(0, 4).map(cleanPhrase);
  const meaning = cleanPhrase(h[4]);

  if ([...hanja].length !== 4) {
    console.error('구절 뜻 엑셀의 한자가 4자가 아닙니다:', no, hanja);
    process.exit(1);
  }
  if (hun.filter(Boolean).length !== 4) {
    console.error('구절 뜻 엑셀의 훈음 행이 올바르지 않습니다:', no, hanja);
    process.exit(1);
  }
  if (!meaning) {
    console.error('구절 뜻이 비어 있습니다:', no, hanja);
    process.exit(1);
  }
  phraseMeanings.push({ hanja, meaning });
}
if (phraseMeanings.length !== 250) {
  console.error('구절 뜻이 250개가 아닙니다:', phraseMeanings.length);
  process.exit(1);
}

// 사용자가 확인한 뜻 보정
const PHRASE_MEANING_FIXES = {
  33: (s) => s.includes('봉이 나무 위에서') ? s.replace('나무 위', '대나무 위') : s,
  145: (s) => s === '진헌공(晉獻公)이 우국의 길을 빌려 괵국(虢'
    ? '진헌공(晉獻公)이 우국의 길을 빌려 괵국(虢國)을 멸하고, 돌아오는 길에 우국도 멸함.'
    : s,
};
for (const [id, fix] of Object.entries(PHRASE_MEANING_FIXES)) {
  const idx = Number(id) - 1;
  if (phraseMeanings[idx]) phraseMeanings[idx].meaning = fix(phraseMeanings[idx].meaning);
}

// 번호 행 + 바로 다음 행의 훈음을 읽어 1000자를 추출
const items = [];
for (let i = 0; i < rows.length; i++) {
  const noText = clean(rows[i][0]);
  if (!/^\d+$/.test(noText)) continue;

  const no = Number(noText);
  const hanja = clean(rows[i][1]);
  const hun = clean((rows[i + 1] || [])[1]);
  if (!hanja || !hun) continue;

  const parts = hun.split(/\s+/);
  const reading = parts.pop();
  const meaning = parts.join(' ');

  items.push({ no, hanja, meaning, reading });
}

// ---------- 검증 ----------
if (items.length !== 1000) {
  console.error('한자 수가 1000자가 아닙니다:', items.length);
  process.exit(1);
}
for (let i = 0; i < items.length; i++) {
  const it = items[i];
  if (it.no !== i + 1) {
    console.error('번호가 연속되지 않습니다:', i + 1, '번째 =', it.no);
    process.exit(1);
  }
  if ([...it.hanja].length !== 1) {
    console.error('한자가 한 글자가 아닙니다:', it.no, it.hanja);
    process.exit(1);
  }
  if (!it.meaning || !it.reading) {
    console.error('훈음이 비어 있습니다:', it.no, it.hanja);
    process.exit(1);
  }
}

// ---------- 4자씩 구절로 묶기 ----------
const entries = [];
const charMap = new Map();

for (let i = 0; i < items.length; i += 4) {
  const group = items.slice(i, i + 4);
  if (group.length !== 4) {
    console.error('마지막 구절이 4자가 아닙니다:', group.map((x) => x.hanja).join(''));
    process.exit(1);
  }

  const id = entries.length + 1;
  const chars = group.map((x) => ({
    hanja: x.hanja,
    meaning: x.meaning,
    reading: x.reading,
  }));

  entries.push({
    id,
    type: 'classic',
    no: id,
    start: i + 1,
    end: i + 4,
    hanja: group.map((x) => x.hanja).join(''),
    meaning: '',
    phraseMeaning: phraseMeanings[id - 1].meaning,
    reading: group.map((x) => x.reading).join(''),
    chars,
  });

  group.forEach((x, j) => {
    if (!charMap.has(x.hanja)) {
      charMap.set(x.hanja, {
        hanja: x.hanja,
        meanings: [],
        readings: [],
        in: [],
        first: i + j + 1,
      });
    }
    const o = charMap.get(x.hanja);
    if (x.meaning && !o.meanings.includes(x.meaning)) o.meanings.push(x.meaning);
    if (x.reading && !o.readings.includes(x.reading)) o.readings.push(x.reading);
    o.in.push(id);
  });
}

const characters = [...charMap.values()];

const TYPE_LABEL = { classic: '천자문 구절' };

const data = {
  source: path.basename(SRC),
  phraseSource: path.basename(PHRASE_SRC),
  generated: new Date().toISOString(),
  counts: {
    entries: entries.length,
    characters: characters.length,
    classics: entries.length,
    totalChars: items.length,
    phraseMeanings: phraseMeanings.length,
  },
  typeLabel: TYPE_LABEL,
  entries,
  characters,
};

// 내용이 이전과 같으면 생성 시각을 유지해 불필요한 커밋을 막는다.
try {
  const prev = fs.readFileSync(OUT, 'utf8').match(/window\.CHEONJAMUN_DATA\s*=\s*(\{[\s\S]*\});\s*$/);
  if (prev) {
    const old = JSON.parse(prev[1]);
    const content = (o) => JSON.stringify({ ...o, generated: undefined });
    if (old.generated && content(old) === content(data)) data.generated = old.generated;
  }
} catch { /* 이전 파일이 없거나 형식이 다르면 무시 */ }

fs.writeFileSync(OUT,
  '// 자동 생성 파일 — ' + path.basename(SRC) + ' + ' + path.basename(PHRASE_SRC) + ' 에서 파싱됨\n'
  + '// 재생성: cd build && node parse-xlsx.mjs\n'
  + 'window.CHEONJAMUN_DATA = ' + JSON.stringify(data, null, 2) + ';\n', 'utf8');

console.log('entries:', entries.length, '/ characters:', characters.length, '/ totalChars:', items.length);
console.log('phrase meanings:', phraseMeanings.length, '/ source:', path.basename(PHRASE_SRC));
console.log('by type:', JSON.stringify(entries.reduce((a, e) => ((a[e.type] = (a[e.type] || 0) + 1), a), {})));
console.log('-> written', OUT);
