import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import { fixupPluginRules } from "@eslint/compat";
import globals from "globals";

export default defineConfig([
    globalIgnores([
        "dist/**",
        "coverage/**",
        "node_modules/**",
        "**/*.test.ts",
    ]),
    {
        files: ["**/*.ts"],

        extends: [js.configs.recommended],

        plugins: {
            "@typescript-eslint": typescriptEslint,
            "import": fixupPluginRules(importPlugin),
        },

        languageOptions: {
            globals: {
                ...globals.node,
            },

            parser: tsParser,
            ecmaVersion: "latest",
            sourceType: "module",
        },

        rules: {
            ...typescriptEslint.configs.recommended.rules,

            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/explicit-function-return-type": "off",

            "@typescript-eslint/no-unused-vars": ["warn", {
                argsIgnorePattern: "^_",
            }],

            indent: ["error", 4, {
                SwitchCase: 1,
            }],

            "import/extensions": ["error", "never", {
                ignorePackages: true,
                pattern: {
                    "js": "never",
                    "ts": "never",
                    "d": "always"
                }
            }],

            "import/no-extraneous-dependencies": ["error", {
                devDependencies: true,
                optionalDependencies: false,
                peerDependencies: false,
            }],

            "no-undef": "off",

            "no-console": ["error"],

            "no-restricted-imports": ["error", {
                paths: [],
                patterns: [
                    {
                        group: ["src/**"],
                        message: "Use absolute imports instead of relative imports"
                    }
                ]
            }]
        },
    }]);
