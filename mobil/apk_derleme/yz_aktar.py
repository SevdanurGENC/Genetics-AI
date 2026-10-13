"""
yz_aktar.py — Keras modelini telefonda çalışacak JavaScript dosyasına aktarır.

Kullanım:
    from yz_aktar import keras_to_js, js_ile_dogrula
    keras_to_js(model, "mobil/www/model.js", degisken="TUMOR_MODEL", meta={...})

Desteklenenler: Conv2D, DepthwiseConv2D, BatchNormalization (önceki evrişime gömülür),
ReLU, ZeroPadding2D, Add, MaxPooling2D(2x2), GlobalAveragePooling2D, Dense, Rescaling,
Concatenate ve iç içe (nested) Functional modeller (ör. MobileNetV2 tabanı).
Eğitimde kullanılan veri artırma katmanları ve Dropout çıkarımda etkisiz olduğu için atlanır.
"""
import base64, json, os, subprocess, shutil
import numpy as np

ATLA = {"RandomFlip", "RandomRotation", "RandomZoom", "RandomTranslation", "RandomContrast",
        "RandomBrightness", "Dropout", "Sequential", "SpatialDropout2D", "GaussianNoise"}


def _b64(a):
    return base64.b64encode(np.ascontiguousarray(a, dtype=np.float32).tobytes()).decode()


def _gecmis(obj, out):
    """Config içinden giriş katman adlarını (keras_history) sırayla toplar."""
    if isinstance(obj, dict):
        if "keras_history" in obj.get("config", {}):
            out.append(obj["config"]["keras_history"][0])
            return out
        for v in obj.values():
            _gecmis(v, out)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            _gecmis(v, out)
    return out


def keras_to_js(model, yol, degisken="MODEL", meta=None):
    import keras
    nodes, alias, uretici = [], {}, {}
    son = {"gap_girdi": None, "dense": None}

    def ad(n):
        while n in alias:
            n = alias[n]
        return n

    def yuru(m, dis_girdi):
        cfg = m.get_config()
        for L in cfg["layers"]:
            isim, sinif = L["name"], L["class_name"]
            katman = m.get_layer(isim)
            girdiler = [ad(n) for n in _gecmis(L.get("inbound_nodes", []), [])]
            if sinif == "InputLayer":
                if dis_girdi is None:
                    nodes.append({"name": isim, "type": "input"})
                else:
                    alias[isim] = dis_girdi
                continue
            if sinif in ATLA:
                alias[isim] = girdiler[0]; continue
            if sinif == "Functional":
                yuru(katman, girdiler[0])
                alias[isim] = ad(katman.layers[-1].name); continue
            c = katman.get_config()
            if sinif == "Conv2D":
                w = katman.get_weights(); k = w[0]
                b = w[1] if len(w) > 1 else np.zeros(k.shape[3], np.float32)
                n = {"name": isim, "type": "conv", "inputs": girdiler, "k": int(k.shape[0]), "s": int(c["strides"][0]),
                     "pad": c["padding"], "out": int(k.shape[3]), "act": c["activation"], "w": k, "b": b}
            elif sinif == "DepthwiseConv2D":
                w = katman.get_weights(); k = w[0][..., 0]
                b = w[1] if len(w) > 1 else np.zeros(k.shape[2], np.float32)
                n = {"name": isim, "type": "dwconv", "inputs": girdiler, "k": int(k.shape[0]), "s": int(c["strides"][0]),
                     "pad": c["padding"], "act": c["activation"], "w": k, "b": b}
            elif sinif == "BatchNormalization":
                g, be, mu, var = katman.get_weights()
                olcek = g / np.sqrt(var + c["epsilon"])
                onceki = uretici[girdiler[0]]
                assert onceki["type"] in ("conv", "dwconv") and onceki["act"] == "linear", "BN yalnızca aktivasyonsuz evrişimden sonra gömülebilir"
                onceki["w"] = onceki["w"] * olcek
                onceki["b"] = (onceki["b"] - mu) * olcek + be
                alias[isim] = girdiler[0]; continue
            elif sinif == "ReLU":
                n = {"name": isim, "type": "relu", "inputs": girdiler, "max": c.get("max_value") or 0}
            elif sinif == "Activation" and c["activation"] == "relu":
                n = {"name": isim, "type": "relu", "inputs": girdiler, "max": 0}
            elif sinif == "ZeroPadding2D":
                n = {"name": isim, "type": "pad", "inputs": girdiler, "p": [list(map(int, p)) for p in c["padding"]]}
            elif sinif == "Add":
                n = {"name": isim, "type": "add", "inputs": girdiler}
            elif sinif == "MaxPooling2D":
                n = {"name": isim, "type": "maxpool", "inputs": girdiler}
            elif sinif == "GlobalAveragePooling2D":
                n = {"name": isim, "type": "gap", "inputs": girdiler}; son["gap_girdi"] = girdiler[0]
            elif sinif == "Dense":
                k, b = katman.get_weights()
                n = {"name": isim, "type": "dense", "inputs": girdiler, "out": int(k.shape[1]), "act": c["activation"], "w": k, "b": b}
                son["dense"] = son["dense"] or isim
            elif sinif == "Rescaling":
                n = {"name": isim, "type": "scale", "inputs": girdiler, "mul": float(c["scale"]), "add": float(c["offset"])}
            elif sinif == "Concatenate":
                n = {"name": isim, "type": "concat", "inputs": girdiler}
            else:
                raise ValueError(f"Desteklenmeyen katman: {sinif} ({isim})")
            nodes.append(n); uretici[isim] = n

    yuru(model, None)
    cikis = ad(model.layers[-1].name)
    for n in nodes:
        for anahtar in ("w", "b"):
            if anahtar in n:
                n[anahtar] = _b64(n[anahtar])
    ishape = [int(v) for v in model.input_shape[1:]]
    js = {"inputShape": ishape, "nodes": nodes, "output": cikis,
          "camFrom": son["gap_girdi"], "camDense": son["dense"], "meta": meta or {}}
    os.makedirs(os.path.dirname(yol) or ".", exist_ok=True)
    with open(yol, "w") as f:
        f.write(f"window.{degisken} = " + json.dumps(js, ensure_ascii=False) + ";\n")
    return {"dugum_sayisi": len(nodes), "boyut_kb": round(os.path.getsize(yol) / 1024)}


def js_ile_dogrula(motor_js, model_js, degisken, girdiler):
    """Aynı girdileri Node.js'teki JS motoruna verip çıktıları döndürür (doğrulama için)."""
    if not shutil.which("node"):
        return None
    gecici = os.path.abspath("_js_girdi.npy")
    np.save(gecici, np.ascontiguousarray(girdiler, dtype=np.float32))
    betik = f"""
    const fs=require('fs'); global.window=global; global.atob=s=>Buffer.from(s,'base64').toString('binary');
    eval(fs.readFileSync({json.dumps(os.path.abspath(motor_js))},'utf8'));
    eval(fs.readFileSync({json.dumps(os.path.abspath(model_js))},'utf8'));
    const M=window[{json.dumps(degisken)}];
    const buf=fs.readFileSync({json.dumps(gecici)}); const hl=buf.readUInt16LE(8);
    const data=new Float32Array(buf.buffer.slice(buf.byteOffset+10+hl));
    const per=M.inputShape.reduce((a,b)=>a*b,1), n=data.length/per, out=[];
    for(let i=0;i<n;i++) out.push(YZMotor.predict(M, data.slice(i*per,(i+1)*per)).out);
    console.log(JSON.stringify(out));"""
    try:
        r = subprocess.run(["node", "-e", betik], capture_output=True, text=True, check=True)
        return np.array(json.loads(r.stdout))
    finally:
        os.remove(gecici)
