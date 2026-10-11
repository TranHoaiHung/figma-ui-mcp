#!/usr/bin/env node
// Mixed-style text reads: figma.mixed is a Symbol, so the obvious idioms either
// throw (fontSize + "px") or silently produce "undefinedpx" / a dropped key.
// Run: node scripts/test-text-props.mjs
import { loadPlugin } from "./lib/load-plugin.mjs";

const MIXED = Symbol('figma.mixed');
const sb = loadPlugin({ figma: { mixed: MIXED, loadFontAsync: async () => {} } },
                      { only: ['utils.js'] });
const { readTextProps, formatLineHeight, ensureTextFontLoaded } = sb;

let pass = 0, fail = 0;
const t = (label, cond, got) => {
  if (cond) { console.log('PASS ', label); pass++; }
  else { console.log('FAIL ', label, '| got:', JSON.stringify(got)); fail++; }
};

// 1. The TypeError case: fontSize is mixed. Old code threw and lost EVERYTHING.
const allMixed = readTextProps({
  characters: 'Hello',
  fontName: MIXED,
  fontSize: MIXED,
  lineHeight: MIXED,
  letterSpacing: MIXED,
  textAlignHorizontal: 'CENTER',
  getStyledTextSegments: () => [{ fontName: { family: 'Poppins', style: 'Bold' } }],
});
t('mixed fontSize does not throw', true);
t('content survives a fully mixed node', allMixed.content === 'Hello', allMixed.content);
t('align survives (old catch dropped it)', allMixed.textAlign === 'center', allMixed.textAlign);
t('font still resolved via segments', allMixed.fontFamily === 'Poppins', allMixed.fontFamily);
t('fontSize is null, not undefined', allMixed.fontSize === null, allMixed.fontSize);
t('mixed.fontSize flagged', allMixed.mixed.fontSize === true, allMixed.mixed);
t('anyMixed true', allMixed.anyMixed === true, allMixed.anyMixed);

// 2. No more "undefinedpx"
t('mixed lineHeight -> null not "undefinedpx"',
  formatLineHeight(allMixed.lineHeight, 'auto') === null,
  formatLineHeight(allMixed.lineHeight, 'auto'));

// 3. Normal node unchanged
const plain = readTextProps({
  characters: 'Hi', fontName: { family: 'Inter', style: 'Regular' },
  fontSize: 14, lineHeight: { value: 20, unit: 'PIXELS' },
  letterSpacing: { value: 0, unit: 'PIXELS' }, textAlignHorizontal: 'LEFT',
});
t('plain node: family', plain.fontFamily === 'Inter', plain.fontFamily);
t('plain node: size', plain.fontSize === 14, plain.fontSize);
t('plain node: lineHeight 20px', formatLineHeight(plain.lineHeight, 'auto') === '20px', formatLineHeight(plain.lineHeight,'auto'));
t('plain node: anyMixed false', plain.anyMixed === false, plain.anyMixed);

// 4. AUTO label stays caller-controlled
t('AUTO -> "normal"', formatLineHeight({unit:'AUTO',value:null,mixed:false}, 'normal') === 'normal');
t('AUTO -> "auto"',   formatLineHeight({unit:'AUTO',value:null,mixed:false}, 'auto') === 'auto');
t('PERCENT rounds',   formatLineHeight({unit:'PERCENT',value:149.6,mixed:false},'auto') === '150%');

// 5. ensureTextFontLoaded loads each distinct run exactly once
const loaded = [];
sb.figma.loadFontAsync = async (f) => { loaded.push(f.family + '|' + f.style); };
await ensureTextFontLoaded({
  fontName: MIXED,
  getStyledTextSegments: () => [
    { fontName: { family: 'Poppins', style: 'Bold' } },
    { fontName: { family: 'Inter', style: 'Regular' } },
    { fontName: { family: 'Poppins', style: 'Bold' } },   // dupe
  ],
});
t('loads each distinct font once', loaded.length === 2 && loaded.includes('Poppins|Bold') && loaded.includes('Inter|Regular'), loaded);

// 6. Never hands loadFontAsync a Symbol or undefined family
const bad = [];
sb.figma.loadFontAsync = async (f) => {
  if (typeof f === 'symbol' || !f || f.family === undefined) bad.push(f);
};
await ensureTextFontLoaded({ fontName: MIXED, getStyledTextSegments: () => { throw new Error('x'); } });
await ensureTextFontLoaded({ fontName: MIXED, getStyledTextSegments: () => [] });
t('never passes Symbol/undefined to loadFontAsync', bad.length === 0, bad);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
