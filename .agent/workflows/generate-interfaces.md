---
description: Sona-Suite 全体のインターフェース（TypeSafe型定義）を同期・自動生成する
---

Sona-Web, SonaCore, Voice-Verifier 間の型整合性を保つため、以下の手順で自動生成を実行してください。

### 1. 準備 (依存ツールのインストール)
初回のみ、Next.js プロジェクト内で必要なツールをインストールします。

```bash
cd sona-web
npm install @connectrpc/connect @connectrpc/connect-web @bufbuild/protobuf
npm install -D @bufbuild/buf @connectrpc/protoc-gen-connect-es @bufbuild/protoc-gen-es orval
```

### 2. gRPC クライアントの生成 (Connect-ES)
`Sona-Protobuf` サブモジュールの最新定義から TypeScript クライアントを生成します。

```bash
# sona-web ディレクトリで実行
npx buf generate ../protos/shared
```

### 3. REST API クライアントの生成 (Orval)
`Voice-Verifier` (FastAPI) の OpenAPI スペックから TanStack Query フックを生成します。

// turbo
```bash
# Voice-Verifier が起動している状態で実行
npx orval --config ./orval.config.js
```

### 4. Supabase DB 型定義の生成
ローカルまたはリモートの DB スキーマから型定義を生成します。

// turbo
```bash
# Supabase CLI を使用
supabase gen types typescript --local > src/types/database.ts
```

> [!NOTE]
> 自動生成されたファイル (`src/types/pb/*`, `src/services/api/*`, `src/types/database.ts`) は、手動で編集しないでください。
