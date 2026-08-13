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
// senior_living's demand read: every other use above reads demand as a
// headcount (rooftops, or blendedDemand's rooftop-equivalent units) compared
// against a threshold. Senior living instead reads demand as whether the
// surrounding population *skews older* — the trade-area median age
// (aggregateAcsTracts' weighted average) compared against a threshold, same
// "ratio ≥ 0.85 of need" pass bar blendedDemand uses. Returns null (no
// verdict yet) until medianAge is known, same "still waiting on a leg"
// contract as blendedDemand.
function seniorDemandRead(medianAge,ageThreshold){
  if(medianAge==null)return null;
  const ratio=medianAge/ageThreshold;
  return {medianAge,ageThreshold,ratio,pass:ratio>=0.85};
}

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

/* ---- multi-tract Census ACS trade area ----
   The single-tract read above is due-diligence context for the clicked point,
   not a demographic read at the same multi-km scale as the fast_casual/
   warehouse_club rooftop trade-area radius (a census tract is much smaller).
   Since the FCC/Census block APIs are point lookups only (no bbox/radius
   query), approximate trade-area coverage by sampling points around the
   center — a documented proxy, same spirit as the rooftop-count radius
   itself — then dedupe to unique tracts and weight-average their ACS rows. */
// Center + 8 compass-bearing points at 60% of the trade-area radius: enough
// spatial spread to usually land in several different tracts without
// exploding into dozens of FCC/ACS requests per click.
function sampleTradeAreaPoints(lat,lng,radiusKm){
  const R=6371, d=(radiusKm*0.6)/R;
  const la1=lat*Math.PI/180, lo1=lng*Math.PI/180;
  const pts=[{lat,lng}];
  [0,45,90,135,180,225,270,315].forEach(bearingDeg=>{
    const brng=bearingDeg*Math.PI/180;
    const la2=Math.asin(Math.sin(la1)*Math.cos(d)+Math.cos(la1)*Math.sin(d)*Math.cos(brng));
    const lo2=lo1+Math.atan2(Math.sin(brng)*Math.sin(d)*Math.cos(la1),Math.cos(d)-Math.sin(la1)*Math.sin(la2));
    pts.push({lat:la2*180/Math.PI, lng:((lo2*180/Math.PI+540)%360)-180});
  });
  return pts;
}
// Collapses a list of per-point FCC lookups (some possibly null, on nulls/
// dupes-because-the-same-tract-covers-multiple-sample-points) down to each
// unique state+county+tract, first-occurrence order.
function dedupeTracts(fipsList){
  const seen=new Set(), out=[];
  (fipsList||[]).forEach(f=>{
    if(!f)return;
    const key=`${f.state}|${f.county}|${f.tract}`;
    if(seen.has(key))return;
    seen.add(key); out.push(f);
  });
  return out;
}
// Combines each sampled tract's ACS row into one trade-area figure: households
// sum (the trade-area's actual household count), and a household-weighted
// average for income/age (so a large-but-sparse tract doesn't skew the
// average as much as a dense one). Tracts missing households are excluded
// entirely (no reliable weight); null if none of the sampled tracts resolved.
function aggregateAcsTracts(rows){
  const valid=(rows||[]).filter(r=>r&&r.households!=null);
  if(!valid.length)return null;
  const totalHouseholds=valid.reduce((s,r)=>s+r.households,0);
  const wavg=key=>{
    const w=valid.filter(r=>r[key]!=null);
    const totW=w.reduce((s,r)=>s+r.households,0);
    return (w.length&&totW)?w.reduce((s,r)=>s+r[key]*r.households,0)/totW:null;
  };
  return {tracts:valid.length,totalHouseholds,medianIncome:wavg("medianIncome"),medianAge:wavg("medianAge")};
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

/* ---- traffic-count (AADT) helpers ----
   `requires.transportation.near_highway_aadt`/`near_arterial_aadt` in
   layers.yaml were descriptive-only until now: wired to AADT_SOURCE in
   web/explore.html, BTS/FHWA's National Highway System ArcGIS FeatureServer
   (a genuine national keyless source, unlike PARCEL_SOURCES — no per-county
   fan-out needed here). Its `AADT` field name is independently documented,
   but the exact geometryType isn't (point stations vs. line segments are
   both common for this kind of layer, and this sandbox can't reach the host
   to confirm) — parseAadtFeatures below handles both shapes, and still
   leans on pick()'s broad candidate-list/case-insensitive matching as a
   fallback in case the live field name differs, same graceful-degradation
   posture every PARCEL_SOURCES field already has: an unmatched field just
   drops that feature rather than throwing. */
// Parses an ArcGIS REST `/query` response for a road layer carrying AADT
// counts into {lat,lng,aadt,route} entries — one representative point per
// feature (the point itself, or a polyline's first vertex) — dropping any
// feature missing a usable AADT number or coordinate.
function parseAadtFeatures(json){
  if(!json||!Array.isArray(json.features))return [];
  return json.features.map(f=>{
    const a=(f&&f.attributes)||{}, g=(f&&f.geometry)||{};
    const raw=pick(a,["AADT","AADT_RPT","CURRENT_AADT","AADT_CUR","AADT_CURRNT","CUR_AADT","TX_AADT_RO","TRAF_AADT","ADT_CUR"]);
    const aadt=raw==null?NaN:Number(raw);
    const route=pick(a,["ROUTE_NAME","RTE_NM","HWY_NM","ROUTE","RTE","FED_RTE","RTE_ID","SIGN1"]);
    let lat=g.y, lng=g.x;
    if((typeof lat!=="number"||typeof lng!=="number")&&Array.isArray(g.paths)&&Array.isArray(g.paths[0])&&Array.isArray(g.paths[0][0])){
      lng=g.paths[0][0][0]; lat=g.paths[0][0][1]; // polyline: use the segment's first vertex
    }
    if(!isFinite(aadt)||aadt<0||typeof lat!=="number"||typeof lng!=="number")return null;
    return {lat,lng,aadt,route:route!=null?String(route):null};
  }).filter(Boolean);
}
// Finds the *busiest* AADT station within radiusM of center (a high-volume
// highway a km away matters more for a siting gate than a literal-nearest
// quiet side street), or null if none fall in range / there are no points.
function maxAadtWithinRadius(points,center,radiusM){
  if(!Array.isArray(points)||!center||typeof center.lat!=="number"||typeof center.lng!=="number")return null;
  let best=null;
  for(const p of points){
    if(!p||typeof p.lat!=="number"||typeof p.lng!=="number"||typeof p.aadt!=="number")continue;
    const km=haversine(center.lat,center.lng,p.lat,p.lng);
    if(km*1000<=radiusM && (!best||p.aadt>best.aadt))best={aadt:p.aadt,km,route:p.route||null};
  }
  return best;
}

/* ---- click debounce ----
   Wraps `fn` so a burst of rapid calls (e.g. a fast double-click on the map)
   only invokes `fn` once, `wait` ms after the *last* call in the burst —
   trailing-edge only. This is deliberate: firing on the leading edge too
   would still kick off a full network fan-out (Overpass/ArcGIS/USGS/Census)
   for the click that's about to be superseded, which is exactly the waste
   this exists to avoid. Returns the debounced function; call `.cancel()` to
   drop a pending call outright (e.g. on teardown). */
function debounce(fn,wait){
  let timer=null;
  function debounced(...args){
    if(timer!==null)clearTimeout(timer);
    timer=setTimeout(()=>{timer=null;fn.apply(null,args);},wait);
  }
  debounced.cancel=()=>{if(timer!==null){clearTimeout(timer);timer=null;}};
  return debounced;
}

/* ---- shareable permalink (URL hash) encode/decode ----
   Pure encode/decode so a "make the case" link can carry the clicked point
   (and, in Test-a-use mode, the selected use) in the URL hash: written on
   click via history.replaceState, read back on load to re-run analyze()
   against the same point. `encodeHash` always rounds lat/lng to 5 decimals
   (~1m precision — plenty for a parcel-level link, keeps the hash short).
   `decodeHash` returns null for an absent/empty hash, and null for mode/use/
   lat/lng fields that are missing or don't parse, so the caller can apply
   only what's actually present instead of clobbering current state. */
function encodeHash(mode,use,lat,lng){
  const u=mode==="build"?`&use=${encodeURIComponent(use)}`:"";
  return `mode=${mode}${u}&lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}`;
}
function decodeHash(hash){
  const h=String(hash||"").replace(/^#/,"");
  if(!h)return null;
  const q={};
  h.split("&").forEach(kv=>{
    const i=kv.indexOf("=");if(i<0)return;
    q[kv.slice(0,i)]=decodeURIComponent(kv.slice(i+1));
  });
  const lat=parseFloat(q.lat), lng=parseFloat(q.lng);
  return {
    mode:(q.mode==="build"||q.mode==="explore")?q.mode:null,
    use:q.use||null,
    lat:isFinite(lat)?lat:null,
    lng:isFinite(lng)?lng:null,
  };
}

/* ---- shareable Compare list (URL hash) encode/decode ----
   Same shape of problem as encodeHash/decodeHash above, for the pinned-
   parcels Compare list (explore.html's `pins`, capped at 6): a visitor
   should be able to copy one link that hands someone else the same set of
   pinned sites, without a server or account. `encodeComparePins` packs only
   the fields renderCompare() actually displays (not raw parcel attrs like
   `id`/`situs`) as JSON, URI-encoded, into a standalone `cmp=` hash segment
   — deliberately NOT combined with encodeHash's mode/use/lat/lng, since the
   Compare list and the single clicked point are independent things to
   share. `decodeComparePins` returns null if there's no `cmp` segment or it
   doesn't parse to an array, otherwise up to 6 sanitized pin objects (rows
   missing lat/lng dropped outright — everything else defaults to null
   rather than passing through untrusted values verbatim). `mergeComparePins`
   folds decoded pins into an existing list non-destructively: it appends
   only pins not already pinned (same rounded-lat/lng dedupe addPin() uses)
   and caps the result at 6, so loading a shared link never clobbers pins a
   visitor already had of their own. */
function encodeComparePins(pins){
  if(!pins||!pins.length)return "";
  const compact=pins.slice(0,6).map(p=>({
    lat:+(+p.lat).toFixed(5), lng:+(+p.lng).toFixed(5),
    label:p.label||null, owner:p.owner||null,
    acres:(p.acres!=null&&isFinite(p.acres))?p.acres:null,
    value:(p.value!=null&&isFinite(p.value))?p.value:null,
    land:p.land||null, county:p.county||null,
    use:p.use||null, verdict:p.verdict||null,
  }));
  return "cmp="+encodeURIComponent(JSON.stringify(compact));
}
function decodeComparePins(hash){
  const h=String(hash||"").replace(/^#/,"");
  if(!h)return null;
  let raw=null;
  h.split("&").forEach(kv=>{
    const i=kv.indexOf("=");if(i<0)return;
    if(kv.slice(0,i)==="cmp")raw=kv.slice(i+1);
  });
  if(raw==null)return null;
  let arr;
  try{arr=JSON.parse(decodeURIComponent(raw));}catch(e){return null;}
  if(!Array.isArray(arr))return null;
  return arr.filter(p=>p&&isFinite(p.lat)&&isFinite(p.lng)).slice(0,6).map(p=>({
    lat:+p.lat, lng:+p.lng,
    label:p.label||null, owner:p.owner||null,
    acres:(p.acres!=null&&isFinite(p.acres))?+p.acres:null,
    value:(p.value!=null&&isFinite(p.value))?+p.value:null,
    land:p.land||null, county:p.county||null,
    use:p.use||null, verdict:p.verdict||null,
  }));
}
function mergeComparePins(existing,incoming){
  const out=(existing||[]).slice();
  (incoming||[]).forEach(p=>{
    if(out.length>=6)return;
    const dup=out.some(o=>Math.abs(o.lat-p.lat)<1e-6&&Math.abs(o.lng-p.lng)<1e-6);
    if(!dup)out.push(p);
  });
  return out.slice(0,6);
}

/* ---- shareable reverse-search (URL hash) encode/decode ----
   Same shape of problem as encodeHash/encodeComparePins above, for the
   "🔍 Find candidate sites" area search (sampleGrid/rankCandidates, via
   runCandidateSearch()): the search center (map center at search time),
   radius, and use weren't part of any shareable link, so reopening a
   shared/pinned search always started from whatever the default map
   center/radius happened to be. `encodeSearchHash` packs all four into a
   single `search=` JSON blob (own hash segment, deliberately independent of
   encodeHash's mode/use/lat/lng — a search center isn't "the clicked
   point" and mixing them would make applyHash() ambiguous about which flow
   to run). `decodeSearchHash` returns null for an absent/malformed `search`
   segment, and null per-field for anything that doesn't parse — same
   "don't clobber with a trusted-verbatim bad value" contract as the other
   decoders — so the caller only re-runs a search when every field is
   actually usable. */
function encodeSearchHash(lat,lng,radiusM,use){
  const obj={lat:+(+lat).toFixed(5),lng:+(+lng).toFixed(5),radius:Math.round(radiusM),use:use||null};
  return "search="+encodeURIComponent(JSON.stringify(obj));
}
function decodeSearchHash(hash){
  const h=String(hash||"").replace(/^#/,"");
  if(!h)return null;
  let raw=null;
  h.split("&").forEach(kv=>{
    const i=kv.indexOf("=");if(i<0)return;
    if(kv.slice(0,i)==="search")raw=kv.slice(i+1);
  });
  if(raw==null)return null;
  let obj;
  try{obj=JSON.parse(decodeURIComponent(raw));}catch(e){return null;}
  if(!obj||typeof obj!=="object")return null;
  const lat=parseFloat(obj.lat), lng=parseFloat(obj.lng), radius=parseInt(obj.radius,10);
  return {
    lat:isFinite(lat)?lat:null,
    lng:isFinite(lng)?lng:null,
    radius:(isFinite(radius)&&radius>0)?radius:null,
    use:obj.use||null,
  };
}

/* ---- address search (Nominatim OSM geocoder) ----
   Free, keyless forward-geocoding so someone who only knows a street address
   (not a lat/lng) can jump straight to a site. `nominatimUrl` builds the
   request; `parseNominatimResult` reads the first hit out of the `[{lat,lon,
   display_name},...]` response shape, or null for a no-match/malformed
   response so the caller can show a clear "not found" state instead of
   hanging or throwing. Submit-only (no autocomplete-on-keystroke) is enforced
   by the caller, not here — see explore.html's wireAddrSearch.
   https://operations.osmfoundation.org/policies/nominatim/ */
function nominatimUrl(query){
  return "https://nominatim.openstreetmap.org/search?format=json&limit=1&q="+encodeURIComponent(query);
}
function parseNominatimResult(json){
  const hit=Array.isArray(json)?json[0]:null;
  if(!hit)return null;
  const lat=parseFloat(hit.lat), lng=parseFloat(hit.lon);
  if(!isFinite(lat)||!isFinite(lng))return null;
  return {lat,lng,label:hit.display_name||null};
}

/* People commonly paste a raw "lat, lng" pair straight from Google Maps or a
   GPS app into the address box — that's not something Nominatim needs to
   geocode, and shouldn't cost a network round-trip. Matches a plain
   "<number>, <number>" shape (optional leading "-", optional decimals, one
   comma, optional surrounding whitespace) and range-checks it; anything else
   — including an address that happens to contain a comma, e.g.
   "123 Main St, Austin, TX" — returns null so the caller falls through to
   the normal geocoder search. */
function parseCoordPair(q){
  if(typeof q!=="string")return null;
  const m=q.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if(!m)return null;
  const lat=parseFloat(m[1]), lng=parseFloat(m[2]);
  if(!isFinite(lat)||!isFinite(lng))return null;
  if(lat<-90||lat>90||lng<-180||lng>180)return null;
  return {lat,lng};
}

/* ---- CSV export for the Compare list ----
   `toCsvRow` quotes a single field per RFC 4180: wrapped in double quotes
   whenever it contains a comma, a double quote (itself doubled), or a
   newline — owner names and addresses routinely have commas ("Smith,
   John Trust"), so this can't just join with commas unguarded. `toCsv`
   joins rows with CRLF (the RFC-4180-conventional line ending, and what
   Excel expects). Null/undefined fields become an empty string, not the
   literal "null"/"undefined". */
function toCsvField(v){
  const s=v==null?"":String(v);
  return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}
function toCsvRow(fields){ return (fields||[]).map(toCsvField).join(","); }
function toCsv(rows){ return (rows||[]).map(toCsvRow).join("\r\n"); }

/* ---- recently-viewed sites (session history, local only) ----
   Distinct from the explicit "📌 Pin to compare" list: an automatic MRU
   (most-recently-used) trail of every point analyze() resolved, kept so a
   visitor can jump back to something they looked at a few clicks ago
   without re-finding it on the map. `addRecentSite` moves a re-visited point
   (same rounded lat/lng, same dedupe distance addPin()/mergeComparePins()
   use) to the front instead of adding a second entry, then caps the list —
   oldest entries fall off the end rather than growing unboundedly across a
   long browsing session. */
function addRecentSite(list,entry,cap){
  cap=cap||6;
  const out=(list||[]).filter(p=>!(Math.abs(p.lat-entry.lat)<1e-6&&Math.abs(p.lng-entry.lng)<1e-6));
  out.unshift(entry);
  return out.slice(0,cap);
}
// Removes a single entry by index (mirrors the Compare list's per-row "✕").
// Out-of-range indices (already-removed row, stale index from a race) no-op
// rather than throwing or mutating the list.
function removeRecentSite(list,i){
  if(!list||i<0||i>=list.length) return list||[];
  return list.slice(0,i).concat(list.slice(i+1));
}
// Pure pair backing the "clear all" undo affordance. clearRecentSites just
// returns the empty list a "clear" click should persist — the caller is the
// one who needs to hang onto the list it's replacing (there's nothing left
// to snapshot once this returns) if it wants an undo option. undoClear
// decides whether a snapshot is still restorable: `now`/`clearedAt` are
// passed in rather than read via Date.now() so this stays a pure, easily
// tested function (no clock to mock). An expired or empty snapshot returns
// null — the caller's job is to tell "nothing to restore" apart from "here's
// your list back", not to guess.
function clearRecentSites(list){
  return [];
}
function undoClear(saved,clearedAt,now,windowMs){
  windowMs=(windowMs==null)?8000:windowMs;
  if(!saved||!saved.length) return null;
  if(now-clearedAt>windowMs) return null;
  return saved;
}

/* ---- saved reverse searches (localStorage, local only) ----
   Mirrors addRecentSite/removeRecentSite's cap/shape, but a saved search's
   identity is its *config* (center + radius + use), not a single point —
   running the same search area/use again from the panel should refresh its
   `savedAt` and move it to the front, not pile up near-duplicate entries.
   Center is compared at the same ~0.1m rounding tolerance addRecentSite
   already uses for "same point"; radius and use must match exactly (a
   different radius or use is a genuinely different search). Entries are
   `{label, lat, lng, radiusM, use, savedAt}`. */
function addSavedSearch(list,entry,cap){
  cap=cap||8;
  const out=(list||[]).filter(s=>!(Math.abs(s.lat-entry.lat)<1e-6&&Math.abs(s.lng-entry.lng)<1e-6&&s.radiusM===entry.radiusM&&s.use===entry.use));
  out.unshift(entry);
  return out.slice(0,cap);
}
// Removes a single saved search by index (mirrors removeRecentSite). An
// out-of-range index no-ops rather than throwing or mutating the list.
function removeSavedSearch(list,i){
  if(!list||i<0||i>=list.length) return list||[];
  return list.slice(0,i).concat(list.slice(i+1));
}

/* ---- sorting the Compare-parcels list ----
   Compare's table is transposed (fields as rows, pins as columns), so
   "sortable columns" means reordering the underlying `pins` array — the
   render just re-draws with the new order. Numeric-aware: a pin missing the
   sort field (null/undefined, e.g. a county whose GIS layer doesn't expose
   appraised value) always sorts to the end, regardless of direction, rather
   than landing at the front on a "desc" sort (treating "unknown" as bigger
   than every real value would be misleading). */
function sortPins(pins,key,dir){
  const list=(pins||[]).slice();
  const sign=dir==="desc"?-1:1;
  list.sort((a,b)=>{
    const av=a?a[key]:null, bv=b?b[key]:null;
    const aMissing=av==null, bMissing=bv==null;
    if(aMissing&&bMissing) return 0;
    if(aMissing) return 1;
    if(bMissing) return -1;
    return (av-bv)*sign;
  });
  return list;
}

/* ---- reverse search, step 1: grid-scan/ranking engine ----
   Everything else in this app starts from a clicked point ("tell me about
   *this* parcel"). This flips it: "find me a few candidate sites in an
   area, ranked by how well they fit a use." Two pure, network-free
   primitives — the actual Overpass area-query wiring is a later step; this
   is just the scoring core, unit-testable in isolation.

   `sampleGrid` covers a disc around `center` with a square grid at
   `spacingM` spacing, keeping only points within `radiusM` of center — an
   even areal sample, not a fixed count. Local flat-earth offset math (fine
   at the city/neighborhood scale this is meant for) rather than proper
   geodesics, matching `sampleTradeAreaPoints`'s documented approximation
   above. Hard-capped at 150 points (a evenly-strided subsample, not a
   truncation, so a too-fine spacing/too-large radius combo still covers the
   whole disc, just more sparsely) so a search can never explode into
   hundreds of per-point Overpass/scoring calls. */
function sampleGrid(center,radiusM,spacingM){
  if(!center||!isFinite(center.lat)||!isFinite(center.lng))return [];
  const radius=(isFinite(radiusM)&&radiusM>0)?radiusM:0;
  if(radius===0)return [{lat:center.lat,lng:center.lng}];
  const spacing=(isFinite(spacingM)&&spacingM>0)?spacingM:100;
  const R=6371000;
  const metersPerDegLat=R*Math.PI/180;
  const metersPerDegLng=metersPerDegLat*Math.cos(center.lat*Math.PI/180)||1e-9;
  const steps=Math.max(1,Math.round(radius/spacing));
  const raw=[];
  for(let i=-steps;i<=steps;i++){
    for(let j=-steps;j<=steps;j++){
      const x=i*spacing,y=j*spacing;
      if(Math.sqrt(x*x+y*y)>radius)continue;
      raw.push({lat:center.lat+y/metersPerDegLat,lng:center.lng+x/metersPerDegLng});
    }
  }
  const CAP=150;
  if(raw.length<=CAP)return raw;
  const stride=Math.ceil(raw.length/CAP);
  return raw.filter((_,idx)=>idx%stride===0);
}
// Scores each candidate point by distance to the nearest `competitors` entry
// and a count of `demandPoints` within `opts.demandRadiusM` — two facts, four
// possible readings of them. `opts.preferFar`/`opts.preferNear` are the
// original food-truck-court pair (far from existing vendors, near
// residential); `opts.preferNearComp`/`opts.preferFarDemand` are their
// mirror images for uses where the `competitors` list is actually something
// to seek (a data center wants to be *near* a substation, not far from one)
// and `demandPoints` is something to avoid (a data center wants *fewer*
// rooftops nearby, not more). All four can combine independently on the same
// point — a point with no competitors at all still scores as maximally far
// under preferFar or maximally penalized under preferNearComp, never
// excluded. Non-mutating, returns the top `opts.limit` (default 6) points
// best-score-first — same "pure transform, new array out" style as
// `sortPins`/`cheapest`.
function rankCandidates(points,competitors,demandPoints,opts){
  opts=opts||{};
  const demandRadiusM=opts.demandRadiusM||0;
  const preferFar=!!opts.preferFar, preferNear=!!opts.preferNear;
  const preferNearComp=!!opts.preferNearComp, preferFarDemand=!!opts.preferFarDemand;
  const limit=opts.limit||6;
  const comp=competitors||[], demand=demandPoints||[];
  const NO_COMPETITOR_KM=1000; // sentinel: "no competitors nearby" reads as maximally far/worst-case, not excluded
  const scored=(points||[]).map(p=>{
    let nearestCompetitorKm=null;
    comp.forEach(c=>{
      const km=haversine(p.lat,p.lng,c.lat,c.lng);
      if(nearestCompetitorKm===null||km<nearestCompetitorKm)nearestCompetitorKm=km;
    });
    const demandCount=demand.reduce((n,d)=>haversine(p.lat,p.lng,d.lat,d.lng)*1000<=demandRadiusM?n+1:n,0);
    let score=0;
    if(preferFar)score+=nearestCompetitorKm===null?NO_COMPETITOR_KM:nearestCompetitorKm;
    if(preferNearComp)score-=nearestCompetitorKm===null?NO_COMPETITOR_KM:nearestCompetitorKm;
    if(preferNear)score+=demandCount;
    if(preferFarDemand)score-=demandCount;
    return {lat:p.lat,lng:p.lng,nearestCompetitorKm,demandCount,score};
  });
  scored.sort((a,b)=>b.score-a.score);
  return scored.slice(0,limit);
}

/* ---- reverse search, step 3 helpers: area-query parsing + per-use signals ----
   `parseOverpassPoints` turns an Overpass `out center` response into a plain
   {lat,lng} point list — nodes carry lat/lon directly, ways/relations (e.g.
   building footprints) carry a `center` object instead. Shared by both area
   queries a reverse search issues (rooftops, competitors), same element-shape
   handling `runDemand`'s single-point competitor scan already does inline. */
function parseOverpassPoints(json){
  return ((json&&json.elements)||[]).map(e=>{
    const lat=e.lat!=null?e.lat:(e.center&&e.center.lat);
    const lng=e.lon!=null?e.lon:(e.center&&e.center.lon);
    return (lat!=null&&lng!=null)?{lat,lng}:null;
  }).filter(Boolean);
}
// Decides which of rankCandidates' four scoring signals apply to a given land
// use, from its model.json `requires`/`demand_signals` blocks plus the use's
// own rooftop-need threshold (USE_DEMAND[id].roofNeed in explore.html —
// requires.demand's shape varies use-to-use, so roofNeed is passed in rather
// than re-parsed here). `preferFar` turns on for either shape layers.yaml
// uses for a "farther is better" competition read: an explicit
// `min_distance_km_from_nearest` (food_truck_court, ev_charging_hub) or a
// zero-tolerance `max_same_brand_in_trade_area` (warehouse_club — "don't
// build a second Costco inside another Costco's trade area" is exactly the
// same avoid-the-competitor shape, just phrased as a cap instead of a
// distance). `preferNear` turns on for any use with a rooftop-demand
// threshold (warehouse_club, fast_casual, food_truck_court, ev_charging_hub).
// fast_casual is `preferNear`-only on purpose, not an oversight — see the
// `competition`-block comment on `fast_casual` in data_sources/layers.yaml
// for why clustering near existing competitors doesn't get penalized there
// the way it does for the other three.
//
// data_center and residential_subdivision have neither of those (nobody
// judges a data center on rooftops, and residential's own `competition`
// block doesn't exist) — but the `competitors` list a reverse search already
// fetches for them (USE_DEMAND.compQ: power substations / schools) isn't
// meaningless, it's just something to seek instead of avoid. `preferNearComp`
// turns on for a use with `requires.power.prefer_substation_within_km`
// (data_center, and — were it not for ev_charging_hub already having its own
// `preferFar` competition read on that exact same substation-adjacent-siting
// shape — would read the same for it too, hence the `!preferFar` guard) or
// with `demand_signals.amenities.prefer_school_within_km`
// (residential_subdivision — an already-served neighborhood is a real signal
// of housing demand, the same "schools" list the school-capacity verdict
// already fetches). `preferFarDemand` mirrors `preferNear`: only the
// substation-siting proxy wants to avoid rooftop density (a data center
// wants edge/industrial land, not a residential encroachment fight) — the
// schools proxy doesn't, since nearby rooftops are the whole point of a
// subdivision, so it stays `preferNear`/`preferFarDemand`-neutral.
function reverseSearchSignals(requires,roofNeed,demandSignals){
  const comp=(requires&&requires.competition)||{};
  const preferFar=comp.min_distance_km_from_nearest!=null || comp.max_same_brand_in_trade_area!=null;
  const power=(requires&&requires.power)||{};
  const amenities=(demandSignals&&demandSignals.amenities)||{};
  const nearSubstation=!preferFar && power.prefer_substation_within_km!=null;
  const nearSchool=!preferFar && !nearSubstation && amenities.prefer_school_within_km!=null;
  return {
    preferFar,
    preferNear: !!roofNeed,
    preferNearComp: nearSubstation || nearSchool,
    preferFarDemand: nearSubstation,
  };
}
// Builds the same one-line "why" a candidate ranked where it did (e.g. "≈12
// rooftops within 1.2 km · nearest food vendor 1.6 km away") from a
// rankCandidates() result plus the reverseSearchSignals()/USE_DEMAND config
// that produced it — shared by the map-popup/list-row rendering (which HTML-
// escapes it) and the CSV export (which doesn't need to). The underlying
// facts read the same whether a signal means "seek" or "avoid" ("nearest
// power substation 2.1 km away" is true either way), so preferNearComp/
// preferFarDemand share their text with preferFar/preferNear rather than
// getting their own wording. A result with no signal on falls back to plain
// coordinates.
function candidateWhyText(r,sig,cfg){
  const parts=[];
  if(sig&&(sig.preferNear||sig.preferFarDemand))parts.push(`≈${r.demandCount} rooftop${r.demandCount===1?"":"s"} within ${(cfg.radius/1000)} km`);
  if(sig&&(sig.preferFar||sig.preferNearComp))parts.push(r.nearestCompetitorKm==null
    ? `no ${cfg.compLabel} in range`
    : `nearest ${cfg.compLabel.replace(/s$/,"")} ${r.nearestCompetitorKm.toFixed(1)} km away`);
  return parts.length?parts.join(" · "):`${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}`;
}
// Shapes a rankCandidates() result list into toCsv()-ready rows (header +
// one row per candidate: rank, lat/lng, score, and the same "why" text the
// search-results panel renders) — same "reuse the existing CSV plumbing"
// pattern the Compare-list CSV export already established.
function candidatesToCsvRows(results,sig,cfg){
  const rows=[["#","Lat","Lng","Score","Why"]];
  (results||[]).forEach((r,i)=>rows.push([i+1,r.lat,r.lng,r.score,candidateWhyText(r,sig,cfg)]));
  return rows;
}
/* ---- GeoJSON export for the Compare list and reverse-search candidates ----
   Both already export CSV + PDF (candidatesToCsvRows/buildCompareReportText
   above), but neither is machine-readable-and-mappable — a GIS user (a
   planner dropping candidates into QGIS, say) has to hand-convert the CSV's
   lat/lng columns today. Same field set the CSV export already surfaces,
   reshaped as a standard FeatureCollection of Point features. A pin/
   candidate missing valid numeric lat/lng is dropped rather than emitting a
   broken geometry — same defensive stance the CSV export takes with
   missing fields (empty string, never "null"/"undefined"/NaN). */
function pinsToGeoJson(pins){
  const features=(pins||[]).filter(p=>p&&typeof p.lat==="number"&&typeof p.lng==="number").map(p=>({
    type:"Feature",
    geometry:{type:"Point",coordinates:[p.lng,p.lat]},
    properties:{
      site:p.label||`${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`,
      owner:p.owner!=null?p.owner:null,
      acres:p.acres!=null?p.acres:null,
      value:p.value!=null?p.value:null,
      land_use:p.land!=null?p.land:null,
      county:p.county!=null?p.county:null,
      use:p.use!=null?p.use:null,
      verdict:p.verdict!=null?p.verdict:null,
    },
  }));
  return {type:"FeatureCollection",features};
}
// Rank is computed from each candidate's position in the *original* results
// array (matching the numbering candidatesToCsvRows/the map markers/list
// rows use), not the post-filter index — so a dropped mid-list entry
// doesn't shift every later candidate's rank in the exported file.
function candidatesToGeoJson(results,sig,cfg){
  const features=(results||[])
    .map((r,i)=>({r,rank:i+1}))
    .filter(x=>x.r&&typeof x.r.lat==="number"&&typeof x.r.lng==="number")
    .map(x=>({
      type:"Feature",
      geometry:{type:"Point",coordinates:[x.r.lng,x.r.lat]},
      properties:{rank:x.rank,score:x.r.score,why:candidateWhyText(x.r,sig,cfg)},
    }));
  return {type:"FeatureCollection",features};
}

// Builds the text for a printable/exportable report summarizing a reverse-
// search candidate list (search center, radius, use, then each ranked
// candidate's rank/score/why-text) — mirrors buildCaseText's role
// (web/explore.html) for the single-parcel "make the case" export, just
// built from a rankCandidates() result list instead of a single parcel's
// verdict state. A missing/malformed center falls back to "?, ?" rather
// than throwing or emitting "NaN, NaN".
function buildCandidatesReportText(useLabel,center,radiusM,results,sig,cfg){
  results=results||[];
  const lat=(center&&typeof center.lat==="number")?center.lat.toFixed(4):"?";
  const lng=(center&&typeof center.lng==="number")?center.lng.toFixed(4):"?";
  const km=(typeof radiusM==="number")?(radiusM/1000).toFixed(radiusM<2000?1:0):"?";
  let t=`SIMyCity — candidate sites for "${useLabel}"\n`;
  t+=`Search center: ${lat}, ${lng} (radius ${km} km)\n`;
  t+=`${results.length} candidate${results.length===1?"":"s"} found\n\n`;
  results.forEach((r,i)=>{t+=`  ${i+1}. ${candidateWhyText(r,sig,cfg)} (score ${r.score})\n`;});
  t+=`\nBuilt on open public data · github.com/jodeit/simy_city\n`;
  return t;
}

// Builds the text for a printable/exportable report summarizing the pinned
// Compare list (same fields renderCompare()'s table shows, one pin per
// section) — mirrors buildCandidatesReportText's role for the reverse-search
// PDF, just fed the Compare list's pins instead of a ranked candidate list.
// A pin missing a field (or the whole pins list being empty/null) renders
// "—"/"0 parcels pinned" rather than throwing or emitting "undefined".
function buildCompareReportText(pins){
  pins=pins||[];
  let t=`SIMyCity — parcel comparison\n`;
  t+=`${pins.length} parcel${pins.length===1?"":"s"} pinned\n\n`;
  pins.forEach((raw,i)=>{
    const p=raw||{};
    const site=p.label||((typeof p.lat==="number"&&typeof p.lng==="number")?`${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`:"?, ?");
    t+=`  ${i+1}. ${site}\n`;
    t+=`     Owner: ${p.owner||"—"}\n`;
    t+=`     Acreage: ${typeof p.acres==="number"?p.acres.toFixed(2)+" ac":"—"}\n`;
    t+=`     Appraised value: ${typeof p.value==="number"?"$"+p.value.toLocaleString():"—"}\n`;
    t+=`     Land use: ${p.land||"—"}\n`;
    t+=`     County: ${p.county||"—"}\n`;
    if(p.use)t+=`     Testing: ${p.use}\n`;
    if(p.verdict)t+=`     Verdict: ${p.verdict}\n`;
    t+=`\n`;
  });
  t+=`Built on open public data · github.com/jodeit/simy_city\n`;
  return t;
}

/* ---- minimal hand-rolled PDF writer for "make the case" ----
   No vendored library, no CDN, no build step — same constraint every other
   feature in this app runs under. Supports exactly what "make the case"
   needs: left-aligned monospace text, paginated across as many pages as it
   takes, one standard-14 font (no embedding). Courier is fixed-pitch, so
   line-wrapping by character count (rather than real glyph measurement) is
   exact, not an approximation — wrapText() above just needs a char-count
   `measure` function instead of canvas's pixel-width one.

   The standard-14 fonts only support WinAnsiEncoding (Latin-1), so
   toPdfSafeText maps the handful of non-Latin-1 characters buildCaseText()
   (web/explore.html) actually emits — em dash, bullet, the standoff-chain
   arrow — to plain-ASCII equivalents, and falls back to "?" for anything
   else outside Latin-1: true Unicode text needs an embedded font, out of
   scope for a hand-rolled writer this small. */
function toPdfSafeText(s){
  const map={"—":"-","–":"-","•":"*","→":"->","✓":"v","✗":"x","…":"...","‘":"'","’":"'","“":'"',"”":'"'};
  // Iterate by Unicode code point (not UTF-16 code unit) — a surrogate-pair
  // emoji split by .split("") would otherwise become two lone surrogates,
  // each independently falling back to "?" (so "🌱" would wrongly become
  // "??" instead of one "?").
  return [...String(s)].map(ch=>{
    if(map[ch]!==undefined)return map[ch];
    return (ch.codePointAt(0)<=255)?ch:"?";
  }).join("");
}
// PDF literal strings delimit with unescaped parens/backslashes, so those
// three characters need a backslash escape before going inside `(...)`.
function escapePdfString(s){
  return String(s).replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)");
}
// Builds a complete, minimal single-font PDF file (returned as a plain JS
// string — after toPdfSafeText every character is guaranteed <=255, so it's
// safe to hand straight to a byte array: `Uint8Array.from(str, c =>
// c.charCodeAt(0))`) from a flat list of already-wrapped text lines. Paginates
// at `linesPerPage` (computed from the page/margin/line-height geometry) —
// letter-size (612x792pt) and a 54pt margin by default. Builds a plain
// (non-compressed, non-cross-reference-stream) PDF-1.4 file: an explicit,
// byte-exact xref table computed while serializing, one Page+Contents object
// pair per page, sharing one Font object.
function buildSimplePdf(lines,opts){
  opts=opts||{};
  const W=opts.pageWidth||612, H=opts.pageHeight||792, margin=opts.margin||54;
  const fontSize=opts.fontSize||10, lineHeight=opts.lineHeight||14;
  const linesPerPage=Math.max(1,Math.floor((H-2*margin)/lineHeight));
  const safeLines=(lines||[]).map(toPdfSafeText);
  const pageLines=[];
  for(let i=0;i<safeLines.length;i+=linesPerPage)pageLines.push(safeLines.slice(i,i+linesPerPage));
  if(!pageLines.length)pageLines.push([]);
  const n=pageLines.length;
  // Object numbering: 1=Catalog, 2=Pages, 3..3+n-1=Page objects,
  // 3+n..3+2n-1=Content streams (one per page), 3+2n=Font.
  const pageObjNum=i=>3+i, contentObjNum=i=>3+n+i, fontObjNum=3+2*n;
  const total=3+2*n+1; // object count, including the always-free object 0

  const objs=new Array(total); // objs[0] unused
  objs[1]=`<< /Type /Catalog /Pages 2 0 R >>`;
  objs[2]=`<< /Type /Pages /Kids [ ${Array.from({length:n},(_,i)=>`${pageObjNum(i)} 0 R`).join(" ")} ] /Count ${n} >>`;
  for(let i=0;i<n;i++){
    objs[pageObjNum(i)]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] `+
      `/Resources << /Font << /F1 ${fontObjNum} 0 R >> >> /Contents ${contentObjNum(i)} 0 R >>`;
    let stream=`BT /F1 ${fontSize} Tf ${lineHeight} TL ${margin} ${H-margin} Td\n`;
    pageLines[i].forEach((line,j)=>{
      stream+=`(${escapePdfString(line)}) Tj`+(j<pageLines[i].length-1?" T*\n":"\n");
    });
    stream+=`ET`;
    objs[contentObjNum(i)]={stream};
  }
  objs[fontObjNum]=`<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>`;

  let out="%PDF-1.4\n";
  const offsets=new Array(total);
  for(let k=1;k<total;k++){
    offsets[k]=out.length;
    const body=objs[k];
    out+=(body&&typeof body==="object"&&body.stream!==undefined)
      ? `${k} 0 obj\n<< /Length ${body.stream.length} >>\nstream\n${body.stream}\nendstream\nendobj\n`
      : `${k} 0 obj\n${body}\nendobj\n`;
  }
  const xrefStart=out.length;
  out+=`xref\n0 ${total}\n0000000000 65535 f \n`;
  for(let k=1;k<total;k++)out+=String(offsets[k]).padStart(10,"0")+" 00000 n \n";
  out+=`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return out;
}

// Node (CommonJS, no bundler) picks this up for tests; browsers ignore it
// since `module` isn't defined in a plain <script>.
if(typeof module!=="undefined" && module.exports){
  module.exports={SEVERITY,AMENITY_USES,COST,evaluate,isContested,findStandoffs,cheapest,countOf,haversine,inBbox,pick,blendedDemand,seniorDemandRead,parseFccBlockFips,parseAcsTractRow,sampleTradeAreaPoints,dedupeTracts,aggregateAcsTracts,makeSessionCache,wrapText,debounce,encodeHash,decodeHash,encodeComparePins,decodeComparePins,mergeComparePins,encodeSearchHash,decodeSearchHash,nominatimUrl,parseNominatimResult,parseCoordPair,toCsvField,toCsvRow,toCsv,addRecentSite,removeRecentSite,clearRecentSites,undoClear,addSavedSearch,removeSavedSearch,sortPins,sampleGrid,rankCandidates,parseOverpassPoints,reverseSearchSignals,candidateWhyText,candidatesToCsvRows,pinsToGeoJson,candidatesToGeoJson,buildCandidatesReportText,buildCompareReportText,toPdfSafeText,escapePdfString,buildSimplePdf,parseAadtFeatures,maxAadtWithinRadius};
}
