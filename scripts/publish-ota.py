#!/usr/bin/env python3
import sys
import os
import json
import zipfile
import subprocess
from pathlib import Path

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 publish-ota.py <version> [changelog]")
        print("Example: python3 publish-ota.py 1.0.1 \"UI polish and bug fixes\"")
        sys.exit(1)

    version = sys.argv[1].lstrip('v')
    changelog = sys.argv[2] if len(sys.argv) > 2 else f"Update release v{version}"

    root_dir = Path(__file__).resolve().parent.parent
    frontend_dir = root_dir / "frontend"
    dist_dir = frontend_dir / "dist"
    updates_dir = frontend_dir / "public" / "updates"
    updates_dir.mkdir(parents=True, exist_ok=True)

    print(f"📦 Packaging OTA Update v{version}...")

    # 1. Run frontend build
    print("🔨 Running 'npm run build'...")
    build_res = subprocess.run(["npm", "run", "build"], cwd=frontend_dir)
    if build_res.returncode != 0:
        print("❌ Build failed! Aborting OTA publish.")
        sys.exit(1)

    # 2. Package zip excluding any binaries
    zip_filename = f"dist-v{version}.zip"
    zip_path = updates_dir / zip_filename
    print(f"🗜️ Compressing web bundle into {zip_filename}...")

    count = 0
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for f in dist_dir.rglob('*'):
            if f.is_file() and not f.name.endswith('.apk') and 'updates' not in f.parts:
                zipf.write(f, f.relative_to(dist_dir))
                count += 1

    size_kb = zip_path.stat().st_size / 1024
    print(f"✅ Packaged {count} files ({size_kb:.1f} KB)")

    # 3. Update version.json manifest
    manifest_path = updates_dir / "version.json"
    manifest = {
        "version": version,
        "bundle_url": f"https://social.nworahebuka.com.ng/updates/{zip_filename}",
        "apk_url": "https://social.nworahebuka.com.ng/SocialDL.apk",
        "changelog": changelog
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"📝 Updated manifest: {manifest_path}")
    print(f"\n🎉 Successfully published OTA Update v{version}!")
    print("Users with SocialDL installed will automatically receive this update on next launch.")

if __name__ == "__main__":
    main()
