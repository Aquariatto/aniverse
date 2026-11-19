# AniVerse · 角色宇宙

一个「AI 角色陪伴」演示项目：角色大厅、多角色对话、记忆系统、剧情分支、追番清单、数据仪表盘、
图库与 AI 生图工作台、音乐播放器。

> 课程作业 / 教学演示项目，非商业产品。

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Vue 3.5 `<script setup>` + TypeScript + Vite 6 + Pinia + vue-router |
| 样式 | 原生 CSS（含暗色主题、动效系统），无 UI 框架 |
| 图表 / 3D | ECharts 5、three.js |
| 后端 | Node 20+ 原生 `http` 模块，**零依赖**（不装任何 npm 包） |
| 数据 | 浏览器 localStorage（服务端不存聊天记录） |

## 目录

```
frontend/                 前端源码 + 后端服务
  src/                    Vue 源码（views / components / stores / data）
  server/index.mjs        Node 服务：对话、生图、音乐、超分、日志
  public/                 静态资源（图片 WebP、音乐、歌单）
  scripts/                构建与工具脚本（图片转换、歌单抓取）
  start.py                一键启动（自动读 .env、起服务）
aniverse-release/         已构建的可直接运行副本（不入库）
*.md / *.txt / *.docx     设计文档、接口说明、交接记录
```

## 快速开始

```bash
cd frontend
cp .env.example .env        # 然后填入自己的密钥
python start.py             # 或 npm install && npm run build && node server/index.mjs
```

默认端口 `8787`，启动后打开 <http://127.0.0.1:8787>。

### 需要配置的密钥

| 变量 | 用途 | 不填的影响 |
|---|---|---|
| `DEEPSEEK_API_KEY` | 对话、剧情、记忆提取、提示词润色 | 对话功能不可用 |
| `IMAGE_API_KEY` | AI 生图（OpenAI 兼容网关） | 生图工作台不可用 |
| `TENCENT_SECRET_ID/KEY` + `TENCENT_COS_BUCKET/REGION` | 腾讯云数据万象 AI 超分 | 超分按钮自动隐藏 |
| `ADMIN_TOKEN` | 查看生图请求日志 `/api/image/log` | 日志接口仅本机可访问 |

> `.env` 已加入 `.gitignore`，不会被提交。

## 文档

| 文件 | 内容 |
|---|---|
| `AniVerse-说明文档.txt` | 完整功能说明与操作指引 |
| `AniVerse-应用层接口说明.md` / `.docx` | 前后端接口约定 |
| `DeepSeek业务接入交接.md` | 对话与记忆链路的接入细节 |
| `V2-改进说明.md` / `V3-改进说明.md` | 版本迭代记录 |

## 免责声明

- 本项目为课程作业，仅供学习、演示与教学交流，不作商业用途。
- 角色名与剧情均为虚构；内置音乐资源仅用于本地演示，版权归原权利方所有。
- 仓库中**不包含**任何 API 密钥；`.env.example` 仅给出变量清单。
