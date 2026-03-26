import baseConfig from "@postport/eslint-config";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "*.tsbuildinfo"]
  },
  ...baseConfig
];
