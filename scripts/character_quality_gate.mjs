#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DRAW_CALL_MAX = Number(process.env.PRARES_DRAW_CALL_MAX ?? 160);
const MATERIAL_MAX = Number(process.env.PRARES_MATERIAL_MAX ?? 64);
const TEXTURE_MAX_RES = Number(process.env.PRARES_TEXTURE_MAX_RES ?? 1024);
const TEXTURE_MAX_COUNT = Number(process.env.PRARES_TEXTURE_MAX_COUNT ?? 64);

const ROBOT_COMPONENT = path.join(ROOT, 'frontend/src/components/RobotCharacter.tsx');
const ASSET_ROOT = path.join(ROOT, 'frontend/public/assets');

const readText = (file) => fs.readFileSync(file, 'utf8');

const walkFiles = (dir) => {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
};

const readPngDimensions = (filePath) => {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 24) return null;
  const sig = '89504e470d0a1a0a';
  if (buf.subarray(0, 8).toString('hex') !== sig) return null;
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
};

const readJpegDimensions = (filePath) => {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < buf.length - 9) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buf[offset + 1];
    const size = (buf[offset + 2] << 8) + buf[offset + 3];
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return {
        height: (buf[offset + 5] << 8) + buf[offset + 6],
        width: (buf[offset + 7] << 8) + buf[offset + 8],
      };
    }
    if (size <= 0) break;
    offset += size + 2;
  }
  return null;
};

const getImageDimensions = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return readPngDimensions(filePath);
  if (ext === '.jpg' || ext === '.jpeg') return readJpegDimensions(filePath);
  return null;
};

const checkRobotBudget = () => {
  const code = readText(ROBOT_COMPONENT);
  const drawCallEstimate = (code.match(/<mesh\b/g) ?? []).length;
  const materialEstimate =
    (code.match(/<meshStandardMaterial\b/g) ?? []).length +
    (code.match(/<meshPhysicalMaterial\b/g) ?? []).length +
    (code.match(/<meshBasicMaterial\b/g) ?? []).length +
    (code.match(/<meshToonMaterial\b/g) ?? []).length;
  return { drawCallEstimate, materialEstimate };
};

const checkTextures = () => {
  const files = walkFiles(ASSET_ROOT).filter((f) => /\.(png|jpe?g)$/i.test(f));
  const violations = [];
  for (const file of files) {
    const dims = getImageDimensions(file);
    if (!dims) continue;
    if (dims.width > TEXTURE_MAX_RES || dims.height > TEXTURE_MAX_RES) {
      violations.push({
        file: path.relative(ROOT, file),
        width: dims.width,
        height: dims.height,
      });
    }
  }
  return { textureCount: files.length, violations };
};

const main = () => {
  const robot = checkRobotBudget();
  const texture = checkTextures();

  const failures = [];
  if (robot.drawCallEstimate > DRAW_CALL_MAX) {
    failures.push(`draw call estimate ${robot.drawCallEstimate} > ${DRAW_CALL_MAX}`);
  }
  if (robot.materialEstimate > MATERIAL_MAX) {
    failures.push(`material estimate ${robot.materialEstimate} > ${MATERIAL_MAX}`);
  }
  if (texture.textureCount > TEXTURE_MAX_COUNT) {
    failures.push(`texture count ${texture.textureCount} > ${TEXTURE_MAX_COUNT}`);
  }
  if (texture.violations.length > 0) {
    failures.push(
      `texture resolution violation(s): ${texture.violations
        .map((v) => `${v.file}(${v.width}x${v.height})`)
        .join(', ')}`,
    );
  }

  console.log('[quality-gate] robot draw-call estimate:', robot.drawCallEstimate);
  console.log('[quality-gate] robot material estimate:', robot.materialEstimate);
  console.log('[quality-gate] texture count:', texture.textureCount);
  if (texture.violations.length > 0) {
    console.log('[quality-gate] oversized textures:', texture.violations);
  }

  if (failures.length > 0) {
    console.error('[quality-gate] FAILED');
    for (const failure of failures) {
      console.error('-', failure);
    }
    process.exit(1);
  }
  console.log('[quality-gate] PASSED');
};

main();
