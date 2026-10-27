import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pixelmatch = require('pixelmatch');
const { PNG } = require('pngjs');

function crop(src, width, height) {
  if (src.width === width && src.height === height) return src;
  const out = new PNG({ width, height });
  PNG.bitblt(src, out, 0, 0, width, height, 0, 0);
  return out;
}

function fillRect(png, box) {
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(png.width, Math.ceil(box.x + box.width));
  const y1 = Math.min(png.height, Math.ceil(box.y + box.height));
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const index = (png.width * y + x) << 2;
      png.data[index] = 0;
      png.data[index + 1] = 0;
      png.data[index + 2] = 0;
      png.data[index + 3] = 255;
    }
  }
}

export function diffScreenshots(refBuffer, tgtBuffer, refMasks = [], tgtMasks = []) {
  const ref = PNG.sync.read(refBuffer);
  const tgt = PNG.sync.read(tgtBuffer);
  const width = Math.min(ref.width, tgt.width);
  const height = Math.min(ref.height, tgt.height);
  const refCrop = crop(ref, width, height);
  const tgtCrop = crop(tgt, width, height);
  for (const box of refMasks) fillRect(refCrop, box);
  for (const box of tgtMasks) fillRect(tgtCrop, box);
  const diff = new PNG({ width, height });
  const mismatched = pixelmatch(refCrop.data, tgtCrop.data, diff.data, width, height, {
    threshold: 0.1,
    includeAA: false
  });
  const union = Math.max(ref.width * ref.height, tgt.width * tgt.height, 1);
  const ratio = (mismatched + Math.abs(ref.width * ref.height - tgt.width * tgt.height)) / union;
  return {
    pixelMismatchRatio: ratio,
    diffPng: PNG.sync.write(diff)
  };
}
