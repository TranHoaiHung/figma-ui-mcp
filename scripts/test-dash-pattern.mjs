#!/usr/bin/env node
// Dashed borders must survive a round trip. The write side has forwarded
// dashPattern since BUG-17; every read path has to report it, and a solid
// border must omit the field rather than send [].
// Run: node scripts/test-dash-pattern.mjs
import { loadPlugin } from "./lib/load-plugin.mjs";

let pass=0, fail=0;
const t=(l,c,g)=>{ if(c){console.log('PASS ',l);pass++;} else {console.log('FAIL ',l,'| got:',JSON.stringify(g));fail++;} };

const mkNode = (over={}) => Object.assign({
  id:'1:1', name:'box', type:'RECTANGLE', visible:true, x:0,y:0,width:100,height:50,
  strokes:[{type:'SOLID',visible:true,color:{r:0,g:0,b:0},opacity:1}],
  strokeWeight:2, strokeAlign:'INSIDE', fills:[], effects:[], opacity:1, blendMode:'NORMAL',
}, over);

const sb = loadPlugin({
  figma:{ mixed:Symbol('m'), currentPage:{id:'p',name:'P',selection:[],children:[]}, root:{id:'r',children:[]},
    getNodeByIdAsync: async(id)=> sb.__nodes[id] || null,
    variables:{ getLocalVariablesAsync:async()=>[], getLocalVariableCollectionsAsync:async()=>[] } },
});
sb.__nodes = {};

async function detailOf(node){
  sb.__nodes[node.id]=node;
  return await sb.handlers.get_node_detail({ id:node.id });
}

// 1. Dashed border -> dashPattern reported
const dashed = await detailOf(mkNode({ id:'1:1', dashPattern:[6,4] }));
t('dashed: dashPattern present', JSON.stringify(dashed.dashPattern)==='[6,4]', dashed.dashPattern);

// 2. Solid border -> field omitted entirely, not []
const solid = await detailOf(mkNode({ id:'1:2', dashPattern:[] }));
t('solid: dashPattern omitted (not [])', !('dashPattern' in solid), solid.dashPattern);

// 3. No dashPattern property at all -> omitted, no crash
const none = await detailOf(mkNode({ id:'1:3' }));
t('missing prop: omitted, no throw', !('dashPattern' in none), none.dashPattern);

// 4. get_css emits dashed + the numbers
sb.__nodes['1:4'] = mkNode({ id:'1:4', dashPattern:[6,4] });
const cssD = await sb.handlers.get_css({ id:'1:4' });
t('css: says dashed', /border: 2px dashed/.test(cssD.css), cssD.css);
t('css: carries the numbers', /figma dashPattern: 6, 4/.test(cssD.css), cssD.css);

// 5. get_css still says solid for a solid border
sb.__nodes['1:5'] = mkNode({ id:'1:5' });
const cssS = await sb.handlers.get_css({ id:'1:5' });
t('css: solid unchanged', /border: 2px solid/.test(cssS.css) && !/dashPattern/.test(cssS.css), cssS.css);

// 6. The array is copied, not aliased to Figma's live object
const live = [6,4];
const copied = await detailOf(mkNode({ id:'1:6', dashPattern:live }));
live.push(99);
t('array copied, not aliased', JSON.stringify(copied.dashPattern)==='[6,4]', copied.dashPattern);


// 7. extract-design-tree (get_design / scan_design) — the path PR #17 missed
const treeDashed = sb.extractDesignTree(mkNode({ id:'1:7', dashPattern:[8,3] }), 0, 3, 'full', true);
t('get_design: dashPattern present', JSON.stringify(treeDashed.dashPattern)==='[8,3]', treeDashed.dashPattern);
const treeSolid = sb.extractDesignTree(mkNode({ id:'1:8', dashPattern:[] }), 0, 3, 'full', true);
t('get_design: solid omits it', !('dashPattern' in treeSolid), treeSolid.dashPattern);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
