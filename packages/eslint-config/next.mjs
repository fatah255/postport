import nextPlugin from "@next/eslint-plugin-next";
import base from "./base.mjs";

export default [
  ...base,
  {
    plugins: {
      "@next/next": nextPlugin
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "react/react-in-jsx-scope": "off"
    }
  }
];
