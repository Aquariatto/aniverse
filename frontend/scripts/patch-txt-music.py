#!/usr/bin/env python3
"""把音乐模块补进 AniVerse-说明文档.txt（纯文本版）。"""
import io
import os
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, '..', 'AniVerse-说明文档.txt')

text = io.open(PATH, encoding='utf-8-sig').read()
raw = io.open(PATH, 'rb').read()
has_bom = raw.startswith(b'\xef\xbb\xbf')

MUSIC_37 = """3.7 全站音乐播放器

  · 三级渐进交互
    一级：圆形按钮，当前封面做圆形裁切，外圈是 SVG
    环形进度（随播放进度推进，跨页面同步）；
    二级：点击后向下弹出方形面板，含封面、歌名、
    歌手、上一首/播放暂停/下一首、可拖动进度条；
    三级：默认折叠的搜索入口，展开后是搜索框
    + 3 条结果，点结果即刻播放并自动收起。

  · 内置离线歌单
    随站点分发 10 首《塞壬唱片》精选曲目
    （mp3 + 封面 + playlist.json），首屏即加载、
    首曲音源预挂好，点播放零延迟，放完自动续播；
    歌单由脚本按热度与可播性检索、探测后生成。

  · 搜索点播
    服务端把多组查询合并去重，按歌名相似度、
    歌手/厂牌命中、热度打分，并并行探测前 5 首的
    可播性，优先返回能播的；需要会员的标 VIP 角标。
    厂牌名做双向包含匹配，避免只按歌名匹配搜不到。

  · 播放与位置适配
    audio 是模块级单例，切页面不中断；
    进度条支持按下定位与拖动跟随，
    元数据未就绪时暂存拖动量、加载完补上。
    普通页面嵌在顶栏；首页默认与导航文字同一水平线，
    下滚 64 像素后钉到左上角常驻，滚回顶部自动归位。

"""

MUSIC_API = """  GET   /api/music/search?q=          歌曲搜索（打分排序 +
                                      可播性探测）
  GET   /api/music/url?id=            解析单曲音源地址
  GET   /api/music/stream?id=         音源代理（透传 Range，
                                      支持拖动进度）
"""

old_tail_36 = """    确认后写入本地标记，不再重复打扰。


四、技术栈"""
new_tail_36 = """    确认后写入本地标记，不再重复打扰。

""" + MUSIC_37 + """
四、技术栈"""
assert old_tail_36 in text, '3.6 → 四、技术栈 之间没找到插入点'
text = text.replace(old_tail_36, new_tail_36, 1)

# 5.5 标题与表格
assert '5.5 API 清单（13 个）' in text
text = text.replace('5.5 API 清单（13 个）', '5.5 API 清单（16 个）', 1)

old_last_api = """  POST  /api/catalog/ai-recommend     描述式检索 → 候选卡片 + 推荐语"""
assert old_last_api in text
text = text.replace(old_last_api, old_last_api + '\n' + MUSIC_API.rstrip('\n'), 1)

# 技术栈里的接口数量
text = text.replace('静态托管 + 13 个 API', '静态托管 + 16 个 API')

# 5.6 持久化
text = text.replace('Pinia store 的 7 个命名空间由 App.vue 统一合并写入：',
                    'Pinia store 的 8 个命名空间由 App.vue 统一合并写入：', 1)
old_last_key = "  aniverse.story.slot1.v1  叙事推演存档（回合序列 + 世界状态）"
assert old_last_key in text
text = text.replace(old_last_key, old_last_key + """
  aniverse.music.v1        上次播放的歌曲（跨页面续播，
                           重启后仍在）""", 1)

# 已知限制：素材那条改成 WebP，并补音乐一条
text = text.replace("""  2. 素材为 PNG，总计 230 MB：部署体积与首屏加载偏重，
     转 WebP 预计可压缩至 30 MB 以内。""",
"""  2. 素材已转 WebP：245 MB PNG → 43 MB（大图 + 缩略），
     原始 PNG 保留在 assets-src/，不进部署包，
     可用 scripts/build-images.py 重新生成。""", 1)

text = text.replace("""  7. 观测面板的趋势图与事件流为示例数据（界面已标注），
     其余指标为真实统计。""",
"""  7. 观测面板的趋势图与事件流为示例数据（界面已标注），
     其余指标为真实统计。

  8. 音乐依赖第三方非官方接口：搜索与音源解析无 SLA、
     随时可能失效；需要会员或已下架的曲目无法播放
     （列表中标 VIP）。内置 10 首随站点分发，不受影响。""", 1)

# 项目约定：素材目录改名
text = text.replace("""  1. 不得删除 public/assets/ 下的素材
     （立绘、CG、场景为长期生成成果，删除需重新生成）""",
"""  1. 不得删除 assets-src/ 下的原始素材
     （立绘、CG、场景为长期生成成果，删除需重新生成；
       public/ 下是对应的 WebP 派生图）""", 1)

# 写回：保持 UTF-8 BOM + CRLF
data = text.replace('\r\n', '\n').replace('\n', '\r\n')
io.open(PATH, 'w', encoding='utf-8-sig', newline='').write(data)


def display_width(line: str) -> int:
    return sum(2 if unicodedata.east_asian_width(ch) in 'WF' else 1 for ch in line)


lines = io.open(PATH, encoding='utf-8-sig').read().split('\n')
wide = [(i + 1, display_width(l), l) for i, l in enumerate(lines) if display_width(l) > 71]
print('总行数:', len(lines))
print('超过 71 显示宽度的行:', len(wide))
for number, width, line in wide[:8]:
    print(f'  L{number} 宽{width}: {line[:40]}')
print('BOM:', has_bom, '· 段落含 3.7:', '3.7 全站音乐播放器' in text)
