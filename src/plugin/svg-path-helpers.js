// ─── SVG PATH NORMALIZATION ───────────────────────────────────────────────────
// BUG-04: Figma's vectorPaths expects space-separated coords. Normalize commas → spaces.
// BUG-03: Convert SVG `A` (arc) commands into cubic Bézier curves so Figma accepts them.

// Convert a single SVG elliptical arc into one or more cubic Bézier segments.
// Algorithm: Foley/van Dam — split arc into <=90° chunks, approximate each with cubic bezier.
// Returns an array of "C cp1x cp1y cp2x cp2y x y" segment strings (absolute coords).
function arcToCubicSegments(x1, y1, rx, ry, phi, largeArc, sweep, x2, y2) {
  var PI = Math.PI;
  var sin = Math.sin, cos = Math.cos;
  if (rx === 0 || ry === 0) return ["L " + x2 + " " + y2];
  rx = Math.abs(rx); ry = Math.abs(ry);
  var phiRad = phi * PI / 180;
  // Step 1: compute (x1', y1')
  var dx2 = (x1 - x2) / 2, dy2 = (y1 - y2) / 2;
  var x1p =  cos(phiRad) * dx2 + sin(phiRad) * dy2;
  var y1p = -sin(phiRad) * dx2 + cos(phiRad) * dy2;
  // Ensure radii are large enough
  var rxSq = rx * rx, rySq = ry * ry;
  var x1pSq = x1p * x1p, y1pSq = y1p * y1p;
  var radiiCheck = x1pSq / rxSq + y1pSq / rySq;
  if (radiiCheck > 1) {
    var scale = Math.sqrt(radiiCheck);
    rx *= scale; ry *= scale; rxSq = rx * rx; rySq = ry * ry;
  }
  // Step 2: compute (cx', cy')
  var sign = (largeArc === sweep) ? -1 : 1;
  var sq = (rxSq * rySq - rxSq * y1pSq - rySq * x1pSq) / (rxSq * y1pSq + rySq * x1pSq);
  sq = sq < 0 ? 0 : sq;
  var coef = sign * Math.sqrt(sq);
  var cxp = coef * (rx * y1p / ry);
  var cyp = coef * -(ry * x1p / rx);
  // Step 3: compute (cx, cy)
  var cx = cos(phiRad) * cxp - sin(phiRad) * cyp + (x1 + x2) / 2;
  var cy = sin(phiRad) * cxp + cos(phiRad) * cyp + (y1 + y2) / 2;
  // Step 4: compute θ1 and Δθ
  function angle(ux, uy, vx, vy) {
    var dot = ux * vx + uy * vy;
    var len = Math.sqrt(ux*ux + uy*uy) * Math.sqrt(vx*vx + vy*vy);
    var a = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    return (ux * vy - uy * vx < 0) ? -a : a;
  }
  var theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  var deltaTheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && deltaTheta > 0) deltaTheta -= 2 * PI;
  if (sweep && deltaTheta < 0) deltaTheta += 2 * PI;

  // Split into <=90° arcs (each approximated by one cubic Bézier)
  var segments = Math.ceil(Math.abs(deltaTheta) / (PI / 2));
  var dTheta = deltaTheta / segments;
  var t = (8 / 3) * Math.sin(dTheta / 4) * Math.sin(dTheta / 4) / Math.sin(dTheta / 2);
  var out = [];
  var curX = x1, curY = y1;
  for (var i = 0; i < segments; i++) {
    var th1 = theta1 + i * dTheta;
    var th2 = theta1 + (i + 1) * dTheta;
    var c1x = curX + rx * cos(phiRad) * (-sin(th1)) * t - ry * sin(phiRad) * (cos(th1)) * t;
    var c1y = curY + rx * sin(phiRad) * (-sin(th1)) * t + ry * cos(phiRad) * (cos(th1)) * t;
    var endX = cos(phiRad) * rx * cos(th2) - sin(phiRad) * ry * sin(th2) + cx;
    var endY = sin(phiRad) * rx * cos(th2) + cos(phiRad) * ry * sin(th2) + cy;
    var c2x = endX - rx * cos(phiRad) * (-sin(th2)) * t + ry * sin(phiRad) * (cos(th2)) * t;
    var c2y = endY - rx * sin(phiRad) * (-sin(th2)) * t - ry * cos(phiRad) * (cos(th2)) * t;
    out.push("C " + c1x + " " + c1y + " " + c2x + " " + c2y + " " + endX + " " + endY);
    curX = endX; curY = endY;
  }
  return out;
}

// Normalize an SVG path string for Figma's vectorPaths:
//  - BUG-04: replace commas with spaces
//  - BUG-03: replace A/a arc commands with equivalent cubic bezier (C) segments
//  - Convert relative commands (m,l,h,v,c,q,s,t) to absolute
function normalizeSvgPath(d) {
  if (!d || typeof d !== "string") return d;
  // Insert space before every command letter, replace commas with spaces
  var spaced = d.replace(/,/g, " ").replace(/([MLHVCSQTAZmlhvcsqtaz])/g, " $1 ").replace(/\s+/g, " ").trim();
  // If no commands needing conversion (H, V, A, or any relative), return early
  if (!/[HhVvAa]/.test(spaced) && !/[mlcsqt]/.test(spaced)) {
    return spaced;
  }
  // Tokenize: split on command letters while keeping them
  var tokens = spaced.match(/[MLHVCSQTAZmlhvcsqtaz][^MLHVCSQTAZmlhvcsqtaz]*/g) || [];
  var cx = 0, cy = 0;      // current pen position
  var startX = 0, startY = 0; // subpath start (for Z)
  var out = [];
  for (var ti = 0; ti < tokens.length; ti++) {
    var tok = tokens[ti].trim();
    var cmd = tok[0];
    var argsStr = tok.slice(1).trim();
    var args = argsStr ? argsStr.split(/\s+/).map(Number) : [];
    var isRelative = cmd === cmd.toLowerCase();
    var upperCmd = cmd.toUpperCase();
    if (upperCmd === "M") {
      for (var mi = 0; mi < args.length; mi += 2) {
        var mx = args[mi], my = args[mi+1];
        if (isRelative) { mx += cx; my += cy; }
        if (mi === 0) {
          out.push("M " + mx + " " + my);
          startX = mx; startY = my;
        } else {
          out.push("L " + mx + " " + my);
        }
        cx = mx; cy = my;
      }
    } else if (upperCmd === "L") {
      for (var li = 0; li < args.length; li += 2) {
        var lx = args[li], ly = args[li+1];
        if (isRelative) { lx += cx; ly += cy; }
        out.push("L " + lx + " " + ly);
        cx = lx; cy = ly;
      }
    } else if (upperCmd === "H") {
      for (var hi = 0; hi < args.length; hi++) {
        var hx = args[hi]; if (isRelative) hx += cx;
        out.push("L " + hx + " " + cy);
        cx = hx;
      }
    } else if (upperCmd === "V") {
      for (var vi = 0; vi < args.length; vi++) {
        var vy = args[vi]; if (isRelative) vy += cy;
        out.push("L " + cx + " " + vy);
        cy = vy;
      }
    } else if (upperCmd === "C") {
      for (var ci2 = 0; ci2 < args.length; ci2 += 6) {
        var c1x = args[ci2], c1y = args[ci2+1],
            c2x = args[ci2+2], c2y = args[ci2+3],
            ex  = args[ci2+4], ey  = args[ci2+5];
        if (isRelative) { c1x += cx; c1y += cy; c2x += cx; c2y += cy; ex += cx; ey += cy; }
        out.push("C " + c1x + " " + c1y + " " + c2x + " " + c2y + " " + ex + " " + ey);
        cx = ex; cy = ey;
      }
    } else if (upperCmd === "Q") {
      for (var qi = 0; qi < args.length; qi += 4) {
        var qcx = args[qi], qcy = args[qi+1], qex = args[qi+2], qey = args[qi+3];
        if (isRelative) { qcx += cx; qcy += cy; qex += cx; qey += cy; }
        out.push("Q " + qcx + " " + qcy + " " + qex + " " + qey);
        cx = qex; cy = qey;
      }
    } else if (upperCmd === "A") {
      // BUG-03: convert arc to cubic bezier(s)
      for (var ai = 0; ai < args.length; ai += 7) {
        var rx = args[ai], ry = args[ai+1], phi = args[ai+2],
            largeArc = args[ai+3], sweep = args[ai+4],
            aex = args[ai+5], aey = args[ai+6];
        if (isRelative) { aex += cx; aey += cy; }
        var segs = arcToCubicSegments(cx, cy, rx, ry, phi, largeArc, sweep, aex, aey);
        for (var si = 0; si < segs.length; si++) out.push(segs[si]);
        cx = aex; cy = aey;
      }
    } else if (upperCmd === "Z") {
      out.push("Z");
      cx = startX; cy = startY;
    } else {
      // S, T, and unknown — pass through (Figma handles S/T natively)
      out.push(tok);
    }
  }
  return out.join(" ");
}
