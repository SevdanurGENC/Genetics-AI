/*
 * yzmotor.js — Keras'ta eğitilmiş evrişimli ağları (küçük CNN'ler ve MobileNetV2 gibi
 * hazır mimariler) telefonda/tarayıcıda, hiçbir dış kütüphane ve internet olmadan
 * çalıştıran küçük çıkarım (inference) motoru.
 *
 * Model dosyası Python tarafındaki yz_aktar.py ile üretilir:
 *   { inputShape:[H,W,C], nodes:[{name,type,inputs:[...], ...}], output:"...", camFrom:"..." }
 * Desteklenen düğümler: input, scale, concat, conv, dwconv, pad, relu, add, maxpool, gap, dense
 * (BatchNormalization katmanları dışa aktarımda önceki evrişime gömülür.)
 * Tensör düzeni: HWC, Float32Array.
 */
(function (global) {
  "use strict";

  function b64ToFloat32(b64) {
    const bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Float32Array(u8.buffer);
  }

  function prepare(model) {
    if (model._ready) return model;
    for (const n of model.nodes) {
      if (typeof n.w === "string") n.w = b64ToFloat32(n.w);
      if (typeof n.b === "string") n.b = b64ToFloat32(n.b);
    }
    model._ready = true;
    return model;
  }

  function outSize(H, k, s, mode) {
    if (mode === "same") { const o = Math.ceil(H / s); return [o, Math.floor(Math.max((o - 1) * s + k - H, 0) / 2)]; }
    return [Math.floor((H - k) / s) + 1, 0];
  }

  function act(y, a) {
    if (a === "relu") { for (let i = 0; i < y.length; i++) if (y[i] < 0) y[i] = 0; }
    else if (a === "relu6") { for (let i = 0; i < y.length; i++) y[i] = y[i] < 0 ? 0 : (y[i] > 6 ? 6 : y[i]); }
    return y;
  }

  function conv(t, n) {
    const { H, W, C, d } = t, K = n.k, S = n.s, O = n.out, w = n.w, b = n.b;
    const [Ho, pt] = outSize(H, K, S, n.pad), [Wo, pl] = outSize(W, K, S, n.pad);
    const y = new Float32Array(Ho * Wo * O);
    for (let i = 0; i < Ho; i++) for (let j = 0; j < Wo; j++) {
      const yo = (i * Wo + j) * O;
      for (let o = 0; o < O; o++) y[yo + o] = b[o];
      for (let ki = 0; ki < K; ki++) {
        const ii = i * S + ki - pt; if (ii < 0 || ii >= H) continue;
        for (let kj = 0; kj < K; kj++) {
          const jj = j * S + kj - pl; if (jj < 0 || jj >= W) continue;
          const xo = (ii * W + jj) * C, wo = (ki * K + kj) * C * O;
          for (let c = 0; c < C; c++) {
            const xv = d[xo + c]; if (xv === 0) continue;
            const wr = wo + c * O;
            for (let o = 0; o < O; o++) y[yo + o] += xv * w[wr + o];
          }
        }
      }
    }
    return { H: Ho, W: Wo, C: O, d: act(y, n.act) };
  }

  function dwconv(t, n) {
    const { H, W, C, d } = t, K = n.k, S = n.s, w = n.w, b = n.b;
    const [Ho, pt] = outSize(H, K, S, n.pad), [Wo, pl] = outSize(W, K, S, n.pad);
    const y = new Float32Array(Ho * Wo * C);
    for (let i = 0; i < Ho; i++) for (let j = 0; j < Wo; j++) {
      const yo = (i * Wo + j) * C;
      for (let c = 0; c < C; c++) y[yo + c] = b[c];
      for (let ki = 0; ki < K; ki++) {
        const ii = i * S + ki - pt; if (ii < 0 || ii >= H) continue;
        for (let kj = 0; kj < K; kj++) {
          const jj = j * S + kj - pl; if (jj < 0 || jj >= W) continue;
          const xo = (ii * W + jj) * C, wo = (ki * K + kj) * C;
          for (let c = 0; c < C; c++) y[yo + c] += d[xo + c] * w[wo + c];
        }
      }
    }
    return { H: Ho, W: Wo, C: C, d: act(y, n.act) };
  }

  function pad(t, n) {
    const [[pt, pb], [pl, pr]] = n.p, Ho = t.H + pt + pb, Wo = t.W + pl + pr, C = t.C;
    const y = new Float32Array(Ho * Wo * C);
    for (let i = 0; i < t.H; i++) y.set(t.d.subarray(i * t.W * C, (i + 1) * t.W * C), ((i + pt) * Wo + pl) * C);
    return { H: Ho, W: Wo, C: C, d: y };
  }

  function maxpool(t) {
    const H = t.H >> 1, W = t.W >> 1, C = t.C, x = t.d, y = new Float32Array(H * W * C);
    for (let i = 0; i < H; i++) for (let j = 0; j < W; j++) for (let c = 0; c < C; c++) {
      const r0 = ((2 * i) * t.W + 2 * j) * C + c, r1 = ((2 * i + 1) * t.W + 2 * j) * C + c;
      y[(i * W + j) * C + c] = Math.max(x[r0], x[r0 + C], x[r1], x[r1 + C]);
    }
    return { H: H, W: W, C: C, d: y };
  }

  function gap(t) {
    const g = new Float32Array(t.C), P = t.H * t.W;
    for (let p = 0; p < P; p++) for (let c = 0; c < t.C; c++) g[c] += t.d[p * t.C + c];
    for (let c = 0; c < t.C; c++) g[c] /= P;
    return { H: 1, W: 1, C: t.C, d: g };
  }

  function dense(t, n) {
    const I = t.d.length, O = n.out, y = new Float32Array(O);
    for (let o = 0; o < O; o++) y[o] = n.b[o];
    for (let i = 0; i < I; i++) { const xv = t.d[i]; if (xv === 0) continue; for (let o = 0; o < O; o++) y[o] += xv * n.w[i * O + o]; }
    if (n.act === "relu") act(y, "relu");
    if (n.act === "sigmoid") for (let o = 0; o < O; o++) y[o] = 1 / (1 + Math.exp(-y[o]));
    if (n.act === "softmax") { let m = -Infinity; for (const v of y) m = Math.max(m, v); let s = 0; for (let o = 0; o < O; o++) { y[o] = Math.exp(y[o] - m); s += y[o]; } for (let o = 0; o < O; o++) y[o] /= s; }
    return { H: 1, W: 1, C: O, d: y };
  }

  /**
   * input: Float32Array (H*W*C). camClass: CAM hesaplanacak sınıf indeksi.
   * Dönüş: { out: [olasılıklar], cam: {data,h,w} | null }
   */
  function predict(model, input, camClass) {
    prepare(model);
    const [H, W, C] = model.inputShape, T = {};
    for (const n of model.nodes) {
      const a = n.inputs ? T[n.inputs[0]] : null;
      let r;
      switch (n.type) {
        case "input": r = { H: H, W: W, C: C, d: input }; break;
        case "conv": r = conv(a, n); break;
        case "dwconv": r = dwconv(a, n); break;
        case "pad": r = pad(a, n); break;
        case "relu": r = { H: a.H, W: a.W, C: a.C, d: act(Float32Array.from(a.d), n.max === 6 ? "relu6" : "relu") }; break;
        case "add": { const b = T[n.inputs[1]], y = new Float32Array(a.d.length); for (let i = 0; i < y.length; i++) y[i] = a.d[i] + b.d[i]; r = { H: a.H, W: a.W, C: a.C, d: y }; break; }
        case "maxpool": r = maxpool(a); break;
        case "scale": { const y = new Float32Array(a.d.length); for (let i = 0; i < y.length; i++) y[i] = a.d[i] * n.mul + n.add; r = { H: a.H, W: a.W, C: a.C, d: y }; break; }
        case "concat": {
          const parts = n.inputs.map(function (q) { return T[q]; }), Ct = parts.reduce(function (s, p) { return s + p.C; }, 0), P = a.H * a.W, y = new Float32Array(P * Ct);
          for (let p = 0; p < P; p++) { let off = 0; for (const q of parts) { for (let c = 0; c < q.C; c++) y[p * Ct + off + c] = q.d[p * q.C + c]; off += q.C; } }
          r = { H: a.H, W: a.W, C: Ct, d: y }; break;
        }
        case "gap": r = gap(a); break;
        case "dense": r = dense(a, n); break;
        default: throw new Error("Desteklenmeyen düğüm: " + n.type);
      }
      T[n.name] = r;
    }
    const out = Array.from(T[model.output].d);
    let cam = null;
    if (model.camFrom) {
      const A = T[model.camFrom], D = model.nodes.find(function (n) { return n.name === model.camDense; });
      const k = camClass == null ? 0 : camClass, O = D.out;
      cam = { data: new Float32Array(A.H * A.W), h: A.H, w: A.W };
      for (let p = 0; p < A.H * A.W; p++) { let s = 0; for (let c = 0; c < A.C; c++) s += A.d[p * A.C + c] * D.w[c * O + k]; cam.data[p] = s; }
    }
    return { out: out, cam: cam };
  }

  global.YZMotor = { predict: predict, prepare: prepare };
})(typeof window !== "undefined" ? window : globalThis);
