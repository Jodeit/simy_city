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

/* ---- Census geocoder / ACS parsing helpers ---- */
// Parse the Census Bureau geocoder's "coordinates" response into the tract's
// FIPS codes, or null if the point falls outside mapped Census geography.
function parseCensusTract(json){
  const tracts=json&&json.result&&json.result.geographies&&json.result.geographies["Census Tracts"];
  const t=tracts&&tracts[0];
  if(!t)return null;
  return {state:t.STATE,county:t.COUNTY,tract:t.TRACT,name:t.NAME};
}
// Parse an ACS 5-yr detailed-table response (array-of-arrays, header row
// first) into named fields. The Census encodes "not available"/"not
// computed" as large negative sentinels (e.g. -666666666) rather than
// omitting the field, so treat any negative value as missing.
function parseCensusACS(rows){
  if(!Array.isArray(rows)||rows.length<2)return null;
  const header=rows[0], data=rows[1];
  const val=name=>{
    const i=header.indexOf(name);
    if(i<0)return null;
    const v=parseFloat(data[i]);
    return (isFinite(v)&&v>=0)?v:null;
  };
  return {population:val("B01003_001E"),medianIncome:val("B19013_001E"),
    households:val("B11001_001E"),medianAge:val("B01002_001E")};
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
  module.exports={SEVERITY,AMENITY_USES,COST,evaluate,isContested,findStandoffs,cheapest,countOf,haversine,inBbox,pick,blendedDemand,parseCensusTract,parseCensusACS};
}
