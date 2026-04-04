# 議題単位バッチ文字起こしアーキテクチャ設計

> ADR: [002-agenda-batch-transcription.md](../decisions/002-agenda-batch-transcription.md)

---

## 概要

gRPC 双方向ストリーミング + Deepgram Live API によるリアルタイム文字起こしを廃止し、
**議題ポインターの切替をトリガーとしたバッチ文字起こし**に移行する。

音声認識は **faster-whisper**（日本語特化モデル含む）、話者分離は **pyannote.audio** または **Silero VAD + Resemblyzer** で自前処理する。
技術選定は検証結果に基づいて決定する（[技術選定](#技術選定)セクション参照）。

---

## システム構成図（移行後）

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
  │  ・ローカル音声録音     │   │  ・話者登録               │
  │  ・議題ポインター管理   │   │  ・テンプレート管理        │
  │  ・議題単位音声分割     │   │  ・Excel出力              │
  │  ・Markdown表示        │   │                          │
  │  ・Excel出力           │   │                          │
  └──────────┬─────────────┘   └────────────┬─────────────┘
             │ REST API                      │ REST / Supabase SDK
             │ (音声ファイル→文字起こし)      │
             ▼                              ▼
  ┌────────────────────────┐   ┌──────────────────────────┐
  │  voice-verifier        │   │   Supabase               │
  │  (Python)              │   │   (PostgreSQL + Auth      │
  │                        │   │    + Storage + Realtime)  │
  │  ・REST API サーバー    │◄──┤                          │
  │  ・faster-whisper      │   │  テーブル:                │
  │    (音声→テキスト)     │   │  ・organizations          │
  │  ・話者識別             │   │  ・sessions               │
  │    (Resemblyzer)       │   │  ・speakers               │
  └────────────────────────┘   │  ・excel_templates        │
                               └──────────────────────────┘
```

**変更点:**
- Deepgram API への依存を排除
- gRPC 双方向ストリーミング → REST API
- voice-verifier に faster-whisper を統合

---

## データフロー

### 会議中（SonaCore）

```
ユーザー → SonaCore
  1. セッションID入力 → Supabase からセッション情報取得
  2. 議題Markdown インポート
  3. 録音開始 → CPAL でマイク音声キャプチャ → ローカルバッファに蓄積

  ── 議題 A 録音中 ──────────────────────────────────
  4. 音声データをメモリ/一時ファイルに蓄積
  5. UI: 録音インジケーター（時間・音声レベル）を表示

  ── 議題ポインター切替（A → B）───────────────────
  6. 議題 A の音声データを確定・切り出し
  7. バックグラウンドで voice-verifier へ送信:
     POST /transcribe
     Content-Type: multipart/form-data
     Body: { audio: <WAV/PCM>, session_id: "..." }
  8. 議題 B の録音を開始

  ── voice-verifier 処理（バックグラウンド）─────────
  9.  faster-whisper (large-v3-turbo) で文字起こし（タイムスタンプ付き）
  10. Silero VAD で発話区間を検出
  11. 各発話区間の音声 → Resemblyzer で埋め込み抽出
  12. セッション参加者の埋め込みとコサイン類似度照合（閾値 0.60）
  13. 話者名マッピング済みトランスクリプトを返却

  ── SonaCore 結果受信 ──────────────────────────────
  13. 議題 A の文字起こし結果を UI に表示
  14. ユーザーは次の議題の録音中に前議題の結果を確認可能

  ── 録音終了 ───────────────────────────────────────
  15. 最後の議題の音声を voice-verifier へ送信
  16. 全議題の結果が揃ったら Gemini API で AI 校正
  17. Excel 出力（Sona-Web API 経由）
```

---

## 技術選定

### ASR（音声認識）: faster-whisper + large-v3-turbo

**確定**: faster-whisper + `large-v3-turbo` を採用。

| 項目 | 詳細 |
| :--- | :--- |
| エンジン | faster-whisper（CTranslate2） |
| モデル | `large-v3-turbo`（OpenAI Whisper distilled） |
| 量子化 | int8（CPU）/ float16（GPU） |
| 検証結果 | CER 0%（40秒の日本語会話音声で正解と完全一致） |

**選定理由:**
- 日本語の文字起こし精度が検証で CER 0% と十分な結果
- CTranslate2 による最適化で CPU 環境でも実用的な速度
- kotoba-whisper-v2.0-faster は CTranslate2 互換性問題でクラッシュしたため除外

### 話者分離: Silero VAD + Resemblyzer

**確定**: Silero VAD + Resemblyzer を採用。

```
音声
  │
  ▼
Silero VAD (Voice Activity Detection)
  → 発話区間: [0.0-3.2s, 3.5-7.1s, 7.8-12.0s, ...]
  │
  ▼
各発話区間の音声を切り出し
  → Resemblyzer で埋め込み抽出
  → Supabase の既知話者と照合（コサイン類似度 ≥ 0.60）
  → 実名マッピング
```

| 項目 | 詳細 |
| :--- | :--- |
| 発話区間検出 | Silero VAD（torch.hub 経由、軽量・CPU 動作） |
| 話者識別 | Resemblyzer（256 次元埋め込み、コサイン類似度） |
| 照合閾値 | 0.60（検証で 0.70 → 0.60 に調整し精度向上） |
| 検証結果 | Speaker Accuracy 84%（40 秒の 2 人会話音声） |
| 外部認証 | **不要**（HuggingFace トークン不要） |

**選定理由:**

pyannote.audio（案A）と Silero VAD（案B）を同一テスト音声で比較検証した結果:

| | pyannote + Resemblyzer | **Silero VAD + Resemblyzer** |
| :--- | :--- | :--- |
| Speaker Accuracy | 65.25% | **84.09%** |
| 処理時間（CPU, 40秒音声） | 72.3秒 | **18.7秒** |
| 外部認証 | HuggingFace トークン必要 | **不要** |
| 依存 | pyannote.audio, torch | Silero VAD (torch.hub) |

- pyannote はセグメントを 29 分割と細かく刻みすぎ、短いセグメントでは Resemblyzer の埋め込み精度が低下し、逆効果になった
- Silero VAD は 9 セグメントとまとまりが良く、各セグメントが十分な長さのため Resemblyzer の照合精度が高い
- 処理速度も Silero VAD が約 4 倍高速
- Silero VAD は HuggingFace トークンが不要でセットアップが簡単

---

## voice-verifier 新 API 設計

### エンドポイント一覧

| メソッド | パス | 説明 |
| :--- | :--- | :--- |
| POST | `/transcribe` | 音声ファイルの文字起こし + 話者識別 |
| POST | `/register_speaker` | 話者登録（既存・変更なし） |
| GET | `/health` | ヘルスチェック（既存・変更なし） |

### POST /transcribe

**リクエスト:**

```
POST /transcribe
Content-Type: multipart/form-data

Fields:
  audio: <binary>        # WAV (LINEAR16, 16kHz, mono 推奨) or 任意フォーマット
  session_id: string     # セッションID（参加者情報の取得に使用）
  language: string       # 言語コード (デフォルト: "ja")
  model_size: string     # Whisper モデルサイズ (デフォルト: "large-v3")
```

**レスポンス:**

```json
{
  "segments": [
    {
      "start": 0.0,
      "end": 3.45,
      "text": "それでは会議を始めます",
      "speaker": "田中太郎",
      "confidence": 0.87
    },
    {
      "start": 3.80,
      "end": 8.12,
      "text": "はい、よろしくお願いいたします",
      "speaker": "佐藤花子",
      "confidence": 0.92
    }
  ],
  "full_text": "それでは会議を始めます。はい、よろしくお願いいたします。",
  "duration_seconds": 8.12,
  "processing_time_seconds": 1.63
}
```

### 話者識別の処理フロー

```
音声ファイル受信
  │
  ├─→ faster-whisper (large-v3-turbo) で文字起こし
  │     → asr_segments[]: { start, end, text }
  │
  ├─→ Silero VAD で発話区間を検出
  │     → vad_segments[]: { start, end }
  │
  ├─→ 各 ASR セグメントの音声区間を切り出し
  │     → Resemblyzer で 256 次元埋め込みを抽出
  │
  ├─→ session_id → Supabase から参加者の埋め込みを取得
  │
  └─→ コサイン類似度 ≥ 0.60 で照合
        → 各セグメントに speaker 名を付与
```

**現行比での改善点:**
- 現行: Deepgram の `speaker_0/1` ラベルを受け取り → 2秒バッファで Resemblyzer 照合
- 新方式: Silero VAD で発話区間を検出し、各区間の音声を直接 Resemblyzer に渡す。Deepgram 依存を排除し、パイプラインがシンプルになる

---

## SonaCore 変更設計

### 音声録音アーキテクチャ

```rust
// 現行: audio_client.rs
// gRPC ストリーミングクライアント → 廃止

// 新方式: audio_recorder.rs (新規)
// ローカル音声録音 + 議題単位分割

struct AudioRecorder {
    /// CPAL 入力ストリーム
    stream: Option<cpal::Stream>,
    /// 現在の議題の音声バッファ
    current_buffer: Arc<Mutex<Vec<i16>>>,
    /// サンプルレート
    sample_rate: u32,
}

impl AudioRecorder {
    /// 録音開始
    fn start(&mut self) -> Result<()>;

    /// 議題切替: 現在のバッファを WAV として返却し、新しいバッファを開始
    fn switch_agenda(&mut self) -> Result<Vec<u8>>;  // WAV bytes

    /// 録音終了: 最後のバッファを返却
    fn stop(&mut self) -> Result<Vec<u8>>;  // WAV bytes
}
```

### Tauri コマンド変更

```rust
// 現行
#[tauri::command]
async fn start_recording(session_id: String, ...) -> Result<()>;
#[tauri::command]
async fn stop_recording() -> Result<()>;

// 新方式
#[tauri::command]
async fn start_recording() -> Result<()>;  // ローカル録音開始のみ

#[tauri::command]
async fn switch_agenda() -> Result<Vec<u8>>;  // 議題切替 → 前議題の WAV を返却

#[tauri::command]
async fn stop_recording() -> Result<Vec<u8>>;  // 最後の議題の WAV を返却
```

### フロントエンド変更

```typescript
// 議題切替ハンドラ
async function handleAgendaSwitch(nextAgendaIndex: number) {
  // 1. Rust 側で音声バッファを切り出し
  const wavBytes = await invoke<number[]>('switch_agenda');

  // 2. バックグラウンドで文字起こしリクエスト
  transcribeInBackground(currentAgendaIndex, wavBytes);

  // 3. 議題ポインターを移動
  setCurrentAgendaIndex(nextAgendaIndex);
}

async function transcribeInBackground(agendaIndex: number, wavBytes: number[]) {
  const formData = new FormData();
  formData.append('audio', new Blob([new Uint8Array(wavBytes)], { type: 'audio/wav' }));
  formData.append('session_id', sessionId);

  const response = await fetch(`${VOICE_VERIFIER_URL}/transcribe`, {
    method: 'POST',
    body: formData,
  });

  const result = await response.json();

  // 議題に結果を格納
  updateAgendaTranscript(agendaIndex, result.segments);
}
```

### UI 変更

| 要素 | 現行 | 新方式 |
| :--- | :--- | :--- |
| リアルタイム文字表示 | 発話中にテキストが流れる | **廃止** |
| 録音インジケーター | あり | 維持 + **音声レベルメーター追加** |
| 前議題の結果表示 | なし（全て録音中に表示） | **議題切替後に前議題の結果がカードとして表示** |
| pending アニメーション | 文字入力カーソル風 | **議題カード上のローディングスピナー** |
| LogStream/LogWindow | リアルタイムチャット表示 | **完了済み議題の結果一覧に変更** |

---

## 処理時間の見積もり

faster-whisper のベンチマーク（参考値）:

| モデル | デバイス | 処理速度（音声時間比） | 5分音声の処理時間 |
| :--- | :--- | :--- | :--- |
| large-v3 | GPU (CUDA) | ~10x | ~30秒 |
| large-v3 | CPU (8コア) | ~1x | ~5分 |
| medium | GPU (CUDA) | ~20x | ~15秒 |
| medium | CPU (8コア) | ~2x | ~2.5分 |
| small | CPU (8コア) | ~5x | ~1分 |

**議題の平均長さが 3〜10 分と仮定した場合:**
- GPU 環境: 議題切替後 **10〜60 秒** で結果表示（実用的）
- CPU 環境 (medium): 議題切替後 **1.5〜5 分** で結果表示（許容範囲だが体験は劣る）

---

## 移行計画

### Phase 0: 技術選定検証

- `evaluation/` ディレクトリにテスト音声・正解データ・検証スクリプトを用意
- 4パターン（ASR 2種 × 話者分離 2種）の比較検証を実施
- CER・Speaker Accuracy・処理時間を計測し、採用する組み合わせを決定

### Phase 1: voice-verifier に `/transcribe` エンドポイント追加

- Phase 0 で決定した ASR モデル + 話者分離方式を統合
- Resemblyzer のセグメント単位話者識別を実装
- 既存の gRPC サーバーは維持（並行稼働）

### Phase 2: SonaCore をローカル録音 + REST 方式に変更

- `audio_client.rs`（gRPC クライアント）→ `audio_recorder.rs`（ローカル録音）に置換
- フロントエンドの議題切替ハンドラを実装
- UI をバッチ結果表示方式に変更

### Phase 3: gRPC / Deepgram 関連コードの整理

- voice-verifier から gRPC サーバー・Deepgram 依存を削除
- SonaCore から tonic (gRPC) 依存を削除
- Sona-Protobuf サブモジュールの扱いを決定（廃止 or アクセシビリティ用に維持）

### Phase 4: 最適化・拡張

- Whisper モデルの日本語精度チューニング（ReazonSpeech モデルの検証）
- 長時間議題のチャンク分割処理
- アクセシビリティモード（オプショナルなリアルタイム表示）の検討

---

## 廃止されるコンポーネント

| コンポーネント | リポジトリ | ファイル |
| :--- | :--- | :--- |
| gRPC ストリーミングクライアント | SonaCore | `src-tauri/src/audio_client.rs` |
| gRPC サーバー | voice-verifier | `src/service.py` |
| Deepgram ゲートウェイ | voice-verifier | `src/core/gateway.py` |
| WebSocket エンドポイント | voice-verifier | `src/api.py` (`/ws/transcribe`) |
| caption-update イベント | SonaCore | `src-tauri/src/lib.rs` |
| LogStream リアルタイム表示 | SonaCore | `src/components/LogStream.tsx` |
| proto 定義 | Sona-Protobuf | `audio_service.proto` |

---

## 新規作成されるコンポーネント

| コンポーネント | リポジトリ | 説明 |
| :--- | :--- | :--- |
| AudioRecorder | SonaCore | ローカル音声録音 + 議題単位バッファ分割 |
| TranscribeClient | SonaCore | voice-verifier REST API クライアント |
| AgendaResultCard | SonaCore | 議題ごとの文字起こし結果表示コンポーネント |
| POST /transcribe | voice-verifier | バッチ文字起こし + 話者識別 REST エンドポイント |
| WhisperTranscriber | voice-verifier | faster-whisper ラッパー |
| SegmentSpeakerIdentifier | voice-verifier | セグメント単位の話者識別処理 |
