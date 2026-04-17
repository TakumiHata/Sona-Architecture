# Sona-Docs

Sona プロジェクトの **デザインシステム** と **全体アーキテクチャ** を管理するリポジトリ。
npm パッケージ `sona-design-tokens` としてデザイントークンを各リポジトリに配布する。

## リポジトリ一覧

| コンポーネント | リポジトリ | 技術スタック |
|:---|:---|:---|
| デスクトップアプリ | SonaCore | Tauri 2, React 19, TypeScript, Rust |
| 音声処理バックエンド | voice-verifier | Python 3.10, faster-whisper, Resemblyzer, FastAPI |
| 管理Web | Sona-Web | Next.js 15, React 19, TypeScript, Supabase |
| 設計・デザイン | **Sona-Docs** (本リポジトリ) | Markdown, npm パッケージ |

## システム構成図

```
┌──────────────────────────┐   ┌──────────────────────────┐
│   SonaCore (Tauri)       │   │   Sona-Web (Next.js)     │
│  デスクトップアプリ       │   │  管理画面                 │
│                          │   │                          │
│  ・音声録音               │   │  ・セッション管理         │
│  ・議題ポインター管理     │   │  ・話者登録               │
│  ・議題単位音声分割       │   │  ・テンプレート管理       │
│  ・Excel出力             │   │  ・Excel出力              │
└──────────┬───────────────┘   └────────────┬─────────────┘
           │ POST /transcribe               │ Supabase SDK
           ▼                                ▼
┌──────────────────────────┐   ┌──────────────────────────┐
│  voice-verifier          │   │   Supabase               │
│  (Python)                │   │   (PostgreSQL + Storage)  │
│                          │   │                          │
│  ・faster-whisper        │◄──┤  ・organizations          │
│  ・Resemblyzer           │   │  ・sessions               │
│    (話者識別)            │   │  ・speakers               │
└──────────────────────────┘   │  ・excel_templates        │
                               └──────────────────────────┘
```

## ディレクトリ構成

```
Sona-Docs/
├── tokens/colors.json          ← デザイントークン (Single Source of Truth)
├── tailwind-preset.js          ← 自動生成: Tailwind プリセット
├── css-variables.css           ← 自動生成: CSS 変数
├── scripts/build.js            ← トークンからの自動生成スクリプト
│
├── design/                     ← デザインシステム
│   └── design-system.md
│
├── architecture/               ← 全体アーキテクチャ
│   ├── system-overview.md         システム構成・データフロー
│   ├── batch-transcription.md     議題単位バッチ文字起こし設計
│   ├── excel-mapping.md           Excel Hybrid Markdown 方式
│   ├── excel-output-rules.md      Excel 出力フィールド対応 / シート構成 / 画像配置
│   ├── database.md                Supabase テーブル定義 / RLS / 参照関係
│   └── auth-and-access.md         認証・アクセス制御
│
└── decisions/                  ← ADR (Architecture Decision Records)
    ├── 001-why-deepgram.md        Deepgram 採用理由 [Superseded]
    └── 002-agenda-batch-transcription.md  バッチ方式移行 [Active]
```

## デザイントークンの利用

### インストール

```bash
npm install github:TakumiHata/Sona-Docs --save-dev
```

### Tailwind v4 (SonaCore)

```css
/* App.css */
@import "tailwindcss";
@import "sona-design-tokens/css";

@theme {
  --color-brand-base: #1A1A2E;
  --color-accent: #38E870;
  /* ... */
}
```

### CSS 変数 (非 Tailwind)

```css
@import "sona-design-tokens/css";
/* var(--sona-brand-base), var(--sona-accent), etc. */
```

### トークン更新時

```bash
# tokens/colors.json を編集後
npm run build
# tailwind-preset.js と css-variables.css が再生成される
```
