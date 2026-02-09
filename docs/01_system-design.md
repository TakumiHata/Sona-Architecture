# Project: Sona-Suite (SonaCore) System Design

## 1. プロジェクト概要
リアルタイムでの議事録作成を支援するデスクトップアプリケーションおよび周辺エコシステム。
**低コストかつ高精度なDeepgram API**を採用し、個人開発における持続可能性を重視する。

## 2. システム構成要素

### ① SonaCore (Desktop App)
議事録作成のメインインターフェース。
* **役割**: 音声キャプチャ、リアルタイムプレビュー、ユーザー操作。
* **主要機能**:
    * **Markdownプレビュー**: 議事録のリアルタイム表示。
    * **ミニモード (Overlay)**: プレビュー中はメインウィンドウを右下に縮小表示。
    * **通信**: `Voice-Verifier` と **gRPC (Bi-directional Streaming)** で通信。

### ② Voice-Verifier (Backend Gateway)
音声処理と識別を司るバックエンドサービス兼APIゲートウェイ。
* **役割**: **gRPC ⇔ WebSocket変換**、音声認識中継、話者識別。
* **技術スタック**: Python, gRPC, Deepgram API (Nova-2)
* **処理フロー (The Gateway Pattern)**:
    1. SonaCoreから **gRPC** で音声ストリームを受信。
    2. Pythonサーバー内でバッファリングし、**Deepgram SDK** (WebSocket) へ送信。
    3. Deepgramからテキストと `speaker` タグを受信。
    4. **話者識別**: 音声特徴量を抽出し、タグを登録済みの個人名に置換して返却。

### ③ Mapping Dashboard (Web App)
議事録フォーマット管理とエクスポート設定。
* **役割**: Excelテンプレート管理、マッピング定義（座標指定MVP）、話者登録。

---

## 3. 技術的懸念点と対策 (Engineering Notes)

### ⚠️ A. 話者識別のロジック (Identity Mapping)
* **課題**: DeepgramのDiarizationはセッションごとのID（`speaker_0`）しか返さない。
* **対策**: **ハイブリッド識別**。DiarizationはDeepgramに任せ、Identification（個人特定）はPythonサーバー側で声紋照合（`speechbrain`等）を用いて行う。

### ⚠️ B. Excel連携 (Dashboard)
* **対策**: 複雑なGUIマッピングは避け、初期フェーズでは「セル番地の手入力」による実装を行う。

---

## 4. 外部API仕様詳細 (Deepgram)
* **Model**: Nova-2 (General) / `ja`
* **Features**: `diarize=true`, `smart_format=true`, `interim_results=true`
* **Cost**: ~$0.0043/min

## 5. ロードマップ
1. **Gateway-Construction**: gRPC → Deepgram SDK → gRPC のパイプライン実装（最優先）。
2. **Core-Connectivity**: デスクトップアプリでの疎通確認。
3. **Basic-Identification**: 話者タグの表示。
4. **Excel-Export**: 座標指定による書き出し。