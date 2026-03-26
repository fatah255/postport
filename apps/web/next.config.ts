import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig = {
  transpilePackages: ["@postport/ui"]
};

export default withNextIntl(nextConfig);
