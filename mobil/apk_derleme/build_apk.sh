#!/usr/bin/env bash
# Kullanım: build_apk.sh <www_klasoru> <paket_adi> "<Uygulama Adı>" <#renk> <ikon.png> <cikti.apk>
# Android SDK (platform 23 + build-tools) ile, Gradle kullanmadan küçük bir WebView APK'sı üretir.
set -euo pipefail
export JAVA_TOOL_OPTIONS=
WWW=$(realpath "$1"); PKG="$2"; LABEL="$3"; BAR="$4"; ICON=$(realpath "$5"); OUT=$(realpath -m "$6")
HERE=$(cd "$(dirname "$0")" && pwd)
SDK=/usr/lib/android-sdk
BT=$SDK/build-tools/29.0.3
JAR=$SDK/platforms/android-23/android.jar
W=$(mktemp -d)
mkdir -p "$W/src/${PKG//.//}" "$W/res/drawable" "$W/res/values" "$W/obj" "$W/bin"

sed -e "s/__PKG__/$PKG/" -e "s/__BAR__/$BAR/" "$HERE/src/MainActivity.java.tmpl" > "$W/src/${PKG//.//}/MainActivity.java"
cp "$ICON" "$W/res/drawable/ic_launcher.png"
cat > "$W/res/values/strings.xml" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<resources><string name="app_name">$LABEL</string></resources>
EOF
cat > "$W/AndroidManifest.xml" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="$PKG" android:versionCode="1" android:versionName="1.0">
    <uses-sdk android:minSdkVersion="21" android:targetSdkVersion="34" />
    <application android:label="@string/app_name" android:icon="@drawable/ic_launcher"
        android:allowBackup="false" android:hardwareAccelerated="true"
        android:theme="@android:style/Theme.Material.Light.NoActionBar">
        <activity android:name=".MainActivity" android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
EOF

javac -nowarn --release 8 -classpath "$JAR" -d "$W/obj" "$W/src/${PKG//.//}/MainActivity.java" 2>&1 | grep -v -e "JAVA_TOOL_OPTIONS" -e "^warning" -e "^1 warning" || true
"$BT/aapt" package -f -m -J "$W/src" -M "$W/AndroidManifest.xml" -S "$W/res" -A "$WWW" -I "$JAR" -F "$W/bin/unsigned.apk" > /dev/null
# R.java derlemesi (aapt üretti)
javac -nowarn --release 8 -classpath "$JAR" -d "$W/obj" $(find "$W/src" -name "*.java") 2>&1 | grep -v -e "JAVA_TOOL_OPTIONS" -e "^warning" -e "^1 warning" || true
"$BT/dx" --dex --min-sdk-version=21 --output="$W/bin/classes.dex" "$W/obj"
(cd "$W/bin" && "$BT/aapt" add unsigned.apk classes.dex > /dev/null)
"$BT/zipalign" -f -p 4 "$W/bin/unsigned.apk" "$W/bin/aligned.apk"
"$BT/apksigner" sign --ks "$HERE/saglikyz.keystore" --ks-pass pass:saglikyz --key-pass pass:saglikyz \
    --ks-key-alias saglikyz --min-sdk-version 21 --out "$OUT" "$W/bin/aligned.apk" 2>&1 | grep -v JAVA_TOOL || true
"$BT/apksigner" verify --verbose "$OUT" 2>&1 | grep -E "Verifies|v2 scheme" | grep -v JAVA_TOOL
rm -rf "$W"
echo "APK hazır: $OUT ($(du -h "$OUT" | cut -f1))"
