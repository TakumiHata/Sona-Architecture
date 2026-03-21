# 現在の実装状態（Current Implementation）

> 最終更新: 2026-03-21
> 設計書ではなく、**実際のコードの状態**を記録するドキュメントです。

---

## リポジトリ別 実装詳細

---

### SonaCore（デスクトップアプリ）

**パス:** `/home/takumi/Application/SonaCore`

#### 技術スタック
- Tauri 2 + React 19 + TypeScript + Vite
- Rust（音声キャプチャ・gRPC クライアント）
- CPAL（クロスプラットフォーム音声入力）
- tonic（Rust gRPC クライアントライブラリ）
- Google Gemini API（AI文字起こし校正）
- ExcelJS（クライアント側 Excel 生成）
- Supabase JS SDK（セッション・話者情報取得）
- tauri-plugin-store（APIキー等のローカル永続化）

#### 画面フロー
```
起動
 └─ SessionSetup（セッションID入力）
      ├─ Supabase からセッション・参加者情報取得
      ├─ セッションステータスを 'active' に更新
      ├─ Markdown 議題ファイルをインポート
      └─ Gemini API キー設定
           └─ AgendaPreview（議題確認）
                └─ 録音開始/停止（ControlPanel）
                     ├─ 録音中: caption-update イベントでリアルタイム更新
                     └─ 録音終了: AI校正 → Excel出力
```

#### 主要ファイル

| ファイル | 役割 |
| :--- | :--- |
| `src/App.tsx` | メインロジック（状態管理・録音制御・AI校正・Excel出力） |
| `src/components/SessionSetup.tsx` | セッションID入力・Supabase認証・議題インポート |
| `src/components/AgendaPreview.tsx` | 議題プレビュー・録音中のMarkdown表示 |
| `src/utils/gemini.ts` | Gemini API 文字起こし校正 |
| `src/utils/exportUtils.ts` | Excel出力（Sona-Web API呼び出し） |
| `src/utils/agendaParser.ts` | Markdown議題ファイルパーサー |
| `src-tauri/src/lib.rs` | Tauri コマンド（start_recording, stop_recording） |
| `src-tauri/src/audio_client.rs` | gRPC ストリーミングクライアント・音声キャプチャ |

#### 環境変数

```env
# .env.local
VITE_SUPABASE_URL=https://ggxtqsnlsmpulmizvqhd.supabase.co
VITE_SUPABASE_ANON_KEY=<anon_key>
VITE_SONA_WEB_URL=http://localhost:3000
```

```bash
# 実行時（Rust バイナリ）
VOICE_VERIFIER_URL=http://localhost:50051  # デフォルト値
```

#### 既知の制限事項
- セッションIDはUUID形式で手動入力またはQRスキャン（QRスキャンは未実装、コピペ運用）
- Gemini API キーはローカルストアに保存されるがUIから毎回確認を求める設計

---

### voice-verifier（音声処理バックエンド）

**パス:** `/home/takumi/Application/voice-verifier`

#### 技術スタック
- Python 3.10 + asyncio
- grpcio-aio（非同期 gRPC サーバー）
- Deepgram SDK 3.x（Nova-2, 日本語, diarize=true）
- Resemblyzer（256次元音声埋め込み）
- FastAPI + uvicorn（話者登録REST API）
- Supabase Python クライアント

#### 処理フロー（音声認識）

```
SonaCore → gRPC StreamAudio
  1. StreamingConfig 受信（セッションID・サンプルレート等）
  2. Supabase からセッションの participant_ids に基づく話者埋め込み取得
  3. Deepgram WebSocket 接続開始
  4. 音声チャンク受信 → Deepgram へ中継
  5. Deepgram → { transcript, speaker_0/speaker_1, is_final }
  6. 音声バッファ（約2秒）から Resemblyzer 埋め込み抽出
  7. Supabase 話者埋め込みとコサイン類似度照合
  8. speaker_0 → 実話者名 にマッピング
  9. gRPC レスポンス返却 { transcript, speaker, is_final }
```

#### エンドポイント

| プロトコル | エンドポイント | 説明 |
| :--- | :--- | :--- |
| gRPC | `:50051` StreamAudio | 双方向音声ストリーミング |
| REST | `POST :8000/register_speaker` | 話者登録（音声→埋め込み生成） |
| REST | `GET :8000/health` | ヘルスチェック |

#### 環境変数

```env
DEEPGRAM_API_KEY=<deepgram_api_key>
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
```

#### 既知の課題
- 話者照合はコサイン類似度の線形探索。話者数が増えると精度・速度が低下する可能性
- 音声バッファリング戦略の最適化余地あり（現在2秒固定）

---

### Sona-Web（管理ダッシュボード）

**パス:** `/home/takumi/Application/Sona-Web`

#### 技術スタック
- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS 4 + Lucide React
- Supabase JS SDK v2（Auth, DB, Storage, Realtime）
- ExcelJS 4.x + XLSX（Excel生成・パース）
- QRコード生成ライブラリ

#### ページ構成

| パス | コンポーネント | 機能 |
| :--- | :--- | :--- |
| `/` | `app/page.tsx` | ダッシュボード（統計・最近のセッション） |
| `/sessions` | `app/sessions/page.tsx` | セッション一覧 |
| `/sessions/new` | `app/sessions/new/page.tsx` | セッション作成・QRコード発行 |
| `/sessions/[id]` | `app/sessions/[id]/page.tsx` | セッション詳細・Excel出力ボタン |
| `/speakers` | `app/speakers/page.tsx` | 話者一覧 |
| `/speakers/new` | `app/speakers/new/page.tsx` | 話者登録（音声録音→埋め込み） |
| `/templates` | `app/templates/page.tsx` | テンプレート一覧・アップロード・マッピング |

#### API エンドポイント

| メソッド | パス | リクエスト | レスポンス |
| :--- | :--- | :--- | :--- |
| POST | `/api/export/excel` | `{ agendas, sessionId?, mappingMarkdown?, templateId? }` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |

#### Excel出力の分岐ロジック

```
POST /api/export/excel
  sessionId あり → Supabase から template_id, mapping_json 取得
  mappingMarkdown あり
    templateId あり → Storage からテンプレートExcel取得
    generateExcelFromMarkdown(agendas, mappingMarkdown, templateBuffer?)
  mappingMarkdown なし
    generateExcelBuffer(agendas)  ← デフォルト2シート形式
```

#### テンプレートマッピング（Hybrid Markdown方式）

MappingEditor が生成する mapping_markdown フォーマット:

```markdown
| メタデータ | 名前 |
| :--- | :--- |
| { "addr": "B3:E20" } {{title}} {{content}} | 議事録エリア |
| { "addr": "A3:A20" } {{speaker}} | 発言者エリア |
```

- `addr` はセル範囲（例: `A1:C5`）または単一セル（例: `A1`）
- テンプレート変数: `{{title}}`, `{{content}}`, `{{speaker}}`
- 範囲指定時は開始行から議事アイテムを1行ずつ展開、範囲終端で打ち切り

#### 主要コンポーネント

| ファイル | 役割 |
| :--- | :--- |
| `src/lib/excel.ts` | Excel生成ロジック（generateExcelBuffer, generateExcelFromMarkdown） |
| `src/app/api/export/excel/route.ts` | Excel出力APIルート |
| `src/components/templates/TemplateUpload.tsx` | Excelテンプレートアップロード |
| `src/components/templates/MappingEditor.tsx` | セル範囲マッピングエディタ |
| `src/components/templates/ExcelGrid.tsx` | Excelグリッドビジュアル表示 |
| `src/components/sessions/SessionCreation.tsx` | セッション作成フォーム |
| `src/components/sessions/SessionQR.tsx` | QRコード生成・表示 |

#### 環境変数

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://ggxtqsnlsmpulmizvqhd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
```

#### 既知の制限事項・未実装
- 話者詳細・編集ページ（`/speakers/[id]`）未実装
- Supabase Realtime によるリアルタイム議事録表示は未統合（UIプレースホルダーのみ）
- 認証設計（[05_auth-and-shared-access-design.md](./05_auth-and-shared-access-design.md)）は未実装（現状は認証なし）
- `excel_templates` テーブルに `org_id` カラムなし（設計上は組織スコープ予定）

---

### Sona-Protobuf（gRPC定義）

**パス:** `/home/takumi/Application/Sona-Protobuf`

`audio_service.proto` を一元管理。各リポジトリは `protos/shared/` としてサブモジュール参照。

```protobuf
syntax = "proto3";
package audio;

service AudioService {
  rpc StreamAudio (stream StreamRequest) returns (stream StreamResponse);
}

message StreamRequest {
  oneof payload {
    StreamingConfig streaming_config = 1;
    bytes audio_data = 2;
  }
}

message StreamingConfig {
  string encoding = 1;
  int32  sample_rate_hertz = 2;
  string language_code = 3;
  int32  audio_channel_count = 4;
  string session_id = 5;
}

message StreamResponse {
  string transcript = 1;
  bool   is_final = 2;
  string speaker = 3;
  float  confidence = 4;
}
```

---

## リポジトリ間通信一覧

| 送信元 | 宛先 | プロトコル | 内容 |
| :--- | :--- | :--- | :--- |
| SonaCore | voice-verifier | gRPC Bi-directional | 音声データ送信 → 文字起こし受信 |
| SonaCore | Sona-Web | HTTP POST | Excel出力リクエスト（`/api/export/excel`） |
| SonaCore | Supabase | REST (JS SDK) | セッション・話者情報取得、ステータス更新 |
| Sona-Web | voice-verifier | HTTP POST | 話者登録（`/register_speaker`） |
| Sona-Web | Supabase | REST (JS SDK) | 全データCRUD・Storage操作 |
| voice-verifier | Deepgram | WebSocket | 音声→文字起こし |
| voice-verifier | Supabase | REST (Python SDK) | 話者埋め込み取得・保存 |

---

## ローカル開発 クイックスタート

```bash
# 1. voice-verifier 起動
cd /home/takumi/Application/voice-verifier
pip install -r requirements.txt
python src/main.py

# 2. Sona-Web 起動（別ターミナル）
cd /home/takumi/Application/Sona-Web
npm install
npm run dev
# → http://localhost:3000

# 3. SonaCore 起動（別ターミナル）
cd /home/takumi/Application/SonaCore
npm install
VOICE_VERIFIER_URL=http://localhost:50051 npm run tauri dev
```

### 会議実施フロー（ローカル開発）

1. **Sona-Web** でセッション作成（話者・テンプレートを事前に登録済みの場合）
2. 発行されたセッションIDをコピー
3. **SonaCore** を起動してセッションIDを貼り付け
4. Markdownで議題ファイルを作成してインポート
5. Gemini APIキーを入力して開始
6. 録音ボタンで会議開始 → リアルタイムで文字起こし
7. 終了ボタンで録音停止 → AI校正 → Excel自動ダウンロード
8. または **Sona-Web** のセッション詳細ページから「Excel出力」ボタンでも出力可能
