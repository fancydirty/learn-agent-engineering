import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import tokyoNight from "@shikijs/themes/tokyo-night";
import githubLight from "@shikijs/themes/github-light";
import bash from "@shikijs/langs/bash";
import css from "@shikijs/langs/css";
import diff from "@shikijs/langs/diff";
import docker from "@shikijs/langs/docker";
import html from "@shikijs/langs/html";
import javascript from "@shikijs/langs/javascript";
import json from "@shikijs/langs/json";
import jsx from "@shikijs/langs/jsx";
import markdown from "@shikijs/langs/markdown";
import python from "@shikijs/langs/python";
import sql from "@shikijs/langs/sql";
import tsx from "@shikijs/langs/tsx";
import typescript from "@shikijs/langs/typescript";
import yaml from "@shikijs/langs/yaml";
import { languageAliases, supportedLanguages, normalizeLanguage } from "./shiki-langs";
export { supportedLanguages } from "./shiki-langs";

const LIGHT_THEME = "github-light";
const DARK_THEME = "tokyo-night";

export type CodeToken = { content: string; htmlStyle?: Record<string, string> };
export type TokenizeResult = { tokens: CodeToken[][]; displayLang: string };

const highlighter = createHighlighterCoreSync({
  themes: [githubLight, tokyoNight],
  langs: [bash, css, diff, docker, html, javascript, json, jsx, markdown, python, sql, tsx, typescript, yaml],
  engine: createJavaScriptRegexEngine(),
});

const cache = new Map<string, TokenizeResult>();

export function tokenizeCode(code: string, language: string): TokenizeResult {
  const lang = normalizeLanguage(language || "");
  if (!supportedLanguages.has(lang)) {
    return { tokens: code.split("\n").map((line) => [{ content: line }]), displayLang: "" };
  }
  const key = `${lang} ${code}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const std = languageAliases.get(lang) ?? lang;
  const result: TokenizeResult = {
    tokens: highlighter.codeToTokens(code, {
      lang,
      themes: { light: LIGHT_THEME, dark: DARK_THEME },
    }).tokens as unknown as CodeToken[][],
    displayLang: std.toUpperCase(),
  };
  cache.set(key, result);
  return result;
}
