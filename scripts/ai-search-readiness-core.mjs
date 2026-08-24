const problem=(code,cls,detail)=>Object.assign(new Error(detail),{code,cls});
const top=new Set(["site_key","origin","article_url","checked_at","platforms","technical","content","measurement","llms_txt"]);
const secretKey=/(^|_)(api_?key|token|secret|password|credential|private_key)$/i;
export function evaluateAiSearchReadiness(p,e,now=Date.now()){
 if(!p.ai_search||p.ai_search.enabled!==true)throw problem(64,"ai_search_disabled","profile ai_search.enabled must be true");
 for(const k of Object.keys(e))if(!top.has(k))throw problem(64,"unknown_field",k);
 const inspect=(v,path=[])=>{if(!v||typeof v!=="object")return;for(const [k,x] of Object.entries(v)){if(secretKey.test(k))throw problem(64,"secret_field_forbidden",path.concat(k).join("."));inspect(x,path.concat(k));}};inspect(e);
 if(e.site_key!==p.site_key)throw problem(77,"wrong_profile","site_key mismatch");
 let base,article,origin;try{base=new URL(p.public_base_url);origin=new URL(e.origin);article=new URL(e.article_url);}catch{throw problem(64,"invalid_url","profile/evidence URLs must be valid");}
 if(origin.origin!==base.origin||article.origin!==base.origin)throw problem(77,"cross_site_evidence","origin and article must match profile");
 const age=now-Date.parse(e.checked_at);if(!Number.isFinite(age)||age<0||age>7*86400000)throw problem(64,"stale_evidence","checked_at must be within seven days");
 const sets={platforms:new Set(p.ai_search.platforms),technical:new Set(["indexed_or_eligible","snippet_eligible","canonical_matches","sitemap_contains_url","rendered_text_available","structured_data_matches_visible","internal_links_present","image_context_accessible"]),content:new Set(["original_value_documented","claims_source_mapped","clear_authorship","published_and_modified_dates","descriptive_headings","direct_answer_present"]),measurement:new Set(p.ai_search.measurement),llms_txt:new Set(["status","empty_links","canonical_links_only"])};
 for(const section of Object.keys(sets)){if(!e[section]||typeof e[section]!=="object"||Array.isArray(e[section]))throw problem(64,"missing_section",section);for(const k of Object.keys(e[section]))if(!sets[section].has(k))throw problem(64,"unknown_field",section+"."+k);}
 const crawler={"google-ai-features":"Googlebot","chatgpt-search":"OAI-SearchBot","perplexity-search":"PerplexityBot"},gaps=[];
 for(const platform of p.ai_search.platforms){const v=e.platforms[platform];if(!v||Object.keys(v).some(k=>!["crawler","access"].includes(k))||v.crawler!==crawler[platform]||v.access!=="allowed")gaps.push("platform:"+platform);}
 for(const k of sets.technical)if(e.technical[k]!==true)gaps.push("technical:"+k);
 for(const k of sets.content)if(e.content[k]!==true)gaps.push("content:"+k);
 for(const k of p.ai_search.measurement){const v=e.measurement[k];if(v!=="ready"&&v!=="unavailable")gaps.push("measurement:"+k);}
 const l=e.llms_txt;if(!["valid","absent","invalid"].includes(l.status)||!Number.isInteger(l.empty_links)||l.empty_links<0||typeof l.canonical_links_only!=="boolean")throw problem(64,"invalid_llms_txt","invalid llms.txt evidence");
 if(p.ai_search.llms_txt_policy==="required"&&l.status!=="valid")gaps.push("llms_txt:required");
 if(p.ai_search.llms_txt_policy==="validate-if-present"&&l.status!=="absent"&&(l.status!=="valid"||l.empty_links!==0||l.canonical_links_only!==true))gaps.push("llms_txt:invalid");
 if(l.status==="valid"&&(l.empty_links!==0||l.canonical_links_only!==true))gaps.push("llms_txt:hygiene");
 return {adapter:"ai_search_readiness",result:gaps.length?"action-required":"verified",retryable:false,site_key:p.site_key,article_url:e.article_url,checked_at:e.checked_at,platforms:p.ai_search.platforms,measurement:p.ai_search.measurement,gaps};
}
