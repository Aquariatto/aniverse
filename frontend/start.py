#!/usr/bin/env python3
"""AniVerse 角色宇宙 · 一键启动

打包版（含 dist 与零依赖服务端）只要求本机装了 Node 18+：
    python start.py

源码版（没有 dist）会先 npm install + npm run build 再启动。
"""
import os
import shutil
import socket
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

# 输出被重定向到文件时 Python 会攒缓冲，启动横幅要及时显示
try:
    sys.stdout.reconfigure(line_buffering=True)
except (AttributeError, ValueError):
    pass


def read_env(path):
    """自己读 .env：--env-file 要 Node 20.6+，这里兼容 Node 18。"""
    values = {}
    if not os.path.isfile(path):
        return values
    with open(path, encoding="utf-8", errors="replace") as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def port_free(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(0.4)
        return probe.connect_ex(("127.0.0.1", port)) != 0


def pause():
    try:
        input("\n按回车键退出…")
    except (EOFError, KeyboardInterrupt):
        pass


def main():
    print("=" * 52)
    print("  AniVerse 角色宇宙 · 一键启动")
    print("=" * 52)

    node = shutil.which("node")
    if node is None:
        print("\n[错误] 没找到 Node.js，请先安装 Node 18 或更高版本")
        print("       下载地址：https://nodejs.org/zh-cn")
        pause()
        return 1
    version = subprocess.run([node, "-v"], capture_output=True, text=True).stdout.strip()
    print(f"\n  Node 版本：{version}")

    env_file = os.path.join(ROOT, ".env")
    if not os.path.isfile(env_file):
        print("  [提示] 缺少 .env，AI 相关功能会不可用，页面仍可正常浏览")

    # 打包版：dist 已构建，直接起服务（不需要 npm / node_modules / 联网）
    if not os.path.isfile(os.path.join(ROOT, "dist", "index.html")):
        print("\n  [1/2] 未发现构建产物，开始安装依赖并构建…")
        if shutil.which("npm") is None:
            print("[错误] 缺少 dist 且找不到 npm，无法构建")
            pause()
            return 1
        # 素材（图片、音乐）只在 public/ 里，构建时会整体拷进 dist。
        # 打包版默认带着构建好的 dist，不需要跑这一步；
        # 如果既没有 dist 又缺 public，构建出来的站点会没有图片和音乐。
        public_dir = os.path.join(ROOT, "public")
        if not os.path.isdir(public_dir) or not os.listdir(public_dir):
            print("  [警告] 未找到 public/ 素材目录：")
            print("         这样构建出来的站点不会有角色立绘、场景和音乐。")
            print("         需要完整素材，请使用包含 public/ 的项目目录。")
        for command in ("npm install --registry=https://registry.npmmirror.com", "npm run build"):
            print(f"\n  >>> {command}")
            if subprocess.run(command, shell=True).returncode != 0:
                print(f"[失败] {command}")
                pause()
                return 1

    env = dict(os.environ)
    env.update(read_env(env_file))
    port = env.get("PORT", "8787")
    host = env.get("HOST", "127.0.0.1")
    shown = "127.0.0.1" if host in ("0.0.0.0", "::") else host
    url = f"http://{shown}:{port}"

    print(f"\n  服务地址：{url}")
    try:
        busy = not port_free(int(port))
    except ValueError:
        busy = False
    if busy:
        print(f"  [提示] 端口 {port} 已被占用（可能已经启动过），直接打开上面的地址试试")
    print("  停止服务：Ctrl + C\n" + "-" * 52)

    try:
        return subprocess.run([node, "server/index.mjs"], env=env).returncode
    except KeyboardInterrupt:
        print("\n  已停止。")
        return 0


if __name__ == "__main__":
    sys.exit(main())
