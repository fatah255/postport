import baseConfig from "@postport/eslint-config";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "*.tsbuildinfo", "test/**/*.js"]
  },
  ...baseConfig,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off"
    }
  }
];
