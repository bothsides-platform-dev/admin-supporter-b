// eslint-config-next 16.x ships its own flat config arrays — no need for
// @eslint/eslintrc's FlatCompat shim anymore. FlatCompat targets legacy
// shareable-config resolution and chokes on this package's self-referential
// plugin objects (eslint-plugin-react's configs.recommended.plugins.react
// === itself), throwing "Converting circular structure to JSON".
//
// The package's plain default export ("eslint-config-next") only registers
// the @typescript-eslint parser/plugin with zero rules enabled — it is NOT
// the same as the old `next/typescript` shareable config that
// `compat.extends("next/core-web-vitals", "next/typescript")` used to load.
// The real TS rules (typescript-eslint's recommended set +
// no-unused-vars/no-unused-expressions) live in the separate
// "eslint-config-next/typescript" sub-export, and the full Next.js ruleset
// (react/import/jsx-a11y + @next/next's core-web-vitals rules, beyond what
// the bare default export carries) lives in "eslint-config-next/core-web-vitals".
// Import both explicitly so lint coverage matches the old two-config intent.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript];

export default eslintConfig;
