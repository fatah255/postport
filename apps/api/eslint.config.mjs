import nestConfig from "@postport/eslint-config/nest";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "*.tsbuildinfo"]
  },
  ...nestConfig
];
