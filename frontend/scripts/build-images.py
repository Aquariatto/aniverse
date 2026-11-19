#!/usr/bin/env python3
"""
素材派生图生成：assets-src 里的原始 PNG → 两档 WebP（大图 + 640 缩略）。

    python scripts/build-images.py

- 大图：长边 1280（立绘 1024），q92，保留 alpha —— 视觉无损，体积约为 PNG 的 12~18%
- 缩略：长边 640，q86 —— 给头像 / 卡片 / 瀑布流用，约 40~80 KB
- 原始 PNG 保留在 assets-src/（不进 dist，也不参与部署），随时可以重新生成

产物：
    public/assets/character/C001.webp / C001-640.webp
    public/assets/cg/F01-1.webp      / F01-1-640.webp
    public/assets/scene/S01.webp     / S01-640.webp
    public/images/seira-keyvisual.webp / ...-640.webp
"""
import os
import sys
from concurrent.futures import ProcessPoolExecutor

try:
    from PIL import Image
except ImportError:
    sys.exit('需要 Pillow：pip install pillow')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets-src')
PUBLIC = os.path.join(ROOT, 'public')

# 目录名, 输出目录, 大图长边, 大图质量
# 原始素材是 941×1672（立绘）/ 1672×941（场景、CG），长边给到 1600 ≈ 原生分辨率，
# 只砍 4% 线性尺寸，肉眼看不出差别；别再往下压，立绘和大屏背景会发虚。
GROUPS = [
    ('character', 'assets/character', 1600, 92),
    ('cg', 'assets/cg', 1600, 92),
    ('scene', 'assets/scene', 1600, 92),
    ('images', 'images', 1600, 92),
]
THUMB_EDGE = 640
THUMB_QUALITY = 86


def build_one(task):
    src_path, out_path, big_edge, big_quality = task
    try:
        image = Image.open(src_path)
    except Exception as error:                                    # noqa: BLE001
        return (src_path, 0, 0, 0, str(error))

    if image.mode == 'P':
        image = image.convert('RGBA' if 'transparency' in image.info else 'RGB')
    elif image.mode not in ('RGB', 'RGBA', 'L'):
        image = image.convert('RGBA' if image.mode in ('LA', 'PA') else 'RGB')

    big = image.copy()
    big.thumbnail((big_edge, big_edge), Image.LANCZOS)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    big.save(out_path, 'WEBP', quality=big_quality, method=6)

    thumb_path = out_path[:-len('.webp')] + f'-{THUMB_EDGE}.webp'
    thumb = image.copy()
    thumb.thumbnail((THUMB_EDGE, THUMB_EDGE), Image.LANCZOS)
    thumb.save(thumb_path, 'WEBP', quality=THUMB_QUALITY, method=6)

    return (out_path, os.path.getsize(src_path), os.path.getsize(out_path),
            os.path.getsize(thumb_path), '')


def main():
    tasks = []
    for folder, out_dir, big_edge, big_quality in GROUPS:
        src_dir = os.path.join(SRC, folder)
        if not os.path.isdir(src_dir):
            print(f'跳过（不存在）：{src_dir}')
            continue
        for name in sorted(os.listdir(src_dir)):
            if not name.lower().endswith('.png'):
                continue
            out_path = os.path.join(PUBLIC, out_dir.replace('/', os.sep), name[:-4] + '.webp')
            tasks.append((os.path.join(src_dir, name), out_path, big_edge, big_quality))

    if not tasks:
        sys.exit('没有找到可处理的 PNG，请先确认 assets-src/ 下有素材')

    print(f'共 {len(tasks)} 张原始 PNG，开始生成 WebP…')
    total_src = total_big = total_thumb = 0
    failures = []
    with ProcessPoolExecutor() as pool:
        for index, (out_path, src_size, big_size, thumb_size, error) in enumerate(pool.map(build_one, tasks), 1):
            if error:
                failures.append((out_path, error))
                continue
            total_src += src_size
            total_big += big_size
            total_thumb += thumb_size
            if index % 20 == 0 or index == len(tasks):
                print(f'  {index}/{len(tasks)} …')

    mb = lambda value: f'{value / 1048576:.1f} MB'               # noqa: E731
    if total_src:
        print(f'\n原始 PNG : {mb(total_src)}')
        print(f'大图 WebP: {mb(total_big)}  （{total_big / total_src * 100:.1f}%）')
        print(f'缩略 WebP: {mb(total_thumb)}  （{total_thumb / total_src * 100:.1f}%）')
    if failures:
        print(f'\n失败 {len(failures)} 张：')
        for path, error in failures[:10]:
            print(f'  {os.path.basename(path)}: {error}')

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
