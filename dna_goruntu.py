"""
dna_goruntu.py — DNA dizisini görüntüye çevirme: Kaos Oyunu Gösterimi (Chaos Game Representation, CGR)
ve frekans-CGR (FCGR). Mobil uygulamadaki JavaScript (mobil/www/dna.js) ile birebir aynıdır.

Fikir (Jeffrey, 1990): Karenin 4 köşesine A, C, G, T yerleştirilir. Ortadan başlanır; her nükleotitte
"şu anki nokta ile o harfin köşesinin tam ortasına" gidilir. Ortaya çıkan desen dizinin
k-mer (k harflik alt dizi) içeriğini tek bir resimde özetler: bir "genomik parmak izi".
"""
import numpy as np

KOSE = {"A": (0, 0), "C": (0, 1), "G": (1, 1), "T": (1, 0)}   # (x, y): A sol-alt, C sol-üst, G sağ-üst, T sağ-alt
SINIFLAR = ["G-proteine bağlı reseptör", "Tirozin kinaz", "Tirozin fosfataz", "Sentetaz",
            "Sentaz", "İyon kanalı", "Transkripsiyon faktörü"]


def cgr_noktalari(dizi):
    """Kaos oyunu: her nükleotit için bir nokta (x, y) ∈ [0,1]²."""
    x, y, nok = 0.5, 0.5, []
    for h in dizi.upper():
        if h not in KOSE:
            continue
        kx, ky = KOSE[h]
        x, y = (x + kx) / 2, (y + ky) / 2
        nok.append((x, y))
    return np.array(nok)


def fcgr(dizi, k=6):
    """Frekans-CGR: 2^k x 2^k ızgarada her k-mer'in sayısı. Satır 0 = üst (C/G tarafı)."""
    n = 2 ** k
    m = np.zeros((n, n), dtype=np.float32)
    s = dizi.upper()
    son_gecersiz = -1
    for i, h in enumerate(s):
        if h not in KOSE:
            son_gecersiz = i
        if i - son_gecersiz < k:
            continue
        px = py = 0
        for j in range(k):                          # en son harf en anlamlı bit
            kx, ky = KOSE[s[i - k + 1 + j]]
            px |= kx << j; py |= ky << j
        m[n - 1 - py, px] += 1
    return m


def fcgr_normalize(m):
    """Modele girecek 0-1 görüntü: log(1+sayı) / log(1+en büyük sayı)."""
    mx = m.max()
    return (np.log1p(m) / np.log1p(mx)).astype(np.float32) if mx > 0 else m


def kmer_vektor(dizi, k=4):
    """Klasik makine öğrenmesi için k-mer frekans vektörü (4^k boyutlu)."""
    v = fcgr(dizi, k).ravel()
    return v / max(v.sum(), 1)
