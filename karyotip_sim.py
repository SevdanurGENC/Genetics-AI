"""
karyotip_sim.py — Sentetik (simüle) G-bantlı metafaz görüntüsü üreteci.

NEDEN SENTETİK? Gerçek, etiketli metafaz/karyotip veri setleri (ör. AutoKary2022, BioImLab)
çoğunlukla izinle ya da kapalı platformlardan paylaşılır. Eğitimde ve yöntem geliştirmede
"etiketi kesin bilinen" sentetik veri çok değerlidir; ama gerçek görüntülerin karmaşıklığını
TAM yansıtmaz. Burada üretilen görüntüler GERÇEK HASTA VERİSİ DEĞİLDİR.

Modelleme:
* 24 kromozom tipi (1-22, X, Y) gerçek göreli uzunluk ve sentromer indekslerine yakın değerlerle
* Her tipe özgü, sabit (homologlarda aynı) bir G-bant deseni
* Rastgele yönelim, hafif bükülme, ölçek değişimi, ara faz çekirdekleri, gürültü, aydınlatma eğimi
* Karyotipler: 46,XX · 46,XY · 47,+21 · 47,+18 · 47,+13 · 45,X · 47,XXY
"""
import numpy as np
from scipy import ndimage

TIPLER = [str(i) for i in range(1, 23)] + ["X", "Y"]
# Haploid genoma göre yaklaşık göreli uzunluk (%) ve sentromer indeksi (p / toplam)
UZUNLUK = [8.44, 8.02, 6.83, 6.30, 6.08, 5.90, 5.36, 4.93, 4.80, 4.59, 4.61, 4.66, 3.74, 3.56, 3.46,
           3.36, 3.25, 2.93, 2.67, 2.56, 1.90, 2.04, 5.12, 2.15]
SENTROMER = [0.48, 0.39, 0.47, 0.29, 0.29, 0.39, 0.39, 0.34, 0.35, 0.32, 0.40, 0.30, 0.17, 0.18, 0.19,
             0.41, 0.34, 0.31, 0.47, 0.45, 0.22, 0.24, 0.40, 0.30]

KARYOTIPLER = {
    "46,XX": {"cins": ["X", "X"], "ek": [], "eksik": []},
    "46,XY": {"cins": ["X", "Y"], "ek": [], "eksik": []},
    "47,XX,+21 (Down)": {"cins": ["X", "X"], "ek": ["21"], "eksik": []},
    "47,XY,+21 (Down)": {"cins": ["X", "Y"], "ek": ["21"], "eksik": []},
    "47,XX,+18 (Edwards)": {"cins": ["X", "X"], "ek": ["18"], "eksik": []},
    "47,XY,+13 (Patau)": {"cins": ["X", "Y"], "ek": ["13"], "eksik": []},
    "45,X (Turner)": {"cins": ["X"], "ek": [], "eksik": []},
    "47,XXY (Klinefelter)": {"cins": ["X", "X", "Y"], "ek": [], "eksik": []},
}


def bant_deseni(tip_idx, n=200):
    """Kromozom tipine özgü, tekrarlanabilir 1-B G-bant yoğunluk profili (0 açık … 1 koyu)."""
    rng = np.random.default_rng(1000 + tip_idx)
    profil = np.zeros(n)
    i = 0
    while i < n:
        uz = int(rng.integers(6, 22))
        profil[i:i + uz] = rng.choice([0.15, 0.45, 0.95], p=[0.4, 0.25, 0.35])
        i += uz
    profil = ndimage.gaussian_filter1d(profil, 2.0)
    profil[:4] = profil[:4] * 0.4 + 0.1           # telomer uçları açık
    profil[-4:] = profil[-4:] * 0.4 + 0.1
    return profil


BANTLAR = [bant_deseni(i) for i in range(24)]


def kromozom_cizimi(tip_idx, olcek, rng):
    """Dikey duran tek kromozomun yoğunluk (koyuluk) matrisini ve maskesini üretir."""
    L = max(10, int(round(UZUNLUK[tip_idx] * olcek * rng.uniform(0.9, 1.1))))
    G = int(round(rng.uniform(8.0, 10.0) * olcek / 8.0))
    G = max(G, 6)
    pad = 6
    H, W = L + 2 * pad, G + 2 * pad
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    t = np.clip((yy - pad) / max(L - 1, 1), 0, 1)
    cx = W / 2 + 1.2 * np.sin(np.pi * t) * rng.uniform(-1, 1) * L / 40   # hafif bükülme
    c = SENTROMER[tip_idx]
    # sentromerde daralma (bel)
    yaricap = G / 2 * (1 - 0.32 * np.exp(-((t - c) ** 2) / (2 * 0.025 ** 2)))
    dx = np.abs(xx - cx)
    # kapsül biçimi: uçlar yuvarlak
    ust = np.clip(pad + G / 2 - yy, 0, None); alt = np.clip(yy - (pad + L - G / 2), 0, None)
    uc = np.sqrt(ust ** 2 + alt ** 2)
    mesafe = np.sqrt(dx ** 2 + uc ** 2)
    kenar = np.clip(yaricap - mesafe + 0.5, 0, 1)                         # yumuşak kenar
    # Hücreden hücreye değişkenlik: yoğunlaşma (bant çözünürlüğü), düzensiz gerilme, boyanma gürültüsü
    profil = ndimage.gaussian_filter1d(BANTLAR[tip_idx], rng.uniform(1.0, 4.5))
    profil = profil + ndimage.gaussian_filter1d(rng.normal(0, 0.22, len(profil)), 3)
    profil = (profil - profil.mean()) * rng.uniform(0.6, 1.25) + profil.mean()
    tw = np.clip(t + rng.uniform(-0.06, 0.06) * np.sin(np.pi * t * rng.uniform(1, 2)), 0, 1)
    bant = np.clip(np.interp(tw, np.linspace(0, 1, len(profil)), profil), 0.05, 1.0)
    kardes = 1 - 0.18 * np.exp(-(dx ** 2) / (2 * 0.6 ** 2)) * (np.abs(t - c) > 0.06)  # kardeş kromatit çizgisi
    koyuluk = kenar * (0.38 + 0.55 * bant) * kardes
    return koyuluk, kenar > 0.5


def _yerlestir(tuval, maske_tuval, etiket_tuval, parca, mask, y, x, no):
    h, w = parca.shape
    bolge = tuval[y:y + h, x:x + w]
    np.maximum(bolge, parca, out=bolge)
    etiket_tuval[y:y + h, x:x + w][mask] = no
    maske_tuval[y:y + h, x:x + w] |= mask


def metafaz_uret(karyotip="46,XY", boyut=512, olcek=8.0, temas_orani=0.0, cekirdek=1, tohum=0):
    """
    Bir metafaz görüntüsü üretir.
    Dönüş: (gri görüntü uint8, örnek-etiket matrisi, kromozom listesi [{tip, bbox}])
    temas_orani: kromozomların birbirine değme/üst üste binme olasılığı (zorluk)
    """
    rng = np.random.default_rng(tohum)
    k = KARYOTIPLER[karyotip]
    liste = [t for t in TIPLER[:22] for _ in range(2)] + k["cins"] + k["ek"]
    rng.shuffle(liste)
    olcek = olcek * rng.uniform(0.9, 1.1)
    koyu = np.zeros((boyut, boyut)); dolu = np.zeros((boyut, boyut), bool); etiket = np.zeros((boyut, boyut), np.int16)
    # Ara faz çekirdekleri (yanıltıcı büyük yuvarlak cisimler)
    for _ in range(cekirdek):
        r = rng.uniform(28, 40); cy, cx = rng.uniform(r, boyut - r, 2)
        yy, xx = np.mgrid[0:boyut, 0:boyut]
        e = ((yy - cy) / r) ** 2 + ((xx - cx) / (r * rng.uniform(0.8, 1.2))) ** 2
        doku = ndimage.gaussian_filter(rng.random((boyut, boyut)), 2) * 0.25
        koyu = np.maximum(koyu, np.clip(1.2 - e, 0, 1).clip(0, 1) * (0.45 + doku) * (e < 1))
        dolu |= e < 1.25
    # Metafaz yayılım merkezi
    merkez = np.array([boyut / 2, boyut / 2]) + rng.uniform(-30, 30, 2)
    kayit = []
    for no, tip in enumerate(liste, start=1):
        ti = TIPLER.index(tip)
        parca, mask = kromozom_cizimi(ti, olcek, rng)
        aci = rng.uniform(0, 180)
        parca = ndimage.rotate(parca, aci, reshape=True, order=1)
        mask = ndimage.rotate(mask.astype(float), aci, reshape=True, order=1) > 0.5
        h, w = parca.shape
        izin_temas = rng.random() < temas_orani
        for deneme in range(400):
            yaricap = boyut * 0.36 * np.sqrt(rng.random())
            a = rng.uniform(0, 2 * np.pi)
            y = int(merkez[0] + yaricap * np.sin(a) - h / 2); x = int(merkez[1] + yaricap * np.cos(a) - w / 2)
            if y < 4 or x < 4 or y + h > boyut - 4 or x + w > boyut - 4:
                continue
            genis = ndimage.binary_dilation(mask, iterations=3)
            if izin_temas or not (dolu[y:y + h, x:x + w] & genis).any():
                break
        _yerlestir(koyu, dolu, etiket, parca, mask, y, x, no)
        kayit.append({"no": no, "tip": tip, "bbox": [int(y), int(x), int(y + h), int(x + w)]})
    # Mikroskop etkileri: bulanıklık, aydınlatma eğimi, gürültü
    koyu = ndimage.gaussian_filter(koyu, rng.uniform(0.6, 1.0))
    yy, xx = np.mgrid[0:boyut, 0:boyut] / boyut
    arka = 232 - 14 * (yy * rng.uniform(-1, 1) + xx * rng.uniform(-1, 1))
    gri = arka - koyu * rng.uniform(175, 200) + rng.normal(0, rng.uniform(4, 9), (boyut, boyut))
    return np.clip(gri, 0, 255).astype(np.uint8), etiket, kayit
