#!/usr/bin/env python3
"""
Generate pixel-perfect custom app icons and splash screens for SocialDL.
Generates all Android mipmaps (mdpi..xxxhdpi), round, adaptive foreground,
portrait and landscape splash screens, and web icons.
"""
import os
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT_DIR = Path(__file__).resolve().parent.parent
RES_DIR = ROOT_DIR / "frontend" / "android" / "app" / "src" / "main" / "res"
PUBLIC_DIR = ROOT_DIR / "frontend" / "public"

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

def draw_rounded_rect(draw, bbox, radius, fill):
    x0, y0, x1, y1 = bbox
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=fill)

def create_master_icon(size=1024, transparent_bg=False):
    """Creates a modern luxury SocialDL icon"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    scale = size / 1024.0

    if not transparent_bg:
        # Background Squircle: Luxury dark slate with subtle radial warmth
        bg_radius = int(224 * scale)
        bg_color = (11, 15, 25, 255) # #0B0F19
        draw.rounded_rectangle([0, 0, size, size], radius=bg_radius, fill=bg_color)

        # Subtle dark border
        draw.rounded_rectangle([0, 0, size, size], radius=bg_radius, outline=(255, 255, 255, 20), width=int(4 * scale))

    # Outer ambient glow behind the badge
    center_x = size // 2
    center_y = size // 2

    # Draw vibrant concentric pulse rings
    ring_color = (234, 88, 12, 50)
    for r in [int(370 * scale), int(330 * scale)]:
        draw.ellipse([center_x - r, center_y - r, center_x + r, center_y + r], outline=ring_color, width=int(12 * scale))

    # Inner Emblem Circle Badge with vertical warm gradient
    badge_r = int(270 * scale)
    badge_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    badge_draw = ImageDraw.Draw(badge_img)

    # Vertical gradient for badge: #EA580C (234, 88, 12) -> #F97316 (249, 115, 22) -> #FB923C (251, 146, 60)
    top_y = center_y - badge_r
    bot_y = center_y + badge_r
    for y in range(top_y, bot_y):
        ratio = (y - top_y) / (2 * badge_r)
        r = int(249 - ratio * 20)
        g = int(115 - ratio * 35)
        b = int(22 - ratio * 15)
        badge_draw.line([(center_x - badge_r, y), (center_x + badge_r, y)], fill=(r, g, b, 255))

    # Mask badge into a circle
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.ellipse([center_x - badge_r, center_y - badge_r, center_x + badge_r, center_y + badge_r], fill=255)
    
    # Soft drop shadow for badge
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.ellipse([center_x - badge_r, center_y - badge_r + int(14*scale), center_x + badge_r, center_y + badge_r + int(14*scale)], fill=(0, 0, 0, 100))
    shadow = shadow.filter(ImageFilter.GaussianBlur(int(24 * scale)))
    img = Image.alpha_composite(img, shadow)

    img.paste(badge_img, (0, 0), mask)

    # Crisp white rim highlight on badge
    draw = ImageDraw.Draw(img)
    draw.ellipse([center_x - badge_r, center_y - badge_r, center_x + badge_r, center_y + badge_r], outline=(255, 255, 255, 70), width=int(5 * scale))

    # Draw the High-Tech Speed Download Arrow + Tray in crisp pure white (#FFFFFF)
    # 1. Download arrow stem
    stem_w = int(48 * scale)
    stem_top = center_y - int(120 * scale)
    stem_bot = center_y + int(45 * scale)
    draw.rounded_rectangle([center_x - stem_w // 2, stem_top, center_x + stem_w // 2, stem_bot], radius=int(14 * scale), fill=(255, 255, 255, 255))

    # 2. Chevron arrow head
    head_pts = [
        (center_x, center_y + int(120 * scale)),                     # bottom tip
        (center_x - int(110 * scale), center_y + int(15 * scale)),   # left wing
        (center_x - int(65 * scale), center_y + int(15 * scale)),    # left inner
        (center_x, center_y + int(75 * scale)),                      # inner tip
        (center_x + int(65 * scale), center_y + int(15 * scale)),    # right inner
        (center_x + int(110 * scale), center_y + int(15 * scale)),   # right wing
    ]
    draw.polygon(head_pts, fill=(255, 255, 255, 255))

    # 3. Floating Speed Bracket / Tray underneath
    tray_y = center_y + int(160 * scale)
    tray_w = int(210 * scale)
    tray_h = int(32 * scale)
    draw.rounded_rectangle([center_x - tray_w // 2, tray_y, center_x + tray_w // 2, tray_y + tray_h], radius=int(16 * scale), fill=(255, 255, 255, 255))

    return img

def create_circular_icon(base_icon):
    """Masks an icon into a circle for ic_launcher_round"""
    size = base_icon.size[0]
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse([0, 0, size, size], fill=255)
    
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(base_icon, (0, 0), mask)
    return out

def create_adaptive_foreground(size=432):
    """Creates transparent foreground with the emblem sized to 66dp standard"""
    # Android adaptive icon is 108dp x 108dp (432px at xxxhdpi), with 66dp (264px) safe center
    master = create_master_icon(size=1024, transparent_bg=True)
    # Resize emblem to fit within 264px safe circle
    emblem_size = int(size * 0.65)
    emblem_resized = master.resize((emblem_size, emblem_size), Image.Resampling.LANCZOS)
    
    fg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    offset = (size - emblem_size) // 2
    fg.paste(emblem_resized, (offset, offset), emblem_resized)
    return fg

def create_splash_screen(width=1280, height=1920):
    """Creates cinematic dark splash screen with glowing SocialDL branding"""
    img = Image.new("RGBA", (width, height), (11, 15, 25, 255)) # #0B0F19
    draw = ImageDraw.Draw(img)

    # Ambient radial glow behind emblem
    center_x = width // 2
    is_portrait = height >= width
    center_y = int(height * 0.44) if is_portrait else int(height * 0.46)

    glow_radius = int(min(width, height) * 0.45)
    glow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse([center_x - glow_radius, center_y - glow_radius, center_x + glow_radius, center_y + glow_radius], fill=(234, 88, 12, 45))
    glow = glow.filter(ImageFilter.GaussianBlur(int(glow_radius * 0.5)))
    img = Image.alpha_composite(img, glow)
    draw = ImageDraw.Draw(img)

    # Render emblem
    icon_dim = int(min(width, height) * 0.28)
    master_icon = create_master_icon(size=512)
    emblem = master_icon.resize((icon_dim, icon_dim), Image.Resampling.LANCZOS)
    img.paste(emblem, (center_x - icon_dim // 2, center_y - icon_dim // 2), emblem)

    # Typography
    try:
        title_font_size = int(min(width, height) * 0.075)
        sub_font_size = int(min(width, height) * 0.032)
        credit_font_size = int(min(width, height) * 0.024)

        title_font = ImageFont.truetype(FONT_BOLD, title_font_size)
        sub_font = ImageFont.truetype(FONT_REGULAR, sub_font_size)
        credit_font = ImageFont.truetype(FONT_REGULAR, credit_font_size)
    except Exception as e:
        title_font = ImageFont.load_default()
        sub_font = ImageFont.load_default()
        credit_font = ImageFont.load_default()

    # App Title: SocialDL
    title_text = "SocialDL"
    title_bbox = draw.textbbox((0, 0), title_text, font=title_font)
    title_w = title_bbox[2] - title_bbox[0]
    title_y = center_y + icon_dim // 2 + int(36 * (min(width, height) / 1000))
    draw.text((center_x - title_w // 2, title_y), title_text, fill=(255, 255, 255, 255), font=title_font)

    # Subtitle: Universal Media Saver
    sub_text = "Universal Media Saver"
    sub_bbox = draw.textbbox((0, 0), sub_text, font=sub_font)
    sub_w = sub_bbox[2] - sub_bbox[0]
    sub_y = title_y + (title_bbox[3] - title_bbox[1]) + int(18 * (min(width, height) / 1000))
    draw.text((center_x - sub_w // 2, sub_y), sub_text, fill=(148, 163, 184, 255), font=sub_font)

    # Footer Credit: Built with ❤️ by King-Austin
    credit_text = "Built with ❤️ by King-Austin"
    credit_bbox = draw.textbbox((0, 0), credit_text, font=credit_font)
    credit_w = credit_bbox[2] - credit_bbox[0]
    credit_y = height - int(80 * (min(width, height) / 1000))
    draw.text((center_x - credit_w // 2, credit_y), credit_text, fill=(100, 116, 139, 255), font=credit_font)

    return img.convert("RGB")

def main():
    print("🎨 Generating SocialDL Master Brand Identity...")
    master_icon = create_master_icon(1024)
    circular_icon = create_circular_icon(master_icon)

    # Android Launcher Icon Density Specs
    densities = {
        "mdpi": (48, 108),
        "hdpi": (72, 162),
        "xhdpi": (96, 216),
        "xxhdpi": (144, 324),
        "xxxhdpi": (192, 432),
    }

    print("📱 Rendering Android Mipmap Icons...")
    for den, (icon_sz, fg_sz) in densities.items():
        folder = RES_DIR / f"mipmap-{den}"
        folder.mkdir(parents=True, exist_ok=True)

        # Standard launcher icon
        std_icon = master_icon.resize((icon_sz, icon_sz), Image.Resampling.LANCZOS)
        std_icon.save(folder / "ic_launcher.png", "PNG", optimize=True)

        # Round launcher icon
        rnd_icon = circular_icon.resize((icon_sz, icon_sz), Image.Resampling.LANCZOS)
        rnd_icon.save(folder / "ic_launcher_round.png", "PNG", optimize=True)

        # Adaptive icon foreground
        fg_icon = create_adaptive_foreground(fg_sz)
        fg_icon.save(folder / "ic_launcher_foreground.png", "PNG", optimize=True)
        print(f"  ✓ mipmap-{den} (icon: {icon_sz}px, fg: {fg_sz}px)")

    # Portrait Splash Screens
    port_densities = {
        "mdpi": (320, 480),
        "hdpi": (480, 800),
        "xhdpi": (640, 960),
        "xxhdpi": (960, 1600),
        "xxxhdpi": (1280, 1920),
    }

    print("🌅 Rendering Portrait Splash Screens...")
    for den, (w, h) in port_densities.items():
        folder = RES_DIR / f"drawable-port-{den}"
        folder.mkdir(parents=True, exist_ok=True)
        splash = create_splash_screen(w, h)
        splash.save(folder / "splash.png", "PNG", optimize=True)
        print(f"  ✓ drawable-port-{den} ({w}x{h})")

    # Landscape Splash Screens
    land_densities = {
        "mdpi": (480, 320),
        "hdpi": (800, 480),
        "xhdpi": (960, 640),
        "xxhdpi": (1600, 960),
        "xxxhdpi": (1920, 1280),
    }

    print("🌄 Rendering Landscape Splash Screens...")
    for den, (w, h) in land_densities.items():
        folder = RES_DIR / f"drawable-land-{den}"
        folder.mkdir(parents=True, exist_ok=True)
        splash = create_splash_screen(w, h)
        splash.save(folder / "splash.png", "PNG", optimize=True)
        print(f"  ✓ drawable-land-{den} ({w}x{h})")

    # Fallback splash.png in drawable/
    fallback_folder = RES_DIR / "drawable"
    fallback_folder.mkdir(parents=True, exist_ok=True)
    fallback_splash = create_splash_screen(1280, 1920)
    fallback_splash.save(fallback_folder / "splash.png", "PNG", optimize=True)
    print("  ✓ drawable/splash.png (fallback)")

    # Web & PWA Assets
    print("🌐 Generating Web Icons...")
    web_icon_512 = master_icon.resize((512, 512), Image.Resampling.LANCZOS)
    web_icon_512.save(PUBLIC_DIR / "icon-512.png", "PNG", optimize=True)

    web_icon_192 = master_icon.resize((192, 192), Image.Resampling.LANCZOS)
    web_icon_192.save(PUBLIC_DIR / "icon-192.png", "PNG", optimize=True)
    print("  ✓ frontend/public/icon-512.png & icon-192.png")

    print("\n🎉 All custom icons and cinematic splash screens successfully created!")

if __name__ == '__main__':
    main()
