# ADR 002: リアルタイムストリーミングから議題単位バッチ文字起こしへ移行する

## Status
Proposed

## Context

現在のシステムは gRPC 双方向ストリーミングで Deepgram Live API にリアルタイム音声を中継し、逐次文字起こし結果を SonaCore に返却している。このアーキテクチャには以下の課題がある。

### 現行アーキテクチャの課題

1. **リアルタイム文字起こしの必要性が限定的**
   - 会議中にリアルタイムで文字が流れるのを必要とするのは聴覚障害者など限定的なユースケース
   - 一般ユーザーの最終成果物は AI 校正済み Excel 議事録であり、録音中の逐次表示は必須ではない

2. **アーキテクチャの複雑性**
   - gRPC 双方向ストリーミング + Deepgram WebSocket の二重リアルタイム接続管理
   - 接続断・再接続のハンドリングが複雑
   - Sona-Protobuf による proto 定義の共有管理コスト

3. **外部 API 依存**
   - Deepgram Live API への常時接続が必要
   - 従量課金（ストリーミングはバッチより割高）
   - Deepgram のサービス障害が会議録音に直接影響

### 維持すべき設計方針

- **議題ポインター**: SonaCore の中核アーキテクチャ。ユーザーが録音中に議題を切り替え、発言を議題に紐づける。Excel 出力精度に直結する。

## Decision

**議題単位バッチ文字起こし方式**に移行する。

### 新方式の概要

```
録音中:
  SonaCore がローカルで音声を録音
  ユーザーが議題ポインターを操作（議題 A → B → C）
  議題単位で音声ファイルを分割保存

議題切替時:
  直前の議題の音声ファイルを voice-verifier へ送信（REST API）
  バックグラウンドで文字起こし + 話者識別を実行
  結果を SonaCore に返却 → UI に反映

録音終了時:
  最後の議題の音声を処理
  全議題の結果を Gemini API で AI 校正
  Excel 出力
```

### 音声認識エンジンの変更

| 項目 | 現行 | 新方式 |
| :--- | :--- | :--- |
| 音声認識 | Deepgram Live API (Nova-2) | **faster-whisper** (large-v3-turbo) |
| 話者分離 | Deepgram diarize + Resemblyzer | **Silero VAD** + Resemblyzer（閾値 0.60） |
| 通信方式 | gRPC 双方向ストリーミング | REST API (POST /transcribe) |
| 処理タイミング | リアルタイム（発話中） | 議題切替時 / 録音終了時 |

### 技術選定の結果

検証（Phase 0）で ASR 2 種 × 話者分離 2 種を比較した結果:

| 項目 | 採用 | 検証結果 |
| :--- | :--- | :--- |
| ASR | faster-whisper + large-v3-turbo | CER 0%（日本語 40 秒音声） |
| 話者分離 | Silero VAD + Resemblyzer | Speaker Accuracy 84%（閾値 0.60） |

- kotoba-whisper は CTranslate2 互換性問題でクラッシュ → 除外
- pyannote.audio はセグメント過分割で Resemblyzer との相性が悪く、精度 65% + 処理 4 倍遅 → 除外

詳細は [08_agenda_batch_architecture.md](../docs/08_agenda_batch_architecture.md#技術選定) を参照。

### 話者識別の方針

Sona-Suite ではセッション参加者が事前登録されており、Resemblyzer の埋め込みが Supabase に保存されている。話者分離では「誰がいつ話したか」のセグメント境界を検出し、各セグメントの音声を Resemblyzer で既知話者と照合して実名にマッピングする。Deepgram の diarize 機能は不要になる。

## Consequences

### Positive

- **アーキテクチャの大幅簡素化**: gRPC 双方向ストリーミング → REST API。Sona-Protobuf の proto 定義管理が不要になる可能性
- **Deepgram 依存の排除**: 外部 API の従量課金・サービス障害リスクから解放
- **ネットワーク耐性の向上**: 音声はローカル録音のため、ネットワーク断でも音声データは失われない
- **議題紐づけ精度の向上**: 議題単位で音声ファイルが物理的に分離されるため、タイムスタンプ照合が不要
- **コスト削減**: Deepgram の従量課金がなくなる（GPU サーバーコストとの比較は要検証）

### Negative

- **リアルタイム表示の喪失**: 録音中の逐次文字表示がなくなる。操作ミス（議題切替忘れ）への即時フィードバックがなくなる
- **GPU 要件**: faster-whisper large-v3 は GPU 推奨（medium モデルなら CPU でも実用的）
- **処理待ち時間**: 議題切替時に数秒〜数十秒の文字起こし処理時間が発生
- **モデル管理**: Whisper モデルの更新・チューニングを自前で管理する必要がある

### リスク軽減策

| リスク | 対策 |
| :--- | :--- |
| 議題切替忘れに気づけない | 録音時間・音声レベルメーターを表示し、録音が進行中であることを明示。前議題の文字起こし結果が表示されるため間接的に確認可能 |
| 長時間の議題で処理が重い | 議題内でも一定時間（例: 5分）ごとにチャンク分割して逐次処理するオプション |
| GPU がない環境 | faster-whisper medium モデルで CPU 動作を許容。精度とのトレードオフを文書化 |
| 将来的にリアルタイムが必要になった場合 | アクセシビリティモードとして Deepgram Live API を選択的に利用できる設計余地を残す |

## 影響を受けるリポジトリ

| リポジトリ | 影響 |
| :--- | :--- |
| **SonaCore** | Rust gRPC クライアント → REST クライアントに変更。ローカル音声録音・議題単位ファイル分割の実装 |
| **voice-verifier** | gRPC サーバー廃止。REST エンドポイント `/transcribe` を追加。faster-whisper 統合 |
| **Sona-Protobuf** | 段階的に廃止の可能性（REST 移行後に gRPC 定義が不要になる場合） |
| **Sona-Web** | `/ws/transcribe` WebSocket エンドポイントの扱いを検討（廃止 or アクセシビリティ用に維持） |
| **Sona-Architecture** | システム構成図・データフローの更新 |
