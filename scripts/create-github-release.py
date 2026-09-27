#!/usr/bin/env python3
"""
Create GitHub Release and upload assets to King-Austin/social using authenticated GitHub token.
Reads version and changelog automatically from frontend/public/updates/version.json or CLI arguments.
"""
import sys
import os
import json
import urllib.request
import urllib.error
import subprocess
from pathlib import Path

REPO = "King-Austin/social"

def get_token():
    env_token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if env_token:
        return env_token
    p = subprocess.Popen(['git', 'credential', 'fill'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    out, _ = p.communicate('protocol=https\nhost=github.com\n\n')
    for line in out.splitlines():
        if line.startswith('password='):
            return line.split('=', 1)[1]
    raise RuntimeError("Could not retrieve GitHub token from git credentials.")

def api_request(url, method='GET', data=None, content_type='application/json'):
    token = get_token()
    headers = {
        'Authorization': f'Bearer {token}',
        'User-Agent': 'SocialDL-Release-Script',
        'Accept': 'application/vnd.github+json'
    }
    if content_type:
        headers['Content-Type'] = content_type

    body = data
    if isinstance(data, dict):
        body = json.dumps(data).encode('utf-8')

    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read()
            return json.loads(raw.decode('utf-8')) if raw else {}
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode('utf-8', errors='replace')
        print(f"API Error {e.code} for {method} {url}: {err_msg}", file=sys.stderr)
        raise

def upload_asset(upload_url_template, file_path, content_type):
    token = get_token()
    upload_url = upload_url_template.split('{')[0] + f"?name={file_path.name}"
    size_mb = file_path.stat().st_size / 1024 / 1024
    print(f"⬆️ Uploading {file_path.name} ({size_mb:.2f} MB)...")

    headers = {
        'Authorization': f'Bearer {token}',
        'User-Agent': 'SocialDL-Release-Script',
        'Content-Type': content_type,
        'Accept': 'application/vnd.github+json'
    }

    with open(file_path, 'rb') as f:
        file_data = f.read()

    req = urllib.request.Request(upload_url, data=file_data, headers=headers, method='POST')
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read().decode('utf-8'))
        print(f"✅ Uploaded {file_path.name}: {result.get('browser_download_url')}")
        return result

def main():
    root_dir = Path(__file__).resolve().parent.parent
    version_json = root_dir / "frontend" / "public" / "updates" / "version.json"

    version_str = "1.0.2"
    changelog_str = "Custom luxury brand identity & cinematic splash screen"

    if version_json.exists():
        try:
            data = json.loads(version_json.read_text(encoding="utf-8"))
            version_str = data.get("version", version_str)
            changelog_str = data.get("changelog", changelog_str)
        except Exception as e:
            print("Notice reading version.json:", e)

    if len(sys.argv) > 1:
        version_str = sys.argv[1].lstrip('v')
    if len(sys.argv) > 2:
        changelog_str = sys.argv[2]

    tag = f"v{version_str}"
    release_name = f"SocialDL v{version_str} - Custom Brand Identity & Cinematic Splash"

    apk_path = root_dir / "SocialDL.apk"
    bundle_path = root_dir / "frontend" / "public" / "updates" / f"dist-v{version_str}.zip"

    if not apk_path.exists():
        print(f"❌ Error: {apk_path} does not exist! Build APK first.", file=sys.stderr)
        sys.exit(1)

    apk_size_mb = f"{apk_path.stat().st_size / 1024 / 1024:.2f} MB"
    bundle_size_kb = f"{bundle_path.stat().st_size / 1024:.1f} KB" if bundle_path.exists() else "N/A"

    release_body = f"""# SocialDL {tag} ⚡

{changelog_str}

### 🚀 Highlights in {tag}
* **Custom Brand Identity:** Replaced generic Capacitor icon with custom SocialDL luxury squircle (deep slate with luminous sunset orange emblem).
* **Cinematic Splash Screen:** Native dark-mode launch screen with glowing emblem and King-Austin branding.
* **Over-The-Air (OTA) Engine:** Native background updater powered by Capgo. Once installed, future updates download and apply silently without reinstalling an APK.
* **Lightweight Standalone APK:** Optimized package size ({apk_size_mb}) with zero redundant bloated nested binaries.
* **Production API Routing:** Mobile app natively routes through HTTPS reverse proxy (`https://social.nworahebuka.com.ng`), resolving cleartext network restrictions on Android 9+.
* **Universal Downloader Support:** High-speed downloads for TikTok, Instagram, YouTube, Facebook, and Twitter/X with in-app player and history management.

### 📦 Downloads
| Asset | Description | Size |
| :--- | :--- | :--- |
| **SocialDL.apk** | Android Standalone Application | {apk_size_mb} |
| **dist-{tag}.zip** | Over-The-Air (OTA) Web Bundle | {bundle_size_kb} |

---
*Built with ❤️ by [King-Austin](https://nworahebuka.com.ng/)*
"""

    print(f"🏷️ Checking release for tag {tag} on {REPO}...")
    try:
        existing = api_request(f"https://api.github.com/repos/{REPO}/releases/tags/{tag}")
        print(f"Found existing release ID {existing['id']}. Deleting to recreate cleanly...")
        api_request(f"https://api.github.com/repos/{REPO}/releases/{existing['id']}", method='DELETE')
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise

    print(f"🚀 Creating GitHub Release {tag}...")
    payload = {
        "tag_name": tag,
        "target_commitish": "main",
        "name": release_name,
        "body": release_body,
        "draft": False,
        "prerelease": False
    }

    new_release = api_request(f"https://api.github.com/repos/{REPO}/releases", method='POST', data=payload)
    upload_url_template = new_release['upload_url']
    html_url = new_release['html_url']
    print(f"🎉 Created Release: {html_url}")

    # Upload APK
    upload_asset(upload_url_template, apk_path, "application/vnd.android.package-archive")

    # Upload OTA Bundle if exists
    if bundle_path.exists():
        upload_asset(upload_url_template, bundle_path, "application/zip")

    print("\n" + "="*60)
    print(f"🌟 GitHub Release {tag} is LIVE!")
    print(f"🔗 View Release: {html_url}")
    print(f"📲 Direct APK Download: https://github.com/{REPO}/releases/download/{tag}/SocialDL.apk")
    print("="*60)

if __name__ == '__main__':
    main()
