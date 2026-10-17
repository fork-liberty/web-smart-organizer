/* 生成扩展图标（16/48/128 PNG）：蓝底 + 三条白色横杠（代表分类整理） */
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePng(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const bg = [11, 87, 208, 255];      // #0b57d0
  const white = [255, 255, 255, 255];
  const radius = Math.max(1, Math.round(size * 0.14));
  const barW = Math.round(size * 0.68);
  const barH = Math.max(1, Math.round(size * 0.07));
  const x0 = Math.round((size - barW) / 2);
  const barGap = Math.round(size * 0.09);
  const yStart = Math.round(size * 0.28);
  let row = 0;
  for (let y = 0; y < size; y++) {
    raw[row++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      // 圆角
      const dx = Math.max(0, radius - x, x - (size - 1 - radius));
      const dy = Math.max(0, radius - y, y - (size - 1 - radius));
      const inCorner = dx > 0 && dy > 0;
      const inside = !(inCorner && dx * dx + dy * dy > radius * radius);
      if (!inside) {
        raw[row++] = 0; raw[row++] = 0; raw[row++] = 0; raw[row++] = 0;
        continue;
      }
      // 三条白色横杠
      const inBar = (() => {
        for (let i = 0; i < 3; i++) {
          const yb = yStart + i * (barH + barGap);
          if (y >= yb && y < yb + barH && x >= x0 && x < x0 + barW) return true;
        }
        return false;
      })();
      const c = inBar ? white : bg;
      raw[row++] = c[0]; raw[row++] = c[1]; raw[row++] = c[2]; raw[row++] = c[3];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
  return png;
}

const outDir = path.join(__dirname, "icons");
fs.mkdirSync(outDir, { recursive: true });
for (const size of [16, 48, 128]) {
  fs.writeFileSync(path.join(outDir, "icon" + size + ".png"), makePng(size));
  console.log("icon" + size + ".png written");
}
