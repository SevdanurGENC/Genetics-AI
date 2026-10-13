/* dna.js — dna_goruntu.py'nin JavaScript karşılığı: CGR noktaları, FCGR, gen ailesi tahmini */
(function (global) {
  "use strict";
  const KOSE = { A: [0, 0], C: [0, 1], G: [1, 1], T: [1, 0] };

  function temizle(s) { return String(s || "").toUpperCase().replace(/^>.*$/gm, "").replace(/[\s\d]/g, ""); }

  function cgrNoktalari(s) {
    let x = 0.5, y = 0.5; const out = [];
    for (const h of temizle(s)) { const k = KOSE[h]; if (!k) continue; x = (x + k[0]) / 2; y = (y + k[1]) / 2; out.push([x, y]); }
    return out;
  }

  function fcgr(s, k) {
    s = temizle(s); const n = 1 << k, m = new Float64Array(n * n);
    let sonGecersiz = -1;
    for (let i = 0; i < s.length; i++) {
      if (!KOSE[s[i]]) sonGecersiz = i;
      if (i - sonGecersiz < k) continue;
      let px = 0, py = 0;
      for (let j = 0; j < k; j++) { const c = KOSE[s[i - k + 1 + j]]; px |= c[0] << j; py |= c[1] << j; }
      m[(n - 1 - py) * n + px] += 1;
    }
    return m;
  }

  let W = null, B = null;
  function hazirla() {
    if (W) return;
    const dec = function (b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Float32Array(u.buffer); };
    W = dec(global.DNA_MODEL.W); B = dec(global.DNA_MODEL.b);
  }

  function tahmin(s) {
    hazirla();
    const M = global.DNA_MODEL, C = M.siniflar.length, f = fcgr(s, M.k), N = f.length;
    let top = 0; for (let i = 0; i < N; i++) top += f[i];
    const z = new Float64Array(N); for (let i = 0; i < N; i++) z[i] = f[i] / Math.max(top, 1) * 4096;
    const logit = new Float64Array(C);
    for (let c = 0; c < C; c++) logit[c] = B[c];
    for (let i = 0; i < N; i++) { if (z[i] === 0) continue; for (let c = 0; c < C; c++) logit[c] += z[i] * W[i * C + c]; }
    let mx = -Infinity; for (const v of logit) mx = Math.max(mx, v);
    const p = Array.from(logit, function (v) { return Math.exp(v - mx); }), sp = p.reduce(function (a, b) { return a + b; }, 0);
    const olasilik = p.map(function (v) { return v / sp; });
    let en = 0; for (let c = 1; c < C; c++) if (olasilik[c] > olasilik[en]) en = c;
    // Açıklama: tahmin edilen sınıf lehine her 6-mer'in katkısı (sınıf ortalamasına göre)
    const katki = new Float64Array(N);
    for (let i = 0; i < N; i++) { if (z[i] === 0) continue; let ort = 0; for (let c = 0; c < C; c++) ort += W[i * C + c]; ort /= C; katki[i] = z[i] * (W[i * C + en] - ort); }
    return { olasilik: olasilik, sinif: en, fcgr: f, katki: katki, uzunluk: temizle(s).length, kmerSayisi: top };
  }

  global.DNA = { temizle: temizle, cgrNoktalari: cgrNoktalari, fcgr: fcgr, tahmin: tahmin };
})(typeof window !== "undefined" ? window : globalThis);
