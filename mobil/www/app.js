(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const K = window.Karyotip;

  // ---------- Sekmeler ----------
  document.querySelectorAll(".sekme").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll(".sekme").forEach(function (x) { x.classList.toggle("aktif", x === b); });
      $("s_k").classList.toggle("gizli", b.dataset.s !== "k"); $("s_d").classList.toggle("gizli", b.dataset.s !== "d");
    });
  });

  // ---------- KARYOTİP ----------
  function karyotipAnaliz(img) {
    const t0 = performance.now();
    const { g, H, W } = K.griYap(img);
    const { etiket, nesneler } = K.nesneleriBul(g, H, W);
    const tekler = nesneler.filter(function (n) { return n.tur === "kromozom"; });
    const kume = nesneler.filter(function (n) { return n.tur === "kume"; }).length;
    const kesitler = tekler.map(function (n) { return K.kesitAl(g, H, W, etiket, n); });
    const P = kesitler.map(function (k) { return YZMotor.predict(window.KROMOZOM_MODEL, k).out; });
    const atama = tekler.length ? K.siniflariAta(P) : [];
    const y = K.yorumla(atama, kume);
    const t1 = performance.now();

    $("kFormul").textContent = y.formul;
    $("kYorum").innerHTML = y.yorum.map(function (s) { return "<li>" + s + "</li>"; }).join("");
    // Görüntü + kutular
    const cv = $("kGorsel"); cv.width = W; cv.height = H; const ctx = cv.getContext("2d");
    ctx.drawImage(img, 0, 0); ctx.lineWidth = Math.max(1.5, W / 340);
    const renk = { kromozom: "#16a34a", kume: "#f59e0b", cekirdek: "#3b82f6" };
    nesneler.forEach(function (n) {
      ctx.strokeStyle = renk[n.tur]; ctx.strokeRect(n.bbox[1] - 1, n.bbox[0] - 1, n.bbox[3] - n.bbox[1] + 2, n.bbox[2] - n.bbox[0] + 2);
    });
    ctx.font = "bold " + Math.round(W / 46) + "px system-ui"; ctx.fillStyle = "#0a5257";
    tekler.forEach(function (n, i) { ctx.fillText(K.TIPLER[atama[i]], n.bbox[3] + 1, n.bbox[0] + 8); });
    karyogramCiz(kesitler, atama);
    $("kSure").textContent = "Bulunan: " + tekler.length + " kromozom, " + kume + " küme, " +
      nesneler.filter(function (n) { return n.tur === "cekirdek"; }).length + " çekirdek · Süre: " + Math.round(t1 - t0) + " ms · İnternet kullanılmadı";
    $("kSonuc").classList.remove("gizli"); $("kSonuc").scrollIntoView({ behavior: "smooth" });
  }

  function karyogramCiz(kesitler, atama) {
    const satirlar = [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9, 10, 11], [12, 13, 14, 15, 16, 17], [18, 19, 20, 21, 22, 23]];
    const hucre = 84, cv = $("kKaryogram"), olcek = 2;
    cv.width = 7 * hucre * olcek; cv.height = satirlar.length * 112 * olcek;
    const ctx = cv.getContext("2d"); ctx.scale(olcek, olcek); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 7 * hucre, satirlar.length * 112);
    satirlar.forEach(function (satir, r) {
      satir.forEach(function (k, c) {
        const idx = []; atama.forEach(function (a, i) { if (a === k) idx.push(i); });
        const x0 = c * hucre + (7 - satir.length) * hucre / 2, y0 = r * 112 + 4;
        idx.slice(0, 3).forEach(function (i, j) {
          const im = ctx.createImageData(K.KW, K.KH), d = kesitler[i];
          for (let p = 0; p < d.length; p++) { const v = 255 * (1 - d[p]); im.data[4 * p] = im.data[4 * p + 1] = im.data[4 * p + 2] = v; im.data[4 * p + 3] = 255; }
          const tmp = document.createElement("canvas"); tmp.width = K.KW; tmp.height = K.KH; tmp.getContext("2d").putImageData(im, 0, 0);
          ctx.drawImage(tmp, x0 + 6 + j * 25, y0);
        });
        const normal = k === 23 ? idx.length <= 1 : (k === 22 ? idx.length >= 1 && idx.length <= 2 : idx.length === 2);
        ctx.fillStyle = normal ? "#14251f" : "#c62f3a"; ctx.font = (normal ? "" : "bold ") + "12px system-ui"; ctx.textAlign = "center";
        ctx.fillText(K.TIPLER[k] + (idx.length !== 2 ? " (" + idx.length + ")" : ""), x0 + 40, y0 + 96);
      });
    });
  }

  (window.ORNEK_METAFAZ || []).forEach(function (o, i) {
    const b = document.createElement("button"); b.className = "cip"; b.textContent = o.ad;
    b.onclick = function () {
      document.querySelectorAll("#metafazCip .cip").forEach(function (x) { x.classList.toggle("sec", x === b); });
      const img = new Image(); img.onload = function () { setTimeout(function () { karyotipAnaliz(img); }, 20); }; img.src = o.src;
    };
    $("metafazCip").appendChild(b);
  });
  $("kGaleri").onclick = function () { $("kDosya").click(); };
  $("kDosya").onchange = function () {
    const f = this.files && this.files[0]; if (!f) return; const r = new FileReader();
    r.onload = function () { const img = new Image(); img.onload = function () { karyotipAnaliz(img); }; img.src = r.result; };
    r.readAsDataURL(f); this.value = "";
  };

  // ---------- DNA ----------
  let sonDna = null;
  function magma(v) { // basit renk haritası
    const r = Math.min(255, 30 + 400 * v), g = Math.max(0, Math.min(255, -60 + 330 * v)), b = Math.min(255, 70 + 250 * v * (1 - v) * 3);
    return [r, g, b];
  }
  function dnaAnaliz(dizi, bilgi) {
    const t = DNA.temizle(dizi);
    if (t.replace(/[^ACGT]/g, "").length < 50) { alert("En az 50 nükleotitlik bir DNA dizisi girin."); return; }
    const r = DNA.tahmin(t); sonDna = r;
    // Kaos oyunu
    const nok = DNA.cgrNoktalari(t), c1 = $("dCgr").getContext("2d");
    c1.fillStyle = "#fff"; c1.fillRect(0, 0, 512, 512); c1.fillStyle = "rgba(10,90,72,0.85)";
    for (const [x, y] of nok) c1.fillRect(x * 508 + 1, (1 - y) * 508 + 1, 3, 3);
    c1.fillStyle = "#14251f"; c1.font = "bold 28px system-ui";
    c1.fillText("A", 6, 504); c1.fillText("C", 6, 30); c1.fillText("G", 486, 30); c1.fillText("T", 488, 504);
    fcgrCiz();
    const M = window.DNA_MODEL, sira = r.olasilik.map(function (p, i) { return [p, i]; }).sort(function (a, b) { return b[0] - a[0]; });
    $("dOlas").innerHTML = sira.map(function (e) {
      return "<div" + (e[1] === r.sinif ? " style='font-weight:700'" : "") + ">" + M.siniflar[e[1]] + "</div><div class='c'><span style='width:" + (100 * e[0]).toFixed(1) + "%'></span></div><div>%" + Math.round(100 * e[0]) + "</div>";
    }).join("");
    $("dBilgi").textContent = r.uzunluk + " nükleotit · " + r.kmerSayisi + " adet 6-mer sayıldı" + (bilgi ? " · " + bilgi : "");
    $("dSonuc").classList.remove("gizli"); $("dSonuc").scrollIntoView({ behavior: "smooth" });
  }
  function fcgrCiz() {
    if (!sonDna) return;
    const katkiGoster = $("dKatki").checked, n = 64, c = $("dFcgr").getContext("2d"), im = c.createImageData(n, n);
    let mx = 0, km = 0; for (let i = 0; i < n * n; i++) { mx = Math.max(mx, sonDna.fcgr[i]); km = Math.max(km, Math.abs(sonDna.katki[i])); }
    for (let i = 0; i < n * n; i++) {
      let rgb;
      if (katkiGoster) { const v = km ? sonDna.katki[i] / km : 0; rgb = v >= 0 ? [255, 255 * (1 - v), 255 * (1 - v)] : [255 * (1 + v), 255 * (1 + v), 255]; }
      else rgb = magma(mx ? Math.log1p(sonDna.fcgr[i]) / Math.log1p(mx) : 0);
      im.data[4 * i] = rgb[0]; im.data[4 * i + 1] = rgb[1]; im.data[4 * i + 2] = rgb[2]; im.data[4 * i + 3] = 255;
    }
    const tmp = document.createElement("canvas"); tmp.width = tmp.height = n; tmp.getContext("2d").putImageData(im, 0, 0);
    c.imageSmoothingEnabled = false; c.drawImage(tmp, 0, 0, 512, 512);
    $("dFcgrYazi").textContent = katkiGoster ? "Kırmızı: tahmin edilen aile lehine 6-mer'ler" : "FCGR 64×64 (6-mer sıklıkları)";
  }
  $("dKatki").onchange = fcgrCiz;
  (window.ORNEK_DNA || []).forEach(function (o) {
    const b = document.createElement("button"); b.className = "cip"; b.textContent = o.ad;
    b.onclick = function () {
      document.querySelectorAll("#dnaCip .cip").forEach(function (x) { x.classList.toggle("sec", x === b); });
      $("dnaGiris").value = o.dizi; dnaAnaliz(o.dizi, "gerçek aile: " + window.DNA_MODEL.siniflar[o.sinif]);
    };
    $("dnaCip").appendChild(b);
  });
  $("dnaBtn").onclick = function () { dnaAnaliz($("dnaGiris").value, ""); };
  const d = window.DNA_MODEL.dogruluk;
  $("dModelBilgi").textContent = "Model: 6-mer FCGR pikselleri üzerinde lojistik regresyon (insan genleriyle eğitildi). Sızıntısız test doğruluğu: insan %" +
    Math.round(100 * d["İnsan (test)"]) + ", şempanze %" + Math.round(100 * d["Şempanze"]) + ", köpek %" + Math.round(100 * d["Köpek"]) + ".";

  window.__test = { karyotipAnaliz: karyotipAnaliz, dnaAnaliz: dnaAnaliz };
})();
