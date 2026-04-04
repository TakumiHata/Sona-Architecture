/**
 * tokens/colors.json から Tailwind プリセットと CSS 変数を生成する。
 * Usage: node scripts/build.js
 */
const fs = require('fs');
const path = require('path');

const tokens = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'tokens', 'colors.json'), 'utf-8')
);

// --- Tailwind プリセット生成 ---
const tailwindPreset = `/** Auto-generated from tokens/colors.json — do not edit manually */
module.exports = {
  theme: {
    extend: {
      colors: ${JSON.stringify(tokens, null, 8).replace(/"([^"]+)":/g, "'$1':").replace(/"/g, "'")},
    },
  },
};
`;

fs.writeFileSync(
  path.join(__dirname, '..', 'tailwind-preset.js'),
  tailwindPreset
);

// --- CSS 変数生成 ---
function flattenTokens(obj, prefix = '') {
  const result = [];
  for (const [key, value] of Object.entries(obj)) {
    const name = prefix ? `${prefix}-${key}` : key;
    if (typeof value === 'object' && !Array.isArray(value)) {
      result.push(...flattenTokens(value, name));
    } else {
      const cssName = name === 'accent-DEFAULT' ? 'accent' : name;
      result.push(`  --sona-${cssName}: ${value};`);
    }
  }
  return result;
}

const cssContent = `/* Auto-generated from tokens/colors.json — do not edit manually */
:root {
${flattenTokens(tokens).join('\n')}
}
`;

fs.writeFileSync(
  path.join(__dirname, '..', 'css-variables.css'),
  cssContent
);

console.log('Generated: tailwind-preset.js, css-variables.css');
