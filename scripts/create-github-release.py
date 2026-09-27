#!/usr/bin/env python3
"""
Create GitHub Release and upload assets to King-Austin/social using authenticated GitHub token.
"""
import sys
import os
import json
import urllib.request
import urllib.error
import subprocess
from pathlib import Path

REPO = "King-Austin/social"
TAG = "v1.0.1"
RELEASE_NAME = "SocialDL v1.0.1 - Live OTA Engine & Production API"

RELEASE_BODY = """# SocialDL v1.0.1 ⚡

Over-The-Air (OTA) updates, production API routing, and optimized package size.

### 🚀 What's New in v1.0.1
* **Over-The-Air (OTA) Engine:** Native background updater powered by Capgo. Once installed, future updates download and apply silently without reinstalling an APK.
* **Optimized Package Size:** Reduced APK download size from ~68MB down to **~5.8MB** (eliminated recursive self-packaging).
* **Production API Routing:** Mobile app natively routes through HTTPS reverse proxy (`https://social.nworahebuka.com.ng`), resolving cleartext network restrictions on Android 9+.
* **Dynamic In-App Versioning:** Active version detection in Settings/About screen with manual "Check for Updates" button.
* **Universal Downloader Support:** High-speed downloads for TikTok, Instagram, YouTube, Facebook, and Twitter/X with in-app player and history management.

### 📦 Downloads
| Asset | Description | Size |
| :--- | :--- | :--- |
| **SocialDL.apk** | Android Standalone Application | ~5.8 MB |
| **dist-v1.0.1.zip** | Over-The-Air (OTA) Web Bundle | ~95 KB |

---
*Built with ❤️ by [King-Austin](https://nworahebuka.com.ng/)*
"""

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
    print(f"⬆️ Uploading {file_path.name} ({file_path.stat().st_size / 1024 / 1024:.2f} MB)...")

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
    apk_path = root_dir / "SocialDL.apk"
    bundle_path = root_dir / "frontend" / "public" / "updates" / "dist-v1.0.1.zip"

    if not apk_path.exists():
        print(f"❌ Error: {apk_path} does not exist! Build APK first.", file=sys.stderr)
        sys.exit(1)

    print(f"🏷️ Checking release for tag {TAG} on {REPO}...")
    release = None
    try:
        release = api_request(f"https://api.github.com/repos/{REPO}/releases/tags/{TAG}")
        print(f"Found existing release ID {release['id']}. Deleting to recreate cleanly...")
        api_request(f"https://api.github.com/repos/{REPO}/releases/{release['id']}", method='DELETE')
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise

    print(f"🚀 Creating GitHub Release {TAG}...")
    payload = {
        "tag_name": TAG,
        "target_commitish": "main",
        "name": RELEASE_NAME,
        "body": RELEASE_BODY,
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
    print(f"🌟 GitHub Release {TAG} is LIVE!")
    print(f"🔗 View Release: {html_url}")
    print(f"📲 Direct APK Download: https://github.com/{REPO}/releases/download/{TAG}/SocialDL.apk")
    print("="*60)

if __name__ == '__main__':
    main()
