import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Relax TypeScript rules (non-type-checking)
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/prefer-as-const": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",

      // React rules
      "react/no-unescaped-entities": "warn",
      "react-hooks/exhaustive-deps": "warn",

      // Next.js rules
      "@next/next/no-img-element": "warn",

      // General rules
      "no-console": "warn",
      "prefer-const": "warn",

      // One display rule for dates and times: every user-facing date goes through useFormatters()
      // (the user's date and time format and timezone) or RelativeTime from the page chrome.
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name=/^toLocale(Date|Time)String$/]",
          message:
            "Format dates with useFormatters() from '@/shared/providers/PreferencesProvider' (or RelativeTime from '@/shared/components/page-chrome'), never toLocaleDateString/toLocaleTimeString.",
        },
      ],
    },
  },
  {
    // The maintenance page renders outside the app providers, so it has no user preferences to format with.
    files: ["src/app/maintenance/**"],
    rules: { "no-restricted-syntax": "off" },
  },
];

export default eslintConfig;
