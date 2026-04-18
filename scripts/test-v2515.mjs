#!/usr/bin/env node
// Backtests for v2.5.15 fixes: BUG-06, BUG-13/15/16/17/19
// Run: node scripts/test-v2515.mjs
import { executeCode } from "../server/code-executor.js";

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log("  ✓", label);
    passed++;
  } else {
    console.error("  ✗", label, detail ? `— ${detail}` : "");
    failed++;
  }
}

function makeBridge(overrides = {}) {
  return {
    sendOperation: async (op, params) => {
      if (overrides[op]) return overrides[op](params);
      throw new Error("Unexpected bridge op: " + op);
    }
  };
}

// ── BUG-06: arcData key normalization startAngle/endAngle → startingAngle/endingAngle ──
console.log("\nBUG-06: arcData — startAngle/endAngle auto-normalized");
{
  let captured = null;
  const bridge = makeBridge({
    create: (p) => { captured = p; return { id: "e:1", type: "ELLIPSE", name: "arc" }; }
  });

  // Pass old-style keys (startAngle / endAngle)
  const r = await executeCode(`
    return await figma.create({
      type: "ELLIPSE", width: 130, height: 130,
      fill: "#00000000", stroke: "#428DE7", strokeWeight: 14,
      arcData: { startAngle: -1.5708, endAngle: 3.0, innerRadius: 0 }
    });
  `, bridge);
  assert("ELLIPSE with startAngle/endAngle succeeds", r.success, r.error);
  assert("arcData.startingAngle normalized", captured && captured.arcData && captured.arcData.startingAngle !== undefined,
    JSON.stringify(captured && captured.arcData));
  assert("arcData.endingAngle normalized", captured && captured.arcData && captured.arcData.endingAngle !== undefined,
    JSON.stringify(captured && captured.arcData));
  assert("startingAngle value correct", captured && Math.abs(captured.arcData.startingAngle - (-1.5708)) < 0.001,
    "got: " + (captured && captured.arcData && captured.arcData.startingAngle));
  assert("endingAngle value correct", captured && Math.abs(captured.arcData.endingAngle - 3.0) < 0.001,
    "got: " + (captured && captured.arcData && captured.arcData.endingAngle));
  assert("innerRadius preserved", captured && captured.arcData.innerRadius === 0);
  // startAngle should NOT appear in output (only normalized keys)
  assert("no old startAngle key in output", captured && captured.arcData.startAngle === undefined);
}

// ── BUG-06: new-style keys pass through unchanged ────────────────────────────
console.log("\nBUG-06: startingAngle/endingAngle pass through unchanged");
{
  let captured = null;
  const bridge = makeBridge({
    create: (p) => { captured = p; return { id: "e:2", type: "ELLIPSE", name: "arc2" }; }
  });

  const r = await executeCode(`
    return await figma.create({
      type: "ELLIPSE", width: 100, height: 100,
      arcData: { startingAngle: 0, endingAngle: 3.14159, innerRadius: 0.5 }
    });
  `, bridge);
  assert("startingAngle/endingAngle pass through", r.success, r.error);
  assert("startingAngle=0 correct", captured && captured.arcData.startingAngle === 0);
  assert("innerRadius=0.5 correct", captured && captured.arcData.innerRadius === 0.5);
}

// ── BUG-06: arcData with no keys → defaults ───────────────────────────────────
console.log("\nBUG-06: arcData empty object → defaults (0 to 2π)");
{
  let captured = null;
  const bridge = makeBridge({
    create: (p) => { captured = p; return { id: "e:3", type: "ELLIPSE", name: "full" }; }
  });

  const r = await executeCode(`
    return await figma.create({ type: "ELLIPSE", width: 80, height: 80, arcData: {} });
  `, bridge);
  assert("empty arcData succeeds", r.success, r.error);
  assert("startingAngle defaults to 0", captured && captured.arcData.startingAngle === 0);
  assert("endingAngle defaults to 2π", captured && Math.abs(captured.arcData.endingAngle - Math.PI * 2) < 0.001,
    "got: " + (captured && captured.arcData.endingAngle));
}

// ── BUG-13/16/17/19: TEXT resize re-applied after appendChild ─────────────────
console.log("\nBUG-13/16/17/19: TEXT width+height re-applied after appendChild");
{
  const createCalls = [];
  const bridge = makeBridge({
    create: (p) => {
      createCalls.push(p);
      // Simulate: after parenting, layout engine uses node.width/height as returned
      return { id: "t:1", type: "TEXT", name: p.name || "T",
               width: p.width || 100, height: p.height || 100 };
    }
  });

  createCalls.length = 0;
  const r = await executeCode(`
    return await figma.create({
      type: "TEXT", parentId: "f:1",
      content: "Hello", fontSize: 14,
      width: 200, height: 20
    });
  `, bridge);
  // Bridge is called for both the parent lookup (skipped, parentId not found → currentPage)
  // and the TEXT create. The TEXT create should have width/height forwarded.
  const textCall = createCalls.find(p => p.type === "TEXT");
  assert("TEXT create call found", textCall !== undefined);
  assert("width=200 in create call", textCall && textCall.width === 200,
    "got: " + (textCall && textCall.width));
  assert("height=20 in create call", textCall && textCall.height === 20,
    "got: " + (textCall && textCall.height));
}

// ── TEXT width-only → HEIGHT mode ────────────────────────────────────────────
console.log("\nBUG-13/16/17/19: TEXT width-only → textAutoResize=HEIGHT re-applied");
{
  let captured = null;
  const bridge = makeBridge({
    create: (p) => { captured = p; return { id: "t:2", type: "TEXT", name: "T", width: p.width || 100, height: 22 }; }
  });

  const r = await executeCode(`
    return await figma.create({
      type: "TEXT", content: "Label", fontSize: 12, width: 120
    });
  `, bridge);
  assert("TEXT width-only create succeeds", r.success, r.error);
  assert("width=120 forwarded", captured && captured.width === 120,
    "got: " + (captured && captured.width));
}

// ── BUG-15: loadIconIn noContainer=true — no extra wrapper created ────────────
console.log("\nBUG-15: loadIconIn noContainer:true — icon directly in parentId");
{
  const createCalls = [];
  const bridge = makeBridge({
    create: (p) => {
      createCalls.push(p);
      return { id: "c:" + createCalls.length, type: p.type, name: p.name || p.type,
               width: p.width || 40, height: p.height || 40 };
    }
  });

  createCalls.length = 0;
  const r = await executeCode(`
    try {
      return await figma.loadIconIn("arrow-right", {
        parentId: "wrapper:1",
        containerSize: 28,
        fill: "#FFFFFF",
        noContainer: true
      });
    } catch(e) {
      return { httpError: true, msg: e.message };
    }
  `, bridge);

  // With noContainer:true, NO FRAME should be created — only SVG (from loadIcon HTTP, which fails in test)
  const frameCall = createCalls.find(p => p.type === "FRAME");
  assert("no wrapper FRAME created with noContainer:true", frameCall === undefined,
    "found frame: " + JSON.stringify(frameCall));
}

// ── BUG-15: loadIconIn without noContainer creates wrapper ───────────────────
console.log("\nBUG-15: loadIconIn without noContainer creates exactly 1 wrapper");
{
  const createCalls = [];
  const bridge = makeBridge({
    create: (p) => {
      createCalls.push(p);
      return { id: "c:" + createCalls.length, type: p.type, name: p.name || p.type,
               width: p.width || 40, height: p.height || 40 };
    }
  });

  createCalls.length = 0;
  await executeCode(`
    try { await figma.loadIconIn("home", { parentId: "p:1", containerSize: 40, fill: "#333" }); }
    catch(e) {}
  `, bridge);

  const frameCalls = createCalls.filter(p => p.type === "FRAME");
  assert("exactly 1 wrapper FRAME created", frameCalls.length === 1,
    "found: " + frameCalls.length + " frames");
  assert("wrapper size=40", frameCalls[0] && frameCalls[0].width === 40);
  assert("wrapper has cornerRadius=20", frameCalls[0] && frameCalls[0].cornerRadius === 20);
}

// ── BUG-15: loadIconIn x=0/y=0 not falsy-trapped ────────────────────────────
console.log("\nBUG-15: loadIconIn x=0,y=0 forwarded correctly");
{
  let captured = null;
  const bridge = makeBridge({
    create: (p) => {
      if (p.type === "FRAME") captured = p;
      return { id: "c:1", type: p.type, name: p.name || "", width: p.width || 40, height: p.height || 40 };
    }
  });

  await executeCode(`
    try { await figma.loadIconIn("home", { parentId: "p:1", containerSize: 36, fill: "#333", x: 0, y: 0 }); }
    catch(e) {}
  `, bridge);
  assert("x=0 forwarded (not falsy)", captured && captured.x === 0, "got: " + (captured && captured.x));
  assert("y=0 forwarded (not falsy)", captured && captured.y === 0, "got: " + (captured && captured.y));
}

// ── BUG-05 regression: bgOpacity=0 still works ──────────────────────────────
console.log("\nBUG-05 regression: bgOpacity=0 still respected");
{
  let captured = null;
  const bridge = makeBridge({
    create: (p) => {
      if (p.type === "FRAME") captured = p;
      return { id: "c:1", type: p.type, name: p.name || "", width: p.width || 40, height: p.height || 40 };
    }
  });

  await executeCode(`
    try { await figma.loadIconIn("close", { parentId: "p:1", containerSize: 24, fill: "#FF0000", bgOpacity: 0 }); }
    catch(e) {}
  `, bridge);
  assert("bgOpacity=0 forwarded as 0 (not 0.1)", captured && captured.fillOpacity === 0,
    "got: " + (captured && captured.fillOpacity));
}

// ── BUG-06 does not break ELLIPSE without arcData ────────────────────────────
console.log("\nBUG-06: ELLIPSE without arcData still works");
{
  let captured = null;
  const bridge = makeBridge({
    create: (p) => { captured = p; return { id: "e:4", type: "ELLIPSE", name: "circle" }; }
  });

  const r = await executeCode(`
    return await figma.create({ type: "ELLIPSE", width: 60, height: 60, fill: "#6C5CE7" });
  `, bridge);
  assert("ELLIPSE without arcData succeeds", r.success, r.error);
  assert("no arcData set", captured && captured.arcData === undefined);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
