# データベース設計 (Supabase)

Sona プロジェクトの全テーブル定義・リレーション・各リポジトリからの参照状況。
スキーマの変更は Sona-Web の `supabase/migrations/` で管理する。

## テーブル関連図

```
organizations (1)
    ├──[org_id]──> (M) speakers
    ├──[org_id]──> (M) sessions
    └──[org_id]──> (M) excel_templates

excel_templates (1)
    └──[template_id]──> (M) sessions

sessions (1)
    ├──[session_id]──> (1) session_agendas (UNIQUE)
    ├──[session_id]──> (M) launch_tokens
    └──[participant_ids UUID[]]──> speakers (暗黙参照)
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

### launch_tokens

SonaCore 起動用のワンタイムトークン（有効期限 60 秒）。

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK, DEFAULT gen_random_uuid() | トークンID |
| token | TEXT | NOT NULL, UNIQUE | トークン文字列 |
| session_id | UUID | FK → sessions(id), ON DELETE CASCADE | セッション参照 |
| expires_at | TIMESTAMPTZ | NOT NULL | 失効時刻 |
| used_at | TIMESTAMPTZ | NULL | 使用日時（NULL = 未使用） |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 作成日時 |

**フロー:** Sona-Web が発行 → Deep Link `sona://launch?session_id={id}&token={token}` → SonaCore が検証・消費

**参照元:** Sona-Web（発行）, SonaCore（検証・消費）

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
| launch_tokens | service_role: 全権限 | CRUD |

## 各リポジトリの参照テーブル

| テーブル | SonaCore | Sona-Web | voice-verifier |
|---------|----------|----------|----------------|
| organizations | — | CRUD | — |
| speakers | SELECT | CRUD | SELECT (embedding) |
| sessions | SELECT, UPDATE | CRUD | — |
| session_agendas | UPSERT | SELECT | — |
| excel_templates | — | CRUD | — |
| launch_tokens | SELECT, UPDATE | INSERT | — |
