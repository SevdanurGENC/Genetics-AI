"""
kromozom_isleme.py — Metafaz görüntüsünden kromozomları bulma, sayma ve sınıflandırma için kesme.
Mobil uygulamadaki JavaScript (mobil/www/karyotip.js) bu fonksiyonların birebir aynısıdır.

Adımlar
 1) Gri tonlama + 3x3 bulanıklaştırma
 2) Otsu eşikleme (görüntüye göre otomatik eşik) → koyu cisimler
 3) Bağlı bileşenler (4-komşuluk)
 4) Her cisim için alan ve uzama (PCA) → gürültü / çekirdek / küme / tek kromozom
 5) Tek kromozomları ana eksenine göre dik çevirip 80x24'lük bir kutuya kesme
"""
import numpy as np
from scipy import ndimage

KESIT_H, KESIT_W = 80, 24
MIN_ALAN, CEKIRDEK_ALAN, CEKIRDEK_UZAMA, KUME_ALAN = 25, 1200, 1.8, 1000


def bulaniklastir(a):
    p = np.pad(a, 1, mode="edge"); s = np.zeros_like(a, dtype=np.float64)
    for di in range(3):
        for dj in range(3):
            s += p[di:di + a.shape[0], dj:dj + a.shape[1]]
    return s / 9.0


def otsu(b):
    """Otsu yöntemi: iki sınıf arası varyansı en büyük yapan eşik (0-255)."""
    hist = np.bincount(np.clip(b, 0, 255).astype(np.int64).ravel(), minlength=256).astype(np.float64)
    toplam = hist.sum(); top_t = (np.arange(256) * hist).sum()
    w0 = s0 = 0.0; en_iyi, esik = -1.0, 0
    for t in range(256):
        w0 += hist[t]; s0 += t * hist[t]
        w1 = toplam - w0
        if w0 == 0 or w1 == 0:
            continue
        m0, m1 = s0 / w0, (top_t - s0) / w1
        v = w0 * w1 * (m0 - m1) ** 2
        if v > en_iyi:
            en_iyi, esik = v, t
    return esik


def nesneleri_bul(gri):
    """Dönüş: (etiket matrisi, nesne listesi). Her nesne: alan, merkez, açı, uzama, tür."""
    b = bulaniklastir(gri.astype(np.float64))
    t = otsu(b)
    maske = b <= t
    etiket, n = ndimage.label(maske)
    nesneler = []
    for no in range(1, n + 1):
        ys, xs = np.nonzero(etiket == no)
        alan = len(ys)
        if alan < MIN_ALAN:
            continue
        cy, cx = ys.mean(), xs.mean()
        syy, sxx, sxy = ((ys - cy) ** 2).mean(), ((xs - cx) ** 2).mean(), ((ys - cy) * (xs - cx)).mean()
        fi = 0.5 * np.arctan2(2 * sxy, syy - sxx)
        yarim = (syy + sxx) / 2; kok = np.sqrt(((syy - sxx) / 2) ** 2 + sxy ** 2)
        uzama = float(np.sqrt((yarim + kok) / max(yarim - kok, 1e-6)))
        if alan > CEKIRDEK_ALAN and uzama < CEKIRDEK_UZAMA:
            tur = "cekirdek"
        elif alan > KUME_ALAN:
            tur = "kume"
        else:
            tur = "kromozom"
        nesneler.append({"no": no, "alan": alan, "cy": cy, "cx": cx, "aci": fi, "uzama": uzama, "tur": tur,
                         "bbox": [int(ys.min()), int(xs.min()), int(ys.max()) + 1, int(xs.max()) + 1]})
    return etiket, nesneler, t


def kesit_al(gri, etiket, nesne):
    """Kromozomu ana eksenine göre dikey çevirip 80x24 boyutunda, 0-1 koyuluk kesiti üretir."""
    D = np.clip((255.0 - gri.astype(np.float64)) / 255.0, 0, 1)
    H, W = gri.shape
    c, s = np.cos(nesne["aci"]), np.sin(nesne["aci"])
    i, j = np.mgrid[0:KESIT_H, 0:KESIT_W].astype(np.float64)
    v, u = i - (KESIT_H - 1) / 2, j - (KESIT_W - 1) / 2
    sy, sx = nesne["cy"] + v * c - u * s, nesne["cx"] + v * s + u * c
    y0, x0 = np.floor(sy).astype(int), np.floor(sx).astype(int)
    fy, fx = sy - y0, sx - x0
    def al(yy, xx):
        ic = (yy >= 0) & (yy < H) & (xx >= 0) & (xx < W)
        out = np.zeros_like(sy)
        out[ic] = D[yy[ic], xx[ic]]
        return out
    deger = (al(y0, x0) * (1 - fy) * (1 - fx) + al(y0, x0 + 1) * (1 - fy) * fx +
             al(y0 + 1, x0) * fy * (1 - fx) + al(y0 + 1, x0 + 1) * fy * fx)
    yr, xr = np.round(sy).astype(int), np.round(sx).astype(int)
    ic = (yr >= 0) & (yr < H) & (xr >= 0) & (xr < W)
    ait = np.zeros_like(sy, dtype=bool)
    ait[ic] = etiket[yr[ic], xr[ic]] == nesne["no"]
    k = deger * ait
    m = k.max()
    return (k / m if m > 0 else k).astype(np.float32)


# ---------------- Karyotip kararı ----------------
TIPLER = [str(i) for i in range(1, 23)] + ["X", "Y"]


def siniflari_ata(olasilik):
    """Açgözlü atama: her kromozom tipine en fazla 2 (Y için 1) yer. Bir kromozom yalnızca modelin
    makul olasılık (≥ 0,10) verdiği bir tipe kaydırılabilir; artanlar en olası tipe gider (→ trizomi)."""
    n = olasilik.shape[0]
    kapasite = np.array([2] * 22 + [2, 1])
    atama = -np.ones(n, dtype=int)
    ciftler = sorted(((olasilik[i, k], i, k) for i in range(n) for k in range(24) if olasilik[i, k] >= 0.10), reverse=True)
    for p, i, k in ciftler:
        if atama[i] < 0 and kapasite[k] > 0:
            atama[i] = k; kapasite[k] -= 1
    for i in np.where(atama < 0)[0]:
        atama[i] = int(np.argmax(olasilik[i]))
    return atama


def karyotip_yorumu(atama, kume_sayisi=0):
    sayi = np.bincount(atama, minlength=24)
    toplam = int(len(atama))
    x, y = int(sayi[22]), int(sayi[23])
    cins = "X" * x + "Y" * y
    bulgular = []
    for k in range(22):
        if sayi[k] == 3: bulgular.append(f"+{TIPLER[k]}")
        if sayi[k] == 1: bulgular.append(f"-{TIPLER[k]}")
    formul = f"{toplam},{cins}" + ("," + ",".join(bulgular) if bulgular else "")
    adlar = {"+21": "Down sendromu (trizomi 21)", "+18": "Edwards sendromu (trizomi 18)", "+13": "Patau sendromu (trizomi 13)"}
    yorum = [adlar.get(b, f"{b} sayısal anomali") for b in bulgular]
    if cins == "X": yorum.append("Turner sendromu (45,X) ile uyumlu")
    if cins == "XXY": yorum.append("Klinefelter sendromu (47,XXY) ile uyumlu")
    if not yorum and toplam == 46: yorum.append("Sayısal anomali saptanmadı")
    if kume_sayisi: yorum.append(f"Dikkat: {kume_sayisi} kümelenmiş/üst üste binmiş bölge sayılamadı")
    return formul, yorum, sayi
