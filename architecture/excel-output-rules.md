# Excel 出力ルール

会議終了後の Excel エクスポートにおいて、`AgendaItem` の各フィールドをどのテンプレートタグ・どのシートに出力するかのルール。
実装は [`@sona/shared`](https://github.com/TakumiHata/sona-shared) の `src/excel/index.ts` (V2: `generateExcelFromTagTemplate` / V3: `generateExcelFromV3Template`)。

## タグ → AgendaItem フィールド対応表

| タグ | 解決値 | 優先順位 / 仕様 |
|---|---|---|
| `{{title}}` | `item.title` | 子議題は全角スペースでインデント (`\u3000` × depth) |
| `{{content}}` | `item.summaryText` → `item.refinedTranscript` → `item.rawTranscript` → `''` | 上から順にフォールバック |
| `{{speaker}}` | `item.speaker` → `extractParticipants(item.rawTranscript).join(', ')` | 手動指定 (`item.speaker`) があれば優先、無ければ `rawTranscript` から `name: ` パターンで自動抽出（ユニーク化） |

### 補足: `{{speaker}}` の自動抽出

`SonaCore` は `rawTranscript` を `${speaker}: ${text}` 形式で生成しているため、
`@sona/shared` の `extractParticipants()` が各行先頭の `name: ` パターンをスキャンしてユニークな話者一覧を返す（例: `"田中, 佐藤, 不明"`）。

- 30 文字超の名前は誤検出 (URL や時刻 `12:30:`) として除外
- `AgendaItem.speaker` を populate する仕組みは現状無いが、将来「議題の主担当を手動指定する UI」を追加した場合の後方互換のため item.speaker を優先扱い

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

- Sona-Web Issue #39 (本ルール策定で `{{speaker}}` の出力方針を確定 → [sona-shared#1](https://github.com/TakumiHata/sona-shared/pull/1) で実装)
- Sona-Web Issue #41 (本ドキュメント自体が回答)
- Sona-Web Issue #40 (図表画像配置の実装は別 PR で追従)
