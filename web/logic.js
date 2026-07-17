// Pure model-logic functions shared by web/explore.html (loaded as a plain
// <script>, so these become ordinary global bindings — no build step) and by
// the Node test suite in tests/js/ (loaded via require()). Kept dependency-free
// (no DOM, no Leaflet, no fetch) so it can run in either place unmodified.
//
// Ports of simy_city/perspectives.py and simy_city/standoffs.py, plus the
// small parsing helpers used by the live demand read and parcel lookup.

const SEVERITY={low:1,medium:2,high:3,none:0};
const AMENITY_USES=new Set(["warehouse_club","fast_casual"]);
const COST={low:0,medium:1,high:2};

/* ---- perspectives (port of simy_city/perspectives.py) ---- */
function evaluate(model,use,currentKey){
  const impacts=use.impacts||{}, induced=use.induces||{};
  return Object.entries(model.stakeholders).map(([sid,cfg])=>{
    let score=0; const reasons=[];
    if(cfg.pro_build){score+=2;reasons.push("wants development to happen");}
    (cfg.opposes_impacts||[]).forEach(d=>{const s=SEVERITY[(impacts[d]||"none")]||0;if(s){score-=s;reasons.push(`${d}=${impacts[d]}`);}});
    if((cfg.opposes_structure||[]).includes("induces")){const n=Object.keys(induced).length;if(n){score-=n;reasons.push(`${n} induced service(s) to fund`);}}
    if(cfg.amenity_seeker && AMENITY_USES.has(currentKey)){score+=2;reasons.push("adds a local amenity");}
    const leaning=score>1?"favorable":score<=-4?"opposed":"mixed";
    return {stakeholder:sid,label:cfg.label,leaning,reasons:reasons.length?reasons:["no strongly weighted factors"]};
  });
}
function isContested(views){const s=new Set(views.map(v=>v.leaning));return s.has("favorable")&&s.has("opposed");}

/* ---- standoffs (port of simy_city/standoffs.py) ---- */
function findStandoffs(model,present){
  present=present||new Set();
  const adj={};
  model.enabling_edges.forEach(e=>{if(present.has(e.from)||present.has(e.to))return;(adj[e.from]=adj[e.from]||[]).push(e);});
  const out=[], seen=new Set();
  function dfs(start,node,pn,pe){
    (adj[node]||[]).forEach(e=>{
      if(e.to===start&&pe.length>=1){const key=[...pn].sort().join("|");if(!seen.has(key)){seen.add(key);out.push({cycle:[...pn,start],edges:[...pe,e]});}return;}
      if(pn.includes(e.to))return;
      dfs(start,e.to,[...pn,e.to],[...pe,e]);
    });
  }
  Object.keys(adj).forEach(u=>dfs(u,u,[u],[]));
  return out;
}
function cheapest(edges){return edges.reduce((a,b)=>COST[(b.breaker_cost||"high")]<COST[(a.breaker_cost||"high")]?b:a);}

/* ---- live-read parsing helpers ---- */
function countOf(d){ // parse Overpass `out count`
  const c=(d.elements||[]).find(e=>e.type==="count");
  if(c&&c.tags)return parseInt(c.tags.total||c.tags.ways||c.tags.nodes||"0",10);
  return (d.elements||[]).length||null;
}
// Blend a rooftop (household) count with a daytime-population proxy (nearby
// offices/shops/workplaces) into one "effective demand" figure, compared
// against the same roofNeed threshold a pure-rooftop read would use. Lunch
// traffic for a fast-casual chain comes from workers and shoppers, not just
// nearby homes, so a daytime-only area (e.g. an office park) can still clear
// the bar even with few rooftops in range. `weight` is the rooftop-equivalent
// value of one daytime POI (office/shop/craft node) — a documented heuristic,
// same as roofNeed itself. Returns null (no verdict) until roofs is known.
function blendedDemand(roofs,daytime,weight,need){
  if(roofs==null)return null;
  const dt=daytime==null?0:daytime;
  const effective=roofs+weight*dt;
  const ratio=effective/need;
  return {effective,ratio,pass:ratio>=0.85};
}
function haversine(la1,lo1,la2,lo2){const R=6371,d=x=>x*Math.PI/180;
  const a=Math.sin(d(la2-la1)/2)**2+Math.cos(d(la1))*Math.cos(d(la2))*Math.sin(d(lo2-lo1)/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}

/* ---- Census tract demographics (FCC block lookup → ACS 5-yr point read) ---- */
// FCC's keyless block API turns lat/lng into a 15-digit block FIPS
// (state[2]+county[3]+tract[6]+block[4]); the first 11 digits are what the
// Census ACS API needs to fetch that tract's row.
function parseFccBlockFips(json){
  const r=json&&json.results&&json.results[0];
  const block=r&&r.block_fips!=null?String(r.block_fips):null;
  if(!block||block.length<11)return null;
  return {state:block.slice(0,2),county:block.slice(2,5),tract:block.slice(5,11)};
}
// Census ACS API returns [headers[], row[]] for a single-tract query. Values
// use large-negative sentinels (e.g. -666666666) for suppressed/unavailable
// estimates, which we treat the same as missing.
function parseAcsTractRow(json){
  if(!Array.isArray(json)||json.length<2)return null;
  const header=json[0],row=json[1];
  const num=key=>{const i=header.indexOf(key);if(i<0)return null;const v=parseFloat(row[i]);return (isFinite(v)&&v>-1e8)?v:null;};
  return {households:num("B11001_001E"),medianIncome:num("B19013_001E"),medianAge:num("B01002_001E")};
}

/* ---- session-lifetime response cache ----
   Wraps a key + promise-factory: the same key returns the same in-flight/
   settled promise instead of re-issuing the request, so re-clicking a parcel
   (or a Compare pin re-navigating the map back to one) reuses the Overpass/
   ArcGIS/Census answers already fetched this session instead of re-hitting
   those services. A rejected fetch evicts its key so a transient network
   blip doesn't get cached as a permanent failure. Capped (oldest-first
   eviction) so a long map-browsing session can't grow this unboundedly. */
function makeSessionCache(maxEntries){
  const store=new Map();
  return function cached(key,run){
    if(store.has(key))return store.get(key);
    const p=Promise.resolve().then(run).catch(e=>{store.delete(key);throw e;});
    store.set(key,p);
    if(store.size>maxEntries)store.delete(store.keys().next().value);
    return p;
  };
}

/* ---- "make the case" image export ----
   Word-wraps `text` (which may already contain newlines — blank lines are
   preserved as section breaks) into lines no wider than `maxWidth`, per the
   caller-supplied `measure(candidateLine)` function. Kept measure-agnostic
   so the same wrapping logic drives a real canvas 2D context in the browser
   (measure by pixel width via ctx.measureText) and a plain character-count
   stand-in in tests (no canvas in Node). */
function wrapText(text,maxWidth,measure){
  const out=[];
  String(text).split("\n").forEach(rawLine=>{
    if(rawLine===""){out.push("");return;}
    const words=rawLine.split(" ");
    let line="";
    words.forEach(w=>{
      const candidate=line?line+" "+w:w;
      if(line&&measure(candidate)>maxWidth){out.push(line);line=w;}
      else line=candidate;
    });
    if(line)out.push(line);
  });
  return out;
}

/* ---- parcel lookup helpers ---- */
function inBbox(ll,b){return ll.lng>=b[0]&&ll.lat>=b[1]&&ll.lng<=b[2]&&ll.lat<=b[3];}
function pick(a,keys){
  if(!a)return null;
  for(const k of keys){if(a[k]!==undefined&&a[k]!==null&&a[k]!=="")return a[k];}
  const low={};for(const k in a)low[k.toLowerCase()]=a[k];
  for(const k of keys){const v=low[k.toLowerCase()];if(v!==undefined&&v!==null&&v!=="")return v;}
  return null;
}

// Node (CommonJS, no bundler) picks this up for tests; browsers ignore it
// since `module` isn't defined in a plain <script>.
if(typeof module!=="undefined" && module.exports){
  module.exports={SEVERITY,AMENITY_USES,COST,evaluate,isContested,findStandoffs,cheapest,countOf,haversine,inBbox,pick,blendedDemand,parseFccBlockFips,parseAcsTractRow,makeSessionCache,wrapText};
}
