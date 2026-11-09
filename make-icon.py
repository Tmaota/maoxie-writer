# -*- coding: utf-8 -*-
"""把生成的图标处理成：去水印 + 圆角透明 + 输出 ico/png 多尺寸"""
from PIL import Image, ImageDraw, ImageFilter
import os

SRC = r"C:\Users\18435\Desktop\MAOXIEZUO\MAO\maoxie-writer\assets\icon-source.png"
OUT_DIR = r"C:\Users\18435\Desktop\MAOXIEZUO\MAO\maoxie-writer\build"
os.makedirs(OUT_DIR, exist_ok=True)

img = Image.open(SRC).convert("RGB")
w, h = img.size  # 1024

# 1) 去掉左下角「AI生成」水印：用右侧同高度的干净区域镜像填补
watermark_band = img.crop((0, h - 130, 220, h))           # 问题区域
clean_src = img.crop((w - 220, h - 130, w, h))            # 右下干净区
img.paste(clean_src.transpose(Image.FLIP_LEFT_RIGHT), (0, h - 130))

# 2) 圆角蒙版（半径 22%，羽化 2px 抗锯齿）
radius = int(w * 0.22)
mask = Image.new("L", (w * 4, h * 4), 0)                  # 4x 超采样抗锯齿
d = ImageDraw.Draw(mask)
d.rounded_rectangle((0, 0, w * 4, h * 4), radius=radius * 4, fill=255)
mask = mask.resize((w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(1))

icon = img.convert("RGBA")
icon.putalpha(mask)

# 3) 输出：桌面/开始菜单快捷方式用的大 PNG + electron-builder 的 ico
icon_256 = icon.resize((256, 256), Image.LANCZOS)
icon_256.save(os.path.join(OUT_DIR, "icon.png"))

ico = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
ico.paste(icon_256, (0, 0))
ico.save(
    os.path.join(OUT_DIR, "icon.ico"),
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
icon.resize((512, 512), Image.LANCZOS).save(r"C:\Users\18435\Desktop\MAOXIEZUO\MAO\maoxie-writer\assets\icon-512.png")
print("done:", os.listdir(OUT_DIR))
