// figma_docs content — design rules and API reference.
//
// The sections live in server/docs/*.md rather than inline template literals.
// As literals they needed every backtick and ${ escaped — 289 escapes across
// 1,750 lines — which made the code samples in them easy to break and hard to
// read. They are documentation, so they are stored as documentation.
//
// server/docs/ must stay in package.json "files" or the published package ships
// without it and getDocs() throws at runtime.
import { readFileSync } from "node:fs";

const DOC_DIR = new URL("./docs/", import.meta.url);

const SECTIONS = ["index", "default", "rules", "layout", "api", "tokens", "icons"];

// Read once at startup: these are a few KB each and every figma_docs call would
// otherwise hit the disk.
const TEXT = {};
for (const name of SECTIONS) {
  TEXT[name] = readFileSync(new URL(name + ".md", DOC_DIR), "utf8");
}

// Sections a caller may ask for by name (index and default are composed).
const PUBLIC_SECTIONS = ["rules", "layout", "api", "tokens", "icons"];

export function getDocs(section) {
  if (!section) return TEXT.index + "\n\n" + TEXT.default;
  const key = String(section).toLowerCase();
  if (PUBLIC_SECTIONS.includes(key)) return TEXT[key];
  return `Unknown section: "${section}". Valid sections: ${PUBLIC_SECTIONS.join(" | ")}\n\n` + TEXT.index;
}

// Legacy export — returns default section (for backwards compatibility)
export const DOCS = getDocs(null);
