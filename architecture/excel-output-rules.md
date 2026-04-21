# Excel 出力ルール

会議終了後の Excel エクスポートにおいて、`AgendaItem` の各フィールドをどのテンプレートタグ・どのシートに出力するかのルール。
実装は [`@sona/shared`](https://github.com/TakumiHata/sona-shared) の `src/excel/index.ts` (V2: `generateExcelFromTagTemplate` / V3: `generateExcelFromV3Template`)。

## タグ → AgendaItem フィールド対応表

| タグ | 解決値 | 優先順位 / 仕様 |
|---|---|---|
| `{{title}}` | `item.title` | 子議題は全角スペースでインデント (`\u3000` × depth) |
| `{{content}}` | `item.summaryText` → `item.refinedTranscript` → `item.rawTranscript` → `''` | 上から順にフォールバック。`summaryText` は録音終了時に事前生成される（後述） |
| `{{speaker}}` | `item.speaker` → `extractParticipants(item.rawTranscript).join(', ')` | 手動指定 (`item.speaker`) があれば優先、無ければ `rawTranscript` から `name: ` パターンで自動抽出（ユニーク化） |

### 補足: `{{speaker}}` の自動抽出

`SonaCore` は `rawTranscript` を `${speaker}: ${text}` 形式で生成しているため、
`@sona/shared` の `extractParticipants()` が各行先頭の `name: ` パターンをスキャンしてユニークな話者一覧を返す（例: `"田中, 佐藤, 不明"`）。

- 30 文字超の名前は誤検出 (URL や時刻 `12:30:`) として除外
- `AgendaItem.speaker` を populate する仕組みは現状無いが、将来「議題の主担当を手動指定する UI」を追加した場合の後方互換のため item.speaker を優先扱い

## Markdown カスタムタグ方針

Sona 固有の Markdown カスタムタグは **`<agenda>` のみ** とする（学習コスト最小化）。
ユーザーが覚えるのは次の 2 系統だけ：

- **Markdown カスタムタグ**: `<agenda id="...">...</agenda>`（議題セクション区切り）
- **Excel テンプレートタグ**: `{{title}}` / `{{content}}` / `{{speaker}}`

### 残すタグ

| タグ | 役割 | 理由 |
|---|---|---|
| `<agenda id="...">` | 議題セクション区切り。録音中のアクティブ議題ハイライト・AgendaItem 分割の基盤 | 技術的に必須（剥がせない） |
| `<details>` / `<summary>` | 折りたたみ | GFM 標準。Sona 固有ではないため対象外 |

### 廃止するタグ

| タグ | 廃止理由 |
|---|---|
| `<fixed>` | 訂正マーク（緑ラベル装飾）だが、Markdown 標準の `**太字**` / `> 引用` で代替可能。ユーザー利用実績なし |
| `<preview-only>` | 「画面には出すが Excel に出さない」用途だが、`description` は Excel 非出力（後述）ルールで不要化。ユーザー利用実績なし |

### 影響範囲（別 PR で実施）

- `sona-shared` の `src/tags/index.ts`: `stripFixedTags` / `stripPreviewOnly` / `extractFixedContent` / `extractPreviewOnlyContent` を削除。`sanitizeAgendasForExport` を `<agenda>` 除去のみに簡素化
- `Sona-Web` の `MarkdownHelpPanel.tsx`: 「Sona カスタムタグ」節から `<fixed>` / `<preview-only>` の行を削除
- `SonaCore`: 同様にレンダラ側の `<fixed>` / `<preview-only>` 対応コードを削除

## 要約 (`summaryText`) の生成タイミング

Excel 出力時の LLM 待ち時間をゼロにするため、要約は **録音終了時にバックグラウンドで生成・DB に永続化** する（事前生成方針）。
Excel 出力フローは DB から `summaryText` を読み取るのみで、LLM 呼び出しは行わない。

```
[録音終了] → [バックグラウンドで /summarize 呼び出し] → [summaryText を DB に永続化]
                                                              ↓
[Excel 出力ボタン] → [DB 読み取り] → [Excel 生成] → [ダウンロード]
                      ← LLM 呼び出しなし →
```

### 永続化先

`summaryText` は **Supabase の `sessions.agendas` JSONB 内に同居**させる（既存 AgendaItem 構造の一部）。新規テーブル/カラム追加は行わない。

### 再生成ポリシー

- 清書テキスト (`refinedTranscript`) が後から更新された場合、`summaryText` は古い清書ベースのまま残る
- UI から「要約を再生成」アクションを明示的に実行した場合のみ、再度 `/summarize` を呼び出して上書きする（自動再生成は行わない）

### 関連

- Sona-Web Issue #37（出力時要約の案）は本方針により **事前生成へ置き換え**
- Sona-Web Issue #42 の改善案 A1（要約の事前生成）に対応

## 出力されないフィールド

| フィールド | 理由 |
|---|---|
| `description` | 議題作成時のメモ・議論ガイド用途。会議録の Excel には含めない |
| `originalDescription` | 上記同様、編集前の元 description |
| `durationMinutes` | 内部統計用。Excel テンプレートにタグが無いため出力対象外 |
| `lastProcessedTranscript` / `isProcessing` | クライアント状態のため Excel 出力対象外 |

## シート構成

| シート | 内容 | マッピング |
|---|---|---|
| **Sheet1（メイン）** | テンプレートに従い `{{title}}` `{{content}}` `{{speaker}}` を配置 | あり (V2 タグ / V3 column_regions) |
| **Sheet2（清書）** | 議題タイトル + `refinedTranscript` (清書版) + 発言者一覧の3列固定 | 無し（フォーマット固定） |

Sheet2 は「テンプレートに収まらない長文清書を確認したい」ニーズに対応する補助シート。
※ 2026-04-18 時点では Sheet2 は未実装。本ドキュメントで仕様を確定し、実装は別 PR で追従する。

## 子議題（children）の表示

階層構造を保持しつつ単一シートで表現するため、フラット化したうえで `title` 列に**全角スペースでインデント**する：

```
親議題
　子議題 A
　　孫議題 A-1
　子議題 B
```

実装は `flattenAgendasWithDepth()` で各 AgendaItem に `depth` を付与し、`{{title}}` 解決時に `\u3000`.repeat(depth) を前置する。

別シートで階層展開する案や、列を増やす案は採用しない（テンプレート設計が複雑化するため）。

## 図表画像（Mermaid / Markdown 画像）の配置

`enrichAgendas` 処理で `description` 内の Mermaid / Markdown 画像を PNG 化し、`item.enrichedContent.images` に格納する。Excel への配置ルール：

| ルール | 内容 |
|---|---|
| 配置位置 | **対象議題の `{{content}}` 行の直下** に挿入（議題と画像の対応関係を視覚的に明確化） |
| サイズ | テンプレートのデータ領域幅に収まるよう自動縮小（アスペクト比維持） |
| 順序 | `enrichedContent.images` 配列の順序に従う |
| 配置失敗時 | 配置スキップ + ログ出力。Excel 自体の生成は継続 |

※ 2026-04-18 時点ではシート末尾に固まる実装になっている (Sona-Web Issue #40)。本ドキュメントで仕様を確定し、別 PR で対応。

## 関連 Issue / PR

- Sona-Web Issue #37 (出力時要約 → **本ドキュメントで事前生成方針に置換**)
- Sona-Web Issue #38 (マッピング情報のバグ修正は別 PR で追従)
- Sona-Web Issue #39 (本ルール策定で `{{speaker}}` の出力方針を確定 → [sona-shared#1](https://github.com/TakumiHata/sona-shared/pull/1) で実装)
- Sona-Web Issue #40 (図表画像配置の実装は別 PR で追従)
- Sona-Web Issue #41 (本ドキュメント自体が回答)
- Sona-Web Issue #42 (改善案 A1「要約の事前生成」を採用)
