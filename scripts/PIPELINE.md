# 播客转录流水线指南

本项目将英文播客转录、对齐词级时间戳、翻译成中文，最终写入 `src/data/mockEpisodes.ts`。

---

## 推荐方案：mlx-whisper + WhisperX（Apple Silicon 专属）

### 为什么选这个组合？

| 步骤 | 工具 | 运行设备 | 说明 |
|---|---|---|---|
| 转录 | **mlx-whisper** | Apple GPU / Neural Engine | Apple MLX 框架原生实现，比 CPU Whisper 快 ~10x |
| 词级对齐 | **WhisperX align** | MPS（Apple GPU） | 把粗糙的时间戳精确到每个词 |
| 翻译 | deep-translator | 网络请求 | Google Translate API，免费 |

### 速度对比（M2 MacBook，76 分钟音频）

| 方案 | 转录耗时 | 备注 |
|---|---|---|
| faster-whisper medium（CPU）| ~40 分钟 | ctranslate2 不支持 MPS |
| **mlx-whisper medium（GPU）** | **~4 分钟** | Apple MLX，直接跑在 M 芯片上 |
| YouTube CC 自动字幕 | ~10 秒 | 无需模型，但质量依赖 YouTube |

### 完整流程图

```
YouTube URL
    │
    ▼
yt-dlp 下载音频 (mp3)          ← ~10 秒
    │
    ▼
mlx-whisper medium             ← ~4 分钟（GPU）
(转录 + 粗略词时间戳)
    │
    ▼
WhisperX forced alignment      ← ~30 秒（MPS）
(精确词级时间戳)
    │
    ▼
Google Translate zh-CN         ← ~10 分钟（API 限速）
    │
    ▼
写入 mockEpisodes.ts           ← 即时
```

---

## 快速开始

### 依赖

```bash
pip install mlx-whisper whisperx deep-translator yt-dlp
```

### 添加新播客（通用脚本）

```bash
python3 scripts/generate_episode_mlx.py \
  --url "https://www.youtube.com/watch?v=VIDEO_ID" \
  --id "ep4" \
  --podcast "播客名称" \
  --title "节目标题" \
  --description "节目简介" \
  --cover "https://images.unsplash.com/photo-xxx?w=400&h=400&fit=crop" \
  [--premium]
```

脚本会自动：
1. 下载音频
2. 用 mlx-whisper 转录
3. WhisperX 精确对齐
4. 翻译成中文
5. 按 `--chapter-interval`（默认 720s = 12 分钟）自动分章
6. 追加到 `src/data/mockEpisodes.ts`
7. 缓存原始 JSON（`scripts/transcript_EPID.json`），重跑时可用 `--skip-transcribe` 跳过

### 重新跑翻译（不重新转录）

```bash
python3 scripts/generate_episode_mlx.py \
  --id ep4 \
  --skip-transcribe \
  # ... 其他参数
```

---

## 各集现状

| EP | 播客 | 方案 | 状态 |
|---|---|---|---|
| ep1 | The Burnouts（谷爱凌）| 手工 + WhisperX | ✅ |
| ep2 | JRE #2504（Skylar Grey）| faster-whisper + WhisperX | ✅ |
| ep3 | All-In E273 | YouTube CC + Google Translate | ✅（CC 精度够用）|
| ep4+ | 任意播客 | **mlx-whisper + WhisperX** | 推荐 |

---

## 注意事项

- **合盖会中断进程**：转录时保持屏幕开启，或用 `caffeinate -i python3 ...` 阻止睡眠：
  ```bash
  caffeinate -i python3 scripts/generate_episode_mlx.py ...
  ```

- **mlx-whisper 首次运行**会下载模型权重（medium 约 1.5GB），之后缓存在 `~/.cache/huggingface`

- **音频文件**（mp3）和**原始 JSON** 已加入 `.gitignore`，不会上传到 GitHub

- **翻译速度**：Google Translate 每句间隔 0.12s，4000+ 句约 10 分钟。如遇限流，脚本会自动重试 3 次

---

## 文件结构

```
scripts/
├── generate_episode_mlx.py      ← 通用脚本（mlx-whisper 方案）★ 推荐
├── generate_allin_ep3_cc.py     ← ep3 专用（YouTube CC 方案）
├── generate_jre_ep2.py          ← ep2 专用（faster-whisper 方案，已弃用）
├── generate_full_ep1.py         ← ep1 专用（手工）
├── transcribe.py                ← 独立转录工具（输出 JSON）
├── PIPELINE.md                  ← 本文档
├── allin_ep3.mp3                ← 已下载的音频（gitignored）
├── transcript_allin_ep3.json    ← 原始转录缓存（gitignored）
└── allin_cc/
    └── allin_ep3.en.vtt         ← YouTube CC 字幕文件
```
