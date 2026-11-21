/* 천자문 1000자의 획순 데이터를 로컬 파일(stroke-data.js)로 만듭니다.
 *
 * 데이터 출처
 *  - hanzi-writer-data (Make Me a Hanzi / Arphic Public License)
 *    https://www.npmjs.com/package/hanzi-writer-data
 *  - Make Me a Hanzi graphics.txt (위 데이터의 원본, 같은 라이선스)
 *    https://github.com/skishore/makemeahanzi
 *  - hanzi-writer-data-jp (일부 누락 글자 보충, animCJK 유래)
 *    https://www.npmjs.com/package/@k1low/hanzi-writer-data-jp
 *
 * 실행: cd build && node make-stroke-data.mjs
 * (처음 실행 시 npm tarball / graphics.txt 를 내려받아 임시 폴더에 압축 해제합니다.)
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(os.tmpdir(), 'cheonjamun-stroke-build');
const OUT = path.join(ROOT, 'stroke-data.js');

const SOURCES = {
  hwd: {
    url: 'https://registry.npmjs.org/hanzi-writer-data/-/hanzi-writer-data-2.0.1.tgz',
    dir: 'hanzi-writer-data',
  },
  jp: {
    url: 'https://registry.npmjs.org/@k1low/hanzi-writer-data-jp/-/hanzi-writer-data-jp-0.8.0.tgz',
    dir: 'hanzi-writer-data-jp',
  },
  graphics: {
    url: 'https://raw.githubusercontent.com/skishore/makemeahanzi/master/graphics.txt',
    file: 'graphics.txt',
  },
};

function log(msg) { console.log('[stroke-data] ' + msg); }

async function download(url, dest) {
  if (fs.existsSync(dest)) return dest;
  log('downloading ' + url);
  const res = await fetch(url);
  if (!res.ok) throw new Error('download failed: ' + url + ' (' + res.status + ')');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

function unpackTgz(tgz, targetDir) {
  if (fs.existsSync(path.join(targetDir, 'package'))) return targetDir;
  fs.mkdirSync(targetDir, { recursive: true });
  // Windows 10+, macOS, Linux 모두 tar 사용 가능.
  // Windows의 tar.exe는 한자 파일명에서 경고를 내며 종료코드 1을 반환하지만 파일은 정상 추출됩니다.
  try {
    execFileSync('tar', ['-xzf', tgz, '-C', targetDir], { stdio: 'ignore' });
  } catch (e) {
    if (!fs.existsSync(path.join(targetDir, 'package'))) throw e;
  }
  return targetDir;
}

function walkJson(dir) {
  const found = new Map();
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const [k, v] of walkJson(p)) found.set(k, v);
    } else if (entry.name.endsWith('.json')) {
      const key = entry.name.slice(0, -5);
      if (!found.has(key)) found.set(key, p);
    }
  }
  return found;
}

function loadCharacter(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(raw.strokes) || !Array.isArray(raw.medians)) return null;
  // Hanzi Writer 에 필요한 최소 필드만 유지
  return { strokes: raw.strokes, medians: raw.medians };
}

function loadGraphics(file) {
  const map = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line) continue;
    const obj = JSON.parse(line.replace(/,$/, ''));
    if (obj.character && Array.isArray(obj.strokes) && Array.isArray(obj.medians)) {
      map.set(obj.character, { strokes: obj.strokes, medians: obj.medians });
    }
  }
  return map;
}

function appCharacters() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8'), ctx);
  return [...new Set(ctx.window.CHEONJAMUN_DATA.characters.map((c) => c.hanja))];
}

const chars = appCharacters();
log('target characters: ' + chars.length);

const hwdTgz = await download(SOURCES.hwd.url, path.join(TMP, 'hwd.tgz'));
const jpTgz = await download(SOURCES.jp.url, path.join(TMP, 'jp.tgz'));
const graphicsFile = await download(SOURCES.graphics.url, path.join(TMP, 'graphics.txt'));

const hwdDir = unpackTgz(hwdTgz, path.join(TMP, 'hwd'));
const jpDir = unpackTgz(jpTgz, path.join(TMP, 'jp'));
const hwdFiles = walkJson(hwdDir);
const jpFiles = walkJson(jpDir);
const graphics = loadGraphics(graphicsFile);
log('source data: hwd=' + hwdFiles.size + ', jp=' + jpFiles.size + ', makemeahanzi=' + graphics.size);

const result = {};
const missing = [];
const from = { hwd: 0, makemeahanzi: 0, jp: 0 };

for (const ch of chars) {
  let data = null;
  let source = '';
  if (hwdFiles.has(ch)) {
    data = loadCharacter(hwdFiles.get(ch));
    source = 'hwd';
  }
  if (!data && graphics.has(ch)) {
    data = graphics.get(ch);
    source = 'makemeahanzi';
  }
  if (!data && jpFiles.has(ch)) {
    data = loadCharacter(jpFiles.get(ch));
    source = 'jp';
  }
  if (data) {
    result[ch] = data;
    from[source] += 1;
  } else {
    missing.push(ch);
  }
}

const body = JSON.stringify(result);
fs.writeFileSync(OUT,
  '/* 자동 생성 파일 — build/make-stroke-data.mjs 로 재생성. 직접 수정 금지 */\n' +
  '/* 데이터 출처: hanzi-writer-data / Make Me a Hanzi / hanzi-writer-data-jp (ARPHICPL, licenses/) */\n' +
  'window.STROKE_DATA = ' + body + ';\n', 'utf8');

log('wrote ' + OUT + ' (' + (fs.statSync(OUT).size / 1024 / 1024).toFixed(2) + ' MB)');
log('source breakdown: ' + JSON.stringify(from));
log('no stroke data (' + missing.length + '): ' + missing.join(''));
