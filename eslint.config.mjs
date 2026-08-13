import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["node_modules/**", "dist/**", ".workbuddy/**", "test/fixtures/**"],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      sourceType: "module",
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    files: ["**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  }
);
