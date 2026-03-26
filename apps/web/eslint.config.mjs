import nextConfig from "@postport/eslint-config/next";

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "*.tsbuildinfo",
      "next-env.d.ts",
      "scripts/**",
      "tailwind.config.ts"
    ]
  },
  ...nextConfig
];
