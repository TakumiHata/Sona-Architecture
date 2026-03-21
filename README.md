# Sona-Architecture

**Sona-Suite** の全体設計・仕様管理リポジトリです。ソースコードは含まれません。
システムの全体像、設計思想、技術選定の記録（ADR）、実装状態を管理します。

---

## Sona-Suite とは

> **Concept: Turning voice into gold.**
> 音声を「資産」に変える。Deepgram と gRPC を駆使したリアルタイム議事録システム。

会議音声をリアルタイムで文字起こし・話者識別し、あらかじめ登録したExcelテンプレートに自動で流し込んで議事録を生成するシステムです。

---

## リポジトリ一覧

| コンポーネント | リポジトリ名 | 技術スタック | ローカルパス |
| :--- | :--- | :--- | :--- |
| **デスクトップアプリ** | SonaCore | Tauri 2, React, TypeScript, Rust, gRPC | `/home/takumi/Application/SonaCore` |
| **音声処理バックエンド** | voice-verifier | Python, gRPC, Deepgram SDK, Resemblyzer | `/home/takumi/Application/voice-verifier` |
| **管理Webダッシュボード** | Sona-Web | Next.js 15, React, TypeScript, Supabase | `/home/takumi/Application/Sona-Web` |
| **Protobuf定義** | Sona-Protobuf | Protocol Buffers (gRPC定義) | `/home/takumi/Application/Sona-Protobuf` |
| **設計書** | Sona-Architecture | Markdown ドキュメント | `/home/takumi/Application/Sona-Architecture` |

---

## システム構成図

```
┌─────────────────────────────────────────────────────────┐
│                      ユーザー操作                        │
└──────────────┬──────────────────────────┬───────────────┘
               │                          │
               ▼                          ▼
  ┌────────────────────────┐   ┌──────────────────────────┐
  │   SonaCore (Tauri)     │   │   Sona-Web (Next.js)     │
  │  デスクトップアプリ     │   │  ブラウザ管理画面         │
  │                        │   │                          │
  │  ・音声キャプチャ       │   │  ・セッション管理         │
  │  ・議事録リアルタイム   │   │  ・話者登録               │
  │    Markdown表示        │   │  ・テンプレート管理        │
  │  ・Excel出力           │   │  ・Excel出力              │
  └──────────┬─────────────┘   └────────────┬─────────────┘
             │ gRPC Streaming                │ REST / Supabase SDK
             │ (音声データ→文字起こし)        │
             ▼                              ▼
  ┌────────────────────────┐   ┌──────────────────────────┐
  │  voice-verifier        │   │   Supabase               │
  │  (Python)              │   │   (PostgreSQL + Auth      │
  │                        │   │    + Storage + Realtime)  │
  │  ・gRPC サーバー        │◄──┤                          │
  │  ・Deepgram WebSocket  │   │  テーブル:                │
  │    ゲートウェイ         │   │  ・organizations          │
  │  ・話者識別             │   │  ・sessions               │
  │    (Resemblyzer)       │   │  ・speakers               │
  │  ・FastAPI (REST)      │   │  ・excel_templates        │
  └──────────┬─────────────┘   └──────────────────────────┘
             │ WebSocket
             ▼
  ┌────────────────────────┐
  │   Deepgram API         │
  │   Nova-2 (ja)          │
  │   ・音声→テキスト変換   │
  │   ・話者ダイアライゼー  │
  │     ション             │
  └────────────────────────┘
```

---

## データフロー

### 1. 会議前セットアップ（Sona-Web）

```
ユーザー → Sona-Web
  1. 話者登録: 音声録音 → voice-verifier /register_speaker → 256次元埋め込み → Supabase保存
  2. テンプレート登録: Excelアップロード → Supabase Storage保存 + マッピング設定
  3. セッション作成: 会議名 + 参加話者 + テンプレート → セッションID (UUID) 発行 + QRコード表示
```

### 2. 会議中（SonaCore）

```
ユーザー → SonaCore
  1. セッションID入力 → Supabase から参加話者情報取得
  2. 議題Markdown インポート
  3. 録音開始 → CPAL でマイク音声取得 → gRPC ストリームで voice-verifier へ送信
  4. voice-verifier:
     a. 音声を Deepgram WebSocket へ中継 (Nova-2, ja, diarize=true)
     b. Deepgram → 文字起こし + speaker_0/speaker_1 タグ
     c. Resemblyzer で音声埋め込み抽出 → Supabase の話者と照合 (コサイン類似度)
     d. speaker_0 → 実名 にマッピング
     e. gRPC レスポンスで { transcript, speaker, is_final } を返却
  5. SonaCore → caption-update イベントで UI 更新 → Markdown リアルタイム表示
  6. 録音終了 → Gemini API で文字起こしをAI校正 → Excel出力 (Sona-Web API)
```

### 3. Excel出力

```
SonaCore / Sona-Web → POST /api/export/excel
  Body: { agendas: AgendaItem[], sessionId: string }

  Sona-Web API:
  1. sessionId → Supabase から template_id, mapping_json 取得
  2. templateId → Supabase Storage からテンプレートExcelファイル取得
  3. mappingMarkdown があれば generateExcelFromMarkdown()
     → マッピング定義のセルに議事内容を流し込み
  4. なければ generateExcelBuffer() (デフォルト2シート形式)
  5. .xlsx バッファを返却 → ブラウザ/アプリでダウンロード
```

---

## データベーススキーマ (Supabase)

```sql
-- 組織
organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
)

-- 話者
speakers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID REFERENCES organizations(id),
  name        TEXT NOT NULL,
  department  TEXT,
  embedding   TEXT,  -- Resemblyzer 256次元ベクトル (JSON文字列)
  created_at  TIMESTAMPTZ DEFAULT now()
)

-- セッション
sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID REFERENCES organizations(id),
  name            TEXT NOT NULL,
  description     TEXT,
  template_id     UUID REFERENCES excel_templates(id),
  participant_ids UUID[],  -- 参加話者のID配列
  status          TEXT DEFAULT 'pending',  -- 'pending' | 'active' | 'completed'
  created_at      TIMESTAMPTZ DEFAULT now()
)

-- Excelテンプレート
excel_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  file_path    TEXT,          -- Supabase Storage パス (templates/ バケット)
  mapping_json JSONB,         -- { mappings: [...], mapping_markdown: "..." }
  created_at   TIMESTAMPTZ DEFAULT now()
)
```

### mapping_json の構造

```json
{
  "mappings": [
    { "cell": "B3:E20", "type": "minutes_area", "label": "議事録エリア" },
    { "cell": "A3:A20", "type": "speaker_area", "label": "発言者エリア" }
  ],
  "mapping_markdown": "| メタデータ | 名前 |\n| :--- | :--- |\n| { \"addr\": \"B3:E20\" } {{title}} {{content}} | 議事録エリア |\n| { \"addr\": \"A3:A20\" } {{speaker}} | 発言者エリア |\n"
}
```

---

## コンポーネント詳細

### SonaCore（デスクトップアプリ）

| 項目 | 詳細 |
| :--- | :--- |
| フレームワーク | Tauri 2 + React 19 + TypeScript |
| 音声キャプチャ | CPAL（クロスプラットフォーム音声ライブラリ） |
| gRPC クライアント | tonic（Rust） |
| AI校正 | Google Gemini API（gemini-1.5-flash 推奨） |
| ローカル設定保存 | tauri-plugin-store |

**主要コンポーネント:**
- `SessionSetup.tsx` - セッションID入力 → Supabaseからセッション情報取得 → Markdown議題インポート → Gemini APIキー設定
- `AgendaPreview.tsx` - 議題プレビューと録音中の進行管理
- `App.tsx` - メインロジック（録音制御、AI校正、Excel出力）
- `src-tauri/src/lib.rs` - Tauri コマンド（start_recording, stop_recording）
- `src-tauri/src/audio_client.rs` - gRPC ストリーミングクライアント

**環境変数:**

```env
# .env.local
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxx
VITE_SONA_WEB_URL=http://localhost:3000   # Excel出力APIのベースURL
```

```bash
# 実行時環境変数 (Rustバイナリ)
VOICE_VERIFIER_URL=http://localhost:50051  # voice-verifier gRPCエンドポイント
```

---

### voice-verifier（音声処理バックエンド）

| 項目 | 詳細 |
| :--- | :--- |
| 言語 | Python 3.10 |
| gRPC サーバー | grpcio-aio（非同期） |
| 音声認識 | Deepgram SDK 3.x（Nova-2, ja, diarize） |
| 話者識別 | Resemblyzer（256次元音声埋め込み） |
| REST API | FastAPI + uvicorn |
| ベクトル照合 | コサイン類似度（Supabase speakers.embedding と比較） |

**ポート:**
- `50051` - gRPC（SonaCore との通信）
- `8000` - FastAPI REST（話者登録 `/register_speaker`）

**主要モジュール:**
- `src/main.py` - エントリーポイント（gRPCサーバー起動）
- `src/service.py` - AudioService gRPC サービサー
- `src/api.py` - FastAPI 話者登録エンドポイント
- `src/core/gateway.py` - Deepgram WebSocket ゲートウェイ
- `src/core/speaker_recognition.py` - Resemblyzer ラッパー
- `src/infrastructure/supabase.py` - Supabase操作

**環境変数:**

```env
DEEPGRAM_API_KEY=xxxx
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxxx
```

---

### Sona-Web（管理ダッシュボード）

| 項目 | 詳細 |
| :--- | :--- |
| フレームワーク | Next.js 15（App Router） |
| UI | React 19 + TypeScript + Tailwind CSS 4 |
| データベース | Supabase（PostgreSQL + Auth + Storage） |
| Excel生成 | ExcelJS 4.x |
| アイコン | Lucide React |

**主要ページ:**

| ページ | パス | 機能 |
| :--- | :--- | :--- |
| ダッシュボード | `/` | 統計・最近のセッション |
| セッション一覧 | `/sessions` | セッション管理 |
| セッション詳細 | `/sessions/[id]` | ステータス管理・Excel出力 |
| セッション作成 | `/sessions/new` | 会議設定・QRコード発行 |
| 話者管理 | `/speakers` | 話者一覧 |
| 話者登録 | `/speakers/new` | 音声録音 → 埋め込み生成 |
| テンプレート | `/templates` | Excelテンプレート管理 |

**API エンドポイント:**

| メソッド | パス | 説明 |
| :--- | :--- | :--- |
| POST | `/api/export/excel` | Excel議事録ファイル生成・ダウンロード |

**環境変数:**

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxx
```

---

### Sona-Protobuf（gRPC定義）

`audio_service.proto` を中心リポジトリとして管理し、各リポジトリからGitサブモジュールとして参照。

```
Sona-Protobuf (Central Repo)
  └── audio_service.proto
        ↓ git submodule (protos/shared/)
  ├── SonaCore     → tonic-build で Rust コード生成
  ├── voice-verifier → grpcio-tools で Python コード生成
  └── Sona-Web     → buf + connect-es で TS コード生成 (予定)
```

**proto 定義:**

```protobuf
service AudioService {
  rpc StreamAudio (stream StreamRequest) returns (stream StreamResponse);
}

message StreamingConfig {
  string encoding = 1;           // "LINEAR16"
  int32  sample_rate_hertz = 2;  // 例: 44100 (CPAL検出値)
  string language_code = 3;      // "ja-JP"
  int32  audio_channel_count = 4;
  string session_id = 5;         // SonaCoreセッションID
}

message StreamResponse {
  string transcript = 1;
  bool   is_final = 2;
  string speaker = 3;            // 識別された話者名
  float  confidence = 4;
}
```

---

## Excel出力アーキテクチャ（Hybrid Markdown方式）

設計書 [07_excel_mapping_redesign.md](./docs/07_excel_mapping_redesign.md) に基づく実装。

```
Excelテンプレート (.xlsx)
  ↓ アップロード + ExcelJS でパース
Supabase Storage (バイナリ保存)
  +
Supabase DB (mapping_json: Markdownマッピング保存)
  ↓ 出力リクエスト時
Excel生成エンジン (Sona-Web /api/export/excel)
  ・テンプレートをロード
  ・mapping_markdown をパース
  ・各 {{変数}} を議事データで置換
  ・指定セル範囲に書き込み
  ↓
議事録Excel ダウンロード
```

**テンプレート変数:**

| 変数 | 内容 |
| :--- | :--- |
| `{{title}}` | 議題名（階層インデント付き） |
| `{{content}}` | 議事内容（AI校正済みまたは原文） |
| `{{speaker}}` | 発言者名 |

---

## 開発環境セットアップ

### voice-verifier 起動

```bash
cd /home/takumi/Application/voice-verifier
pip install -r requirements.txt
python src/main.py
# gRPC: :50051, FastAPI: :8000
```

### Sona-Web 起動

```bash
cd /home/takumi/Application/Sona-Web
npm install
npm run dev
# http://localhost:3000
```

### SonaCore 起動

```bash
cd /home/takumi/Application/SonaCore
npm install
VOICE_VERIFIER_URL=http://localhost:50051 npm run tauri dev
```

---

## ドキュメント一覧

| ファイル | 内容 |
| :--- | :--- |
| [docs/00_current-implementation.md](./docs/00_current-implementation.md) | **現在の実装状態**（各リポジトリ詳細・環境変数・既知の課題） |
| [docs/01_system-design.md](./docs/01_system-design.md) | システム設計 v1 |
| [docs/02_system-design.md](./docs/02_system-design.md) | システム設計 v2（Resemblyzer統合） |
| [docs/03_dashboard-blueprint.md](./docs/03_dashboard-blueprint.md) | ダッシュボード初期設計 |
| [docs/04_sona-web-design.md](./docs/04_sona-web-design.md) | Sona-Web 詳細設計 |
| [docs/05_auth-and-shared-access-design.md](./docs/05_auth-and-shared-access-design.md) | 認証・アクセス制御設計 |
| [docs/06_session_console_design.md](./docs/06_session_console_design.md) | セッション管理設計 |
| [docs/07_excel_mapping_redesign.md](./docs/07_excel_mapping_redesign.md) | Excel Hybrid Markdown マッピング設計 |
| [decisions/001-why-deepgram.md](./decisions/001-why-deepgram.md) | ADR: Deepgram 採用理由 |

---

## 実装状況

| 機能 | 状態 | 備考 |
| :--- | :---: | :--- |
| gRPC音声ストリーミング | ✅ | SonaCore ↔ voice-verifier |
| Deepgram文字起こし | ✅ | Nova-2, 日本語 |
| 話者ダイアライゼーション | ✅ | Deepgram diarize=true |
| Resemblyzer話者識別 | ✅ | コサイン類似度で照合 |
| Gemini AI校正 | ✅ | gemini-1.5-flash |
| セッション管理 (Sona-Web) | ✅ | pending/active/completed |
| 話者登録 (Sona-Web) | ✅ | 音声録音→埋め込み→Supabase |
| テンプレートアップロード | ✅ | xlsx → Supabase Storage |
| マッピングエディタ | ✅ | ビジュアルセル範囲選択 |
| Excel出力（デフォルト） | ✅ | 2シート形式（AI清書＋原文） |
| Excel出力（テンプレート） | ✅ | Hybrid Markdown方式 |
| Sona-Web Excel出力ボタン | ✅ | 完了セッションから再出力可 |
| QRコード発行 | ✅ | セッションID → QR |
| 話者詳細・編集 | 🔲 | 未実装 |
| リアルタイム議事録表示 | 🔲 | Supabase Realtime 未統合 |
| 多言語対応 | 🔲 | 現在日本語固定 |
