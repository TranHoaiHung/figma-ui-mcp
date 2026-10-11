import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The commit the v2.5.27 refactor started from. extractDesignTree was rewritten
// to handle figma.mixed, so this pins the output shape against that baseline:
// a refactor may add fields, never silently drop one a consumer reads.
const BASELINE = process.env.PARITY_BASELINE || '0ee03b7';
const strip = s => s.replace(/figma\.showUI[\s\S]*$/, '');
const MIXED = Symbol('figma.mixed');
const mkFigma = () => ({ mixed: MIXED, currentPage:{id:'p',name:'P',selection:[],children:[]}, root:{id:'r',name:'D',children:[]},
  loadFontAsync: async()=>{}, getNodeByIdAsync: async()=>null,
  variables:{getLocalVariablesAsync:async()=>[],getLocalVariableCollectionsAsync:async()=>[]} });
function run(src){ const sb={handlers:{},console,figma:mkFigma(),__html__:''}; vm.createContext(sb); vm.runInContext(src,sb,{filename:'p.js'}); return sb; }
const oldSb = run(strip(execSync(`git show ${BASELINE}:plugin/code.js`,{cwd:REPO,encoding:'utf8',maxBuffer:50e6})));
const newSb = run(strip(readFileSync(REPO+'/plugin/code.js','utf8')));

const base = { visible:true, x:0,y:0,width:100,height:50, opacity:1, blendMode:'NORMAL', strokes:[], effects:[] };
const cases = {
  'FRAME auto-layout': { ...base, id:'2:1', name:'Card', type:'FRAME',
    fills:[{type:'SOLID',visible:true,color:{r:1,g:1,b:1},opacity:1}],
    layoutMode:'VERTICAL', primaryAxisAlignItems:'MIN', counterAxisAlignItems:'MIN',
    itemSpacing:8, paddingTop:16,paddingBottom:16,paddingLeft:16,paddingRight:16,
    cornerRadius:12, clipsContent:true, children:[] },
  'RECTANGLE gradient': { ...base, id:'2:2', name:'Bg', type:'RECTANGLE',
    fills:[{type:'GRADIENT_LINEAR',visible:true,gradientStops:[{color:{r:1,g:0,b:0,a:1},position:0},{color:{r:0,g:0,b:1,a:1},position:1}],gradientTransform:[[1,0,0],[0,1,0]]}],
    cornerRadius:8 },
  'INSTANCE': { ...base, id:'2:3', name:'Btn', type:'INSTANCE',
    fills:[], mainComponent:{id:'C:1',name:'btn/primary'}, children:[] },
  'TEXT mixed fontSize (the bug)': { ...base, id:'2:4', name:'Mixed', type:'TEXT',
    characters:'Hi', fontName:MIXED, fontSize:MIXED,
    lineHeight:MIXED, letterSpacing:MIXED, textAlignHorizontal:'CENTER', textAlignVertical:'TOP',
    fills:[{type:'SOLID',visible:true,color:{r:0,g:0,b:0},opacity:1}],
    getStyledTextSegments:()=>[{fontName:{family:'Poppins',style:'Bold'},fontSize:14,characters:'Hi',start:0,end:2,fills:[{color:{r:0,g:0,b:0}}]}] },
};

let regressions = 0;
for (const [label,node] of Object.entries(cases)) {
  let a,b,ea=null,eb=null;
  try { a = oldSb.extractDesignTree(node,0,5,'full',true); } catch(e){ ea=e.constructor.name+': '+e.message; }
  try { b = newSb.extractDesignTree(node,0,5,'full',true); } catch(e){ eb=e.constructor.name+': '+e.message; }
  console.log(`\n[${label}]`);
  if (ea||eb) { console.log('  trước:', ea||'ok', '| sau:', eb||'ok'); if(!ea&&eb){console.log('  *** REGRESSION: mới throw mà cũ không ***');regressions++;} if(ea&&!eb)console.log('  >>> cũ throw, mới ok = ĐÃ SỬA'); }
  if (!a||!b) continue;
  const ka=Object.keys(a).sort(), kb=Object.keys(b).sort();
  const lost=ka.filter(k=>!kb.includes(k)), added=kb.filter(k=>!ka.includes(k));
  const changed=ka.filter(k=>kb.includes(k)&&JSON.stringify(a[k])!==JSON.stringify(b[k]));
  console.log('  MẤT:', lost.length?lost.join(', '):'none', '| THÊM:', added.length?added.join(', '):'none');
  if (changed.length) console.log('  ĐỔI:', changed.map(k=>`${k}: ${JSON.stringify(a[k])} -> ${JSON.stringify(b[k])}`).join(' | '));
  // lineHeight/letterSpacing on a mixed node held `undefined` in the baseline,
  // so they never survived JSON serialisation — dropping them is not a loss.
  const realLoss = lost.filter(k => JSON.stringify(a[k]) !== undefined);
  if (realLoss.length) { console.log('  *** MẤT THẬT:', realLoss.join(', ')); regressions++; }
}
if (regressions) {
  console.error(`\n${regressions} regression(s): a field present in ${BASELINE} is gone`);
  process.exit(1);
}
console.log('\nparity OK — no field lost versus ' + BASELINE);
