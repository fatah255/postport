export const locales = ["en", "fr", "ar"] as const;
export type Locale = (typeof locales)[number];

export const isRtl = (locale: string): boolean => {
  return locale === "ar";
};
