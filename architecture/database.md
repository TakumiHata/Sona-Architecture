# データベース設計 (Supabase)

Sona プロジェクトの全テーブル定義・リレーション・各リポジトリからの参照状況。
スキーマの変更は Sona-Web の `supabase/migrations/` で管理する。

## テーブル関連図

```
organizations (1)
    ├──[org_id]──> (M) speakers
    ├──[org_id]──> (M) sessions
    ├──[org_id]──> (M) excel_templates
    └──[org_id]──> (M) topics

excel_templates (1)
    └──[template_id]──> (M) sessions

sessions (1)
    ├──[session_id]──> (1) session_agendas (UNIQUE)
    ├──[session_id]──> (M) decisions
    ├──[session_id]──> (M) decision_evidences
    └──[participant_ids UUID[]]──> speakers (暗黙参照)

topics (1)
    └──[topic_id]──> (M) decisions

decisions (1)
    └──[decision_id]──> (M) decision_evidences

speakers (1)
    └──[speaker_id]──> (M) decision_evidences  (ON DELETE SET NULL)
```

## テーブル定義

### organizations

組織管理。RLS のスコープ単位。

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK, DEFAULT gen_random_uuid() | 組織ID |
| name | TEXT | NOT NULL | 組織名 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 作成日時 |
| access_token | UUID | DEFAULT gen_random_uuid() | RLS 認証用トークン |

**参照元:** Sona-Web

### speakers

話者情報と声紋ベクトル。

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK, DEFAULT gen_random_uuid() | 話者ID |
| org_id | UUID | FK → organizations(id), ON DELETE CASCADE | 所属組織 |
| name | TEXT | NOT NULL | 話者名 |
| department | TEXT | NULL | 部署 |
| embedding | VECTOR(256) | NULL | Resemblyzer 声紋ベクトル (pgvector) |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 登録日時 |

**参照元:** Sona-Web（登録・一覧・削除）, SonaCore（名前取得）, voice-verifier（embedding 照合）

### sessions

会議セッション。ステータスは `pending` → `active` → `completed` の順に遷移。

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK, DEFAULT gen_random_uuid() | セッションID |
| name | TEXT | NOT NULL | セッション名 |
| description | TEXT | NULL | 説明 |
| org_id | UUID | FK → organizations(id), ON DELETE CASCADE | 所属組織 |
| template_id | UUID | FK → excel_templates(id), ON DELETE SET NULL | 使用テンプレート |
| participant_ids | UUID[] | DEFAULT '{}' | 参加者の speaker ID 配列 |
| status | TEXT | CHECK IN ('pending','active','completed') | セッション状態 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 作成日時 |

**参照元:** Sona-Web（CRUD）, SonaCore（検証・ステータス更新）

### session_agendas

議題データ。セッションごとに1レコード（UPSERT）。

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK, DEFAULT gen_random_uuid() | レコードID |
| session_id | UUID | FK → sessions(id), ON DELETE CASCADE, UNIQUE | セッション参照 |
| agenda_data | JSONB | DEFAULT '[]' | 議題の階層データ |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | 更新日時 |

**agenda_data の構造:**

```json
[
  {
    "id": "uuid",
    "title": "議題タイトル",
    "description": "説明",
    "rawTranscript": "原文テキスト",
    "refinedTranscript": "AI清書版",
    "children": []
  }
]
```

**参照元:** SonaCore（UPSERT: 会議終了時）, Sona-Web（SELECT: Excel 出力時）

### excel_templates

Excel テンプレートのメタデータ。ファイル本体は Supabase Storage の `templates` バケットに保存。

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK, DEFAULT gen_random_uuid() | テンプレートID |
| org_id | UUID | FK → organizations(id), ON DELETE CASCADE | 所属組織 |
| name | TEXT | NOT NULL | テンプレート名 |
| file_path | TEXT | NULL | Storage 内のファイルパス |
| mapping_json | JSONB | DEFAULT '{}' | マッピング設定 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 作成日時 |

**参照元:** Sona-Web（CRUD）

### topics

意思決定トレイル機能のトピック（会議を跨いで一意な議論主題）。

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK, DEFAULT gen_random_uuid() | トピックID |
| org_id | UUID | FK → organizations(id), ON DELETE CASCADE, NULL 許容 | 所属組織 |
| name | TEXT | NOT NULL | トピック名 |
| aliases | TEXT[] | NOT NULL DEFAULT '{}' | 別名（名寄せ用） |
| status | TEXT | CHECK IN ('open','resolved','deferred'), DEFAULT 'open' | トピック状態 |
| needs_review | BOOLEAN | NOT NULL DEFAULT FALSE | LLM 名寄せ信頼度が低く要確認のフラグ |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 作成日時 |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 更新日時 |

**インデックス:** `(org_id, status)`, `(org_id, name)`, GIN(`aliases`), 部分インデックス `(org_id, needs_review) WHERE needs_review = TRUE`

**参照元:** Sona-Web（CRUD + マージ）

### decisions

トピックに対する決定の履歴。

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK, DEFAULT gen_random_uuid() | 決定ID |
| topic_id | UUID | FK → topics(id), ON DELETE CASCADE, NOT NULL | トピック参照 |
| session_id | UUID | FK → sessions(id), ON DELETE CASCADE, NOT NULL | 会議参照 |
| summary | TEXT | NOT NULL | 決定内容の要約 |
| type | TEXT | CHECK IN ('new','change','reaffirm','defer'), NOT NULL | 決定の種別 |
| decided_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 決定日時 |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 作成日時 |

**インデックス:** `(topic_id, decided_at DESC)`, `(session_id)`

**参照元:** Sona-Web（INSERT: 抽出時 / SELECT: タイムライン・検索）

### decision_evidences

決定の根拠となった発言（議事録の引用）。

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK, DEFAULT gen_random_uuid() | 根拠ID |
| decision_id | UUID | FK → decisions(id), ON DELETE CASCADE, NOT NULL | 決定参照 |
| session_id | UUID | FK → sessions(id), ON DELETE CASCADE, NOT NULL | 会議参照（冗長） |
| agenda_item_id | TEXT | NULL | session_agendas.agenda_data 内の議題ID |
| speaker_name | TEXT | NOT NULL | 発言者名 |
| speaker_id | UUID | FK → speakers(id), ON DELETE SET NULL | 話者参照（解決できた場合） |
| excerpt | TEXT | NOT NULL | 発言の核心部分（原文引用） |
| start_sec | NUMERIC | NULL | 発言開始秒 |
| end_sec | NUMERIC | NULL | 発言終了秒 |
| role | TEXT | CHECK IN ('proposal','support','objection','question','turning_point'), NOT NULL | 発言の役割 |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 作成日時 |

**インデックス:** `(decision_id)`, `(session_id)`, `(speaker_id)`

**参照元:** Sona-Web（INSERT: 抽出時 / SELECT: タイムライン・検索）

## Storage

### templates バケット

Excel テンプレートファイル（.xlsx）を保存。
`excel_templates.file_path` で参照。

## RLS ポリシー

カスタムヘッダー `org-token` による組織スコープ制御。

| テーブル | 認証ユーザー (org-token) | 匿名 (anon) |
|---------|------------------------|-------------|
| organizations | SELECT/UPDATE/DELETE | INSERT (RPC) |
| speakers | CRUD (org_id 一致時) | 不可 |
| sessions | CRUD (org_id 一致時) | SELECT, UPDATE status, INSERT |
| session_agendas | — | CRUD |
| excel_templates | SELECT/UPDATE/DELETE (org_id 一致時) | SELECT |
| topics | CRUD (org_id 一致時) | CRUD (※ 現運用上 anon 経由 API 利用) |
| decisions | CRUD (topic_id 経由で org_id 一致時) | 同上 |
| decision_evidences | CRUD (decision_id → topic_id 経由で org_id 一致時) | 同上 |

## 各リポジトリの参照テーブル

| テーブル | SonaCore | Sona-Web | voice-verifier |
|---------|----------|----------|----------------|
| organizations | — | CRUD | — |
| speakers | SELECT | CRUD | SELECT (embedding) |
| sessions | SELECT, UPDATE | CRUD | — |
| session_agendas | UPSERT | SELECT | — |
| excel_templates | — | CRUD | — |
| topics | — | CRUD | — |
| decisions | — | CRUD | — |
| decision_evidences | — | CRUD | — |
