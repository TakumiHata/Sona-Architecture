# Sona デザインシステム

Sona プロジェクト全体（SonaCore / Sona-Web）で共通のデザイントークンとガイドライン。

## カラートークン

アプリアイコンのカラーテーマを基盤とする。

### ブランドカラー

| トークン名 | 色 | コード | 用途 |
|-----------|-----|--------|------|
| `brand-base` | ダークインディゴ | `#1A1A2E` | 背景・ベース |
| `brand-accent` | グリーン | `#38E870` | 主要操作・アクセント |
| `brand-text` | ライトグレー | `#E8E8E8` | テキスト・コンテンツ |

### 背景カラー

| トークン名 | コード | 用途 |
|-----------|--------|------|
| `bg-primary` | `#1A1A2E` | メイン背景 |
| `bg-secondary` | `#16162A` | パネル・サイドバー |
| `bg-tertiary` | `#12122A` | 埋め込み要素・入力欄 |
| `bg-elevated` | `#222244` | ホバー・アクティブ状態 |
| `bg-surface` | `rgba(255, 255, 255, 0.03)` | カード・コードブロック |

### テキストカラー

| トークン名 | コード | 用途 |
|-----------|--------|------|
| `text-primary` | `#E8E8E8` | 本文テキスト |
| `text-heading` | `#F0F0F0` | 見出し |
| `text-secondary` | `#A0A0A0` | 補助テキスト |
| `text-muted` | `#666680` | 非活性・プレースホルダー |

### ボーダーカラー

| トークン名 | コード | 用途 |
|-----------|--------|------|
| `border-default` | `rgba(255, 255, 255, 0.1)` | 標準ボーダー |
| `border-subtle` | `rgba(255, 255, 255, 0.06)` | 薄いボーダー（見出し下線等） |

### アクセントカラー

| トークン名 | コード | 用途 |
|-----------|--------|------|
| `accent-primary` | `#38E870` | プライマリボタン・リンク |
| `accent-hover` | `#2FCC5B` | ホバー状態 |
| `accent-subtle` | `rgba(56, 232, 112, 0.05)` | 薄い背景（fixed ボックス等） |
| `accent-glow` | `#5FFF90` | ハイライト・強調 |

### ステータスカラー

| トークン名 | コード | 用途 |
|-----------|--------|------|
| `status-error` | `#FF6B6B` | エラー |
| `status-error-bg` | `rgba(255, 107, 107, 0.1)` | エラー背景 |
| `status-warning` | `#E8A838` | 警告・preview-only |
| `status-warning-bg` | `rgba(232, 168, 56, 0.05)` | 警告背景 |
| `status-recording` | `#EF4444` | 録音中インジケーター |
| `status-info` | `#6C9EFF` | 情報・agenda ボックス |
| `status-info-bg` | `rgba(108, 158, 255, 0.05)` | 情報背景 |

## Tailwind 設定例

各リポジトリの `tailwind.config.js` に以下を追加:

```js
// tailwind.config.js
export default {
  theme: {
    extend: {
      colors: {
        brand: {
          base: '#1A1A2E',
          accent: '#38E870',
          text: '#E8E8E8',
        },
        surface: {
          primary: '#1A1A2E',
          secondary: '#16162A',
          tertiary: '#12122A',
          elevated: '#222244',
        },
        accent: {
          DEFAULT: '#38E870',
          hover: '#2FCC5B',
          glow: '#5FFF90',
          subtle: 'rgba(56, 232, 112, 0.05)',
        },
      },
    },
  },
};
```

## CSS 変数（非 Tailwind 用）

```css
:root {
  /* ブランド */
  --brand-base: #1A1A2E;
  --brand-accent: #38E870;
  --brand-text: #E8E8E8;

  /* 背景 */
  --bg-primary: #1A1A2E;
  --bg-secondary: #16162A;
  --bg-tertiary: #12122A;
  --bg-elevated: #222244;
  --bg-surface: rgba(255, 255, 255, 0.03);

  /* テキスト */
  --text-primary: #E8E8E8;
  --text-heading: #F0F0F0;
  --text-secondary: #A0A0A0;
  --text-muted: #666680;

  /* ボーダー */
  --border-default: rgba(255, 255, 255, 0.1);
  --border-subtle: rgba(255, 255, 255, 0.06);

  /* アクセント */
  --accent-primary: #38E870;
  --accent-hover: #2FCC5B;
  --accent-subtle: rgba(56, 232, 112, 0.05);
  --accent-glow: #5FFF90;

  /* ステータス */
  --status-error: #FF6B6B;
  --status-error-bg: rgba(255, 107, 107, 0.1);
  --status-warning: #E8A838;
  --status-warning-bg: rgba(232, 168, 56, 0.05);
  --status-recording: #EF4444;
  --status-info: #6C9EFF;
  --status-info-bg: rgba(108, 158, 255, 0.05);
}
```

## 適用ガイドライン

### ボタン

| 種類 | 背景 | テキスト | 用途 |
|------|------|---------|------|
| プライマリ | `accent-primary` | `brand-base` | 主要操作（録音開始、保存等） |
| セカンダリ | `bg-elevated` | `text-primary` | 補助操作（インポート、エクスポート等） |
| デストラクティブ | `status-error` | `white` | 削除・中止 |
| ゴースト | `transparent` | `text-secondary` | ナビゲーション・トグル |

### カスタムブロック（MarkdownPreview）

| ブロック | ボーダー色 | 背景 | ラベル色 |
|---------|-----------|------|---------|
| `<fixed>` | `accent-primary` | `accent-subtle` | `accent-primary` |
| `<preview-only>` | `status-warning` | `status-warning-bg` | `status-warning` |
| `<agenda>` | `status-info` | `status-info-bg` | `status-info` |
| `<details>` | `border-default` | `bg-surface` | `text-secondary` |

### 録音中の表示

- 録音インジケーター: `status-recording` + `animate-pulse`
- 録音中のボーダー: `status-recording` で強調表示はしない（目立ちすぎを防ぐ）
