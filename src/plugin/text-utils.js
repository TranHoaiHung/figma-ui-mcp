// ─── TEXT UTILS ───
// Text reads that have to cope with figma.mixed, plus font loading.
// Split out of utils.js; concatenated into one scope by
// scripts/build-plugin.js, so these files share globals and do not import.

// ─── TEXT FONT ────────────────────────────────────────────────────────────────

// A text node's font, with mixed style runs handled.
//
// `node.fontName` is `figma.mixed` — a Symbol — whenever the node's characters
// do not all share one font. Symbols are truthy, so the common idiom
//
//     info.fontFamily = node.fontName ? node.fontName.family : null;
//
// takes the wrong branch: `.family` on a Symbol is `undefined`, not a throw. A
// key set to `undefined` is then dropped when the result is serialised, so the
// field arrives *absent* rather than null — which downstream cannot tell apart
// from "this node has no font". Whole files report `allFonts: []` this way while
// rendering perfectly well in Figma.
//
// Reading a mixed property returns the sentinel instead of throwing, so wrapping
// the read in try/catch does not help either; the runs have to be asked for.
function readFontName(node) {
  var fn;
  try { fn = node.fontName; } catch (e) { return { family: null, style: null, mixed: false }; }

  if (typeof fn !== "symbol") {
    return fn ? { family: fn.family, style: fn.style, mixed: false }
              : { family: null, style: null, mixed: false };
  }

  // Mixed. Report the first run, and say that it is only the first.
  try {
    var segs = node.getStyledTextSegments(["fontName"]);
    if (segs && segs.length && segs[0].fontName) {
      return { family: segs[0].fontName.family, style: segs[0].fontName.style, mixed: segs.length > 1 };
    }
  } catch (e) {}
  try {
    var first = node.getRangeFontName(0, 1);
    if (first && typeof first !== "symbol") {
      return { family: first.family, style: first.style, mixed: true };
    }
  } catch (e) {}
  return { family: null, style: null, mixed: true };
}

// ─── TEXT PROPERTIES ──────────────────────────────────────────────────────────

// Every mixed-capable scalar on a text node has the same trap as fontName: when
// the characters disagree, the property is `figma.mixed`, a Symbol. Symbols are
// truthy and do not throw on property access, so the usual idioms misfire in two
// distinct ways:
//
//     detail.fontSize = node.fontSize + "px";        // TypeError on a Symbol
//     detail.lineHeight = node.lineHeight.value + "px";  // "undefinedpx"
//
// The TypeError is the worse of the two, because the surrounding catch then
// discards every *other* field it had already gathered — colour, alignment, and
// the font that readFontName just resolved correctly.
function readMixedNumber(node, prop) {
  var v;
  try { v = node[prop]; } catch (e) { return { value: null, mixed: false }; }
  if (typeof v === "symbol") return { value: null, mixed: true };
  return { value: typeof v === "number" ? v : null, mixed: false };
}

// lineHeight and letterSpacing are objects ({ value, unit }) rather than scalars,
// so a mixed read yields a Symbol whose .value is undefined.
function readMixedUnitValue(node, prop) {
  var v;
  try { v = node[prop]; } catch (e) { return { value: null, unit: null, mixed: false }; }
  if (typeof v === "symbol") return { value: null, unit: null, mixed: true };
  if (!v) return { value: null, unit: null, mixed: false };
  return { value: typeof v.value === "number" ? v.value : null, unit: v.unit || null, mixed: false };
}

// Formats lineHeight the way the read handlers present it. `autoLabel` differs
// between call sites by accident of history — get_node_detail says "normal",
// extractDesignTree says "auto" — so it stays a parameter until that is unified.
function formatLineHeight(lh, autoLabel) {
  if (!lh || lh.mixed) return null;
  if (lh.unit === "AUTO") return autoLabel;
  if (lh.value === null) return null;
  if (lh.unit === "PERCENT") return Math.round(lh.value) + "%";
  return lh.value + "px";
}

// One reader for every text property, so a fix lands in one place instead of the
// five call sites that each had their own copy. Scalars are null when unreadable,
// never undefined, and `mixed` says which properties actually disagree.
function readTextProps(node) {
  var font = readFontName(node);
  var size = readMixedNumber(node, "fontSize");
  var lh   = readMixedUnitValue(node, "lineHeight");
  var ls   = readMixedUnitValue(node, "letterSpacing");

  var content = null;
  try { content = node.characters; } catch (e) {}

  var align = null;
  try { align = node.textAlignHorizontal ? String(node.textAlignHorizontal).toLowerCase() : null; } catch (e) {}

  var out = {
    content:       content,
    fontFamily:    font.family,
    fontWeight:    font.style,
    fontSize:      size.value,
    lineHeight:    lh,
    letterSpacing: ls,
    textAlign:     align,
    mixed: {
      font:          font.mixed,
      fontSize:      size.mixed,
      lineHeight:    lh.mixed,
      letterSpacing: ls.mixed,
    },
  };
  out.anyMixed = out.mixed.font || out.mixed.fontSize || out.mixed.lineHeight || out.mixed.letterSpacing;
  return out;
}

// Per-run styling, for consumers that need the detail rather than the first run.
// Returns null when the node is single-styled, so callers can omit the field.
function readTextSegments(node) {
  if (typeof node.getStyledTextSegments !== "function") return null;
  var segs;
  try { segs = node.getStyledTextSegments(["fontName", "fontSize", "fills"]); } catch (e) { return null; }
  if (!segs || segs.length < 2) return null;
  var out = [];
  for (var i = 0; i < segs.length; i++) {
    var s = segs[i];
    out.push({
      characters: s.characters,
      start:      s.start,
      end:        s.end,
      fontFamily: s.fontName ? s.fontName.family : null,
      fontWeight: s.fontName ? s.fontName.style : null,
      fontSize:   typeof s.fontSize === "number" ? s.fontSize : null,
      fill:       s.fills && s.fills.length ? rgbToHex(s.fills[0].color) : null,
    });
  }
  return out;
}

// Loads every font a text node uses. A mixed node has no single fontName to pass
// to loadFontAsync — handing it the Symbol, or {family: undefined}, throws — so
// the runs have to be enumerated and loaded individually.
async function ensureTextFontLoaded(node) {
  var fn;
  try { fn = node.fontName; } catch (e) { return; }

  if (typeof fn !== "symbol") {
    if (fn && fn.family) { try { await figma.loadFontAsync(fn); } catch (e) {} }
    return;
  }

  var segs = null;
  try { segs = node.getStyledTextSegments(["fontName"]); } catch (e) {}
  if (!segs || !segs.length) return;

  var seen = {};
  for (var i = 0; i < segs.length; i++) {
    var f = segs[i].fontName;
    if (!f || !f.family) continue;
    var key = f.family + "|" + f.style;
    if (seen[key]) continue;
    seen[key] = true;
    try { await figma.loadFontAsync(f); } catch (e) {}
  }
}
