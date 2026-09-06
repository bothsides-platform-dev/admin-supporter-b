// eslint-config-next 16.x ships its own flat config array (core-web-vitals +
// typescript combined) — no need for @eslint/eslintrc's FlatCompat shim
// anymore. FlatCompat targets legacy shareable-config resolution and chokes
// on this package's self-referential plugin objects (eslint-plugin-react's
// configs.recommended.plugins.react === itself), throwing "Converting
// circular structure to JSON" out of ConfigValidator.formatErrors.
import nextConfig from "eslint-config-next";

const eslintConfig = [...nextConfig];

export default eslintConfig;
