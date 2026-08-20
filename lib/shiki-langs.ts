// Language aliases/support table/display names — pure string logic, zero shiki dependency.
// md.tsx/course-markdown.tsx import only this; must not import shiki-highlighter (263KB on first paint).
export const languageAliases = new Map<string, string>([
  ["cjs", "javascript"],
  ["dockerfile", "docker"],
  ["js", "javascript"],
  ["md", "markdown"],
  ["mjs", "javascript"],
  ["py", "python"],
  ["sh", "bash"],
  ["shell", "bash"],
  ["shellscript", "bash"],
  ["ts", "typescript"],
  ["yml", "yaml"],
  ["zsh", "bash"],
]);

export const supportedLanguages = new Set([
  "bash", "css", "diff", "docker", "html", "javascript", "json", "jsx",
  "markdown", "python", "sql", "tsx", "typescript", "yaml",
  ...languageAliases.keys(),
]);

export function normalizeLanguage(language: string) {
  const lower = language.trim().toLowerCase();
  return languageAliases.get(lower) ?? lower;
}

export function displayLangFor(language: string): string {
  const lang = normalizeLanguage(language || "");
  if (!supportedLanguages.has(lang)) return "";
  return (languageAliases.get(lang) ?? lang).toUpperCase();
}
