/* karyotip.js — kromozom_isleme.py'nin birebir JavaScript karşılığı */
(function (global) {
  "use strict";
  const KH = 80, KW = 24, MIN_ALAN = 25, CEKIRDEK_ALAN = 1200, CEKIRDEK_UZAMA = 1.8, KUME_ALAN = 1000;
  const TIPLER = []; for (let i = 1; i <= 22; i++) TIPLER.push(String(i)); TIPLER.push("X", "Y");

  // PIL convert("L") ile aynı tamsayı formülü
  function griYap(img) {
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data, g = new Uint8Array(c.width * c.height);
    for (let i = 0; i < g.length; i++) g[i] = (d[4 * i] * 19595 + d[4 * i + 1] * 38470 + d[4 * i + 2] * 7471 + 0x8000) >> 16;
    return { g: g, H: c.height, W: c.width };
  }

  function bulaniklastir(a, H, W) {
    const o = new Float64Array(H * W);
    for (let i = 0; i < H; i++) for (let j = 0; j < W; j++) {
      let s = 0;
      for (let di = -1; di <= 1; di++) { const ii = Math.min(H - 1, Math.max(0, i + di));
        for (let dj = -1; dj <= 1; dj++) { const jj = Math.min(W - 1, Math.max(0, j + dj)); s += a[ii * W + jj]; } }
      o[i * W + j] = s / 9;
    }
    return o;
  }

  function otsu(b) {
    const hist = new Float64Array(256);
    for (let i = 0; i < b.length; i++) hist[Math.min(255, Math.max(0, Math.floor(b[i])))]++;
    let toplam = 0, topT = 0; for (let t = 0; t < 256; t++) { toplam += hist[t]; topT += t * hist[t]; }
    let w0 = 0, s0 = 0, enIyi = -1, esik = 0;
    for (let t = 0; t < 256; t++) {
      w0 += hist[t]; s0 += t * hist[t]; const w1 = toplam - w0;
      if (w0 === 0 || w1 === 0) continue;
      const m0 = s0 / w0, m1 = (topT - s0) / w1, v = w0 * w1 * (m0 - m1) * (m0 - m1);
      if (v > enIyi) { enIyi = v; esik = t; }
    }
    return esik;
  }

  function nesneleriBul(g, H, W) {
    const b = bulaniklastir(g, H, W), t = otsu(b);
    const etiket = new Int32Array(H * W), yigin = new Int32Array(H * W), nesneler = [];
    let no = 0;
    for (let s = 0; s < H * W; s++) {
      if (etiket[s] || b[s] > t) continue;
      no++; let ust = 0; const pik = [];
      yigin[ust++] = s; etiket[s] = no;
      while (ust) {
        const p = yigin[--ust], i = (p / W) | 0, j = p - i * W; pik.push(p);
        const kom = [i > 0 ? p - W : -1, i < H - 1 ? p + W : -1, j > 0 ? p - 1 : -1, j < W - 1 ? p + 1 : -1];
        for (const q of kom) if (q >= 0 && !etiket[q] && b[q] <= t) { etiket[q] = no; yigin[ust++] = q; }
      }
      const alan = pik.length;
      if (alan < MIN_ALAN) continue;
      let cy = 0, cx = 0, y0 = H, y1 = 0, x0 = W, x1 = 0;
      for (const p of pik) { const i = (p / W) | 0, j = p - i * W; cy += i; cx += j; if (i < y0) y0 = i; if (i > y1) y1 = i; if (j < x0) x0 = j; if (j > x1) x1 = j; }
      cy /= alan; cx /= alan;
      let syy = 0, sxx = 0, sxy = 0;
      for (const p of pik) { const i = (p / W) | 0, j = p - i * W; syy += (i - cy) * (i - cy); sxx += (j - cx) * (j - cx); sxy += (i - cy) * (j - cx); }
      syy /= alan; sxx /= alan; sxy /= alan;
      const fi = 0.5 * Math.atan2(2 * sxy, syy - sxx), yarim = (syy + sxx) / 2, kok = Math.sqrt(((syy - sxx) / 2) ** 2 + sxy * sxy);
      const uzama = Math.sqrt((yarim + kok) / Math.max(yarim - kok, 1e-6));
      const tur = alan > CEKIRDEK_ALAN && uzama < CEKIRDEK_UZAMA ? "cekirdek" : (alan > KUME_ALAN ? "kume" : "kromozom");
      nesneler.push({ no: no, alan: alan, cy: cy, cx: cx, aci: fi, uzama: uzama, tur: tur, bbox: [y0, x0, y1 + 1, x1 + 1] });
    }
    return { etiket: etiket, nesneler: nesneler, esik: t };
  }

  function kesitAl(g, H, W, etiket, n) {
    const c = Math.cos(n.aci), s = Math.sin(n.aci), k = new Float32Array(KH * KW);
    const D = function (y, x) { return (y >= 0 && y < H && x >= 0 && x < W) ? Math.min(1, Math.max(0, (255 - g[y * W + x]) / 255)) : 0; };
    let mx = 0;
    for (let i = 0; i < KH; i++) for (let j = 0; j < KW; j++) {
      const v = i - (KH - 1) / 2, u = j - (KW - 1) / 2;
      const sy = n.cy + v * c - u * s, sx = n.cx + v * s + u * c;
      const y0 = Math.floor(sy), x0 = Math.floor(sx), fy = sy - y0, fx = sx - x0;
      const deger = D(y0, x0) * (1 - fy) * (1 - fx) + D(y0, x0 + 1) * (1 - fy) * fx + D(y0 + 1, x0) * fy * (1 - fx) + D(y0 + 1, x0 + 1) * fy * fx;
      const yr = Math.round(sy), xr = Math.round(sx);
      const ait = yr >= 0 && yr < H && xr >= 0 && xr < W && etiket[yr * W + xr] === n.no;
      const v2 = ait ? deger : 0; k[i * KW + j] = v2; if (v2 > mx) mx = v2;
    }
    if (mx > 0) for (let i = 0; i < k.length; i++) k[i] /= mx;
    return k;
  }

  function siniflariAta(P) {
    const n = P.length, kap = []; for (let k = 0; k < 24; k++) kap.push(k === 23 ? 1 : 2);
    const atama = new Array(n).fill(-1), ciftler = [];
    for (let i = 0; i < n; i++) for (let k = 0; k < 24; k++) if (P[i][k] >= 0.10) ciftler.push([P[i][k], i, k]);
    ciftler.sort(function (a, b) { return b[0] - a[0] || b[1] - a[1] || b[2] - a[2]; });
    for (const [, i, k] of ciftler) if (atama[i] < 0 && kap[k] > 0) { atama[i] = k; kap[k]--; }
    for (let i = 0; i < n; i++) if (atama[i] < 0) { let b = 0; for (let k = 1; k < 24; k++) if (P[i][k] > P[i][b]) b = k; atama[i] = b; }
    return atama;
  }

  function yorumla(atama, kume) {
    const sayi = new Array(24).fill(0); atama.forEach(function (k) { sayi[k]++; });
    const cins = "X".repeat(sayi[22]) + "Y".repeat(sayi[23]), bulgu = [];
    for (let k = 0; k < 22; k++) { if (sayi[k] === 3) bulgu.push("+" + TIPLER[k]); if (sayi[k] === 1) bulgu.push("-" + TIPLER[k]); }
    const formul = atama.length + "," + cins + (bulgu.length ? "," + bulgu.join(",") : "");
    const adlar = { "+21": "Down sendromu (trizomi 21) ile uyumlu", "+18": "Edwards sendromu (trizomi 18) ile uyumlu", "+13": "Patau sendromu (trizomi 13) ile uyumlu" };
    const yorum = bulgu.map(function (b) { return adlar[b] || (b + " sayısal anomali"); });
    if (cins === "X") yorum.push("Turner sendromu (45,X) ile uyumlu");
    if (cins === "XXY") yorum.push("Klinefelter sendromu (47,XXY) ile uyumlu");
    if (!yorum.length && atama.length === 46) yorum.push("Sayısal anomali saptanmadı");
    if (kume) yorum.push("Dikkat: " + kume + " kümelenmiş/üst üste binmiş bölge sayılamadı");
    return { formul: formul, yorum: yorum, sayi: sayi };
  }

  global.Karyotip = { griYap: griYap, nesneleriBul: nesneleriBul, kesitAl: kesitAl, siniflariAta: siniflariAta, yorumla: yorumla, TIPLER: TIPLER, KH: KH, KW: KW };
})(typeof window !== "undefined" ? window : globalThis);
