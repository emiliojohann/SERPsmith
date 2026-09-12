#!/usr/bin/env node
const WINDOWS=[7,14,28,90];
const date=d=>d.toISOString().slice(0,10);
const range=(end,days,offset=0)=>{const e=new Date(end);e.setUTCDate(e.getUTCDate()-offset);const s=new Date(e);s.setUTCDate(s.getUTCDate()-days+1);return{startDate:date(s),endDate:date(e)};};
const row=x=>({clicks:Number(x?.clicks)||0,impressions:Number(x?.impressions)||0,ctr:Number(x?.ctr)||0,position:Number(x?.position)||0});
const sameSite=(url,origin)=>{try{const u=new URL(url);return u.origin===origin?u.href:null;}catch{return null;}};
export async function collectSearchConsoleSnapshot(config,query,generatedAt=new Date().toISOString()){
  const generated=new Date(generatedAt);if(!Number.isFinite(generated.getTime()))throw new Error("invalid generated_at");
  const end=new Date(generated);end.setUTCDate(end.getUTCDate()-2);
  const windows=[];
  for(const days of WINDOWS){
    const current=range(end,days),preceding=range(end,days,days);
    const request=async(dateRange,dimensions=[])=>query({...dateRange,type:"web",dataState:"final",dimensions,rowLimit:25_000});
    const [ct,pt,cp,pp,cq,pq]=await Promise.all([request(current),request(preceding),request(current,["page"]),request(preceding,["page"]),request(current,["query"]),request(preceding,["query"])]);
    const pages=(payload)=>new Map((payload.rows||[]).map(x=>[sameSite(x.keys?.[0],config.origin),row(x)]).filter(x=>x[0]));
    const queries=(payload)=>(payload.rows||[]).filter(x=>typeof x.keys?.[0]==="string").map(x=>({query:x.keys[0],...row(x)}));
    const a=pages(cp),b=pages(pp),urls=[...new Set([...a.keys(),...b.keys()])].sort();
    windows.push({days,current_range:current,preceding_range:preceding,current_total:row(ct.rows?.[0]),preceding_total:row(pt.rows?.[0]),pages:urls.map(canonical_url=>({canonical_url,current:a.get(canonical_url)||null,preceding:b.get(canonical_url)||null})),queries:{current:queries(cq),preceding:queries(pq)}});
  }
  return{schema:"serpsmith.search-console-snapshot.v1",site_key:config.site_key,public_origin:config.origin,generated_at:generatedAt,aggregate_only:true,windows};
}
export{WINDOWS};
