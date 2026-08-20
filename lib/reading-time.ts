const CJK = /[一-鿿぀-ヿ]/g;

export function estimateMinutes(texts: string[]): number {
  const text = texts.join("\n");
  const cjk = (text.match(CJK) || []).length;
  const en = (text.replace(CJK, " ").match(/[A-Za-z0-9]+/g) || []).length;
  return Math.max(1, Math.ceil(cjk / 400 + en / 200));
}
