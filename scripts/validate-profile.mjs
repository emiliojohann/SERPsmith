#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
const CORE_POLICY_VERSION="serpsmith-core-v25";
const TOP_LEVEL_KEYS=new Set(["core_policy_version","site_key","repository","branch","remote","public_base_url","article_route","content_adapter","image_directory","image_policy","image_direction","sitemap_file","sitemap_url","llms_file","llms_full_file","search_console_property","bing_site_url","indexnow_host","required_notifications","deployment_adapter","checkpoint_root","lock_root","timezone","editorial_guardrails","autopilot_enabled","repository_instruction_files","validation_commands","crawler_user_agents","internal_link_minimum","external_link_limits","prose_adapter","notification_adapter","schedule","authorization","product_source","validation_policy","robots_policy","analytics","ai_search"]);
const IMAGE_POLICY=new Set(["width","height","hero_format","hero_quality","social_format","social_quality","derive_social_from_hero","strip_metadata","social_crawlers"]);
const IMAGE_DIRECTION=new Set(["style","mood","palette","composition","prefer","avoid","preferred_visual_language","forbidden_imagery"]);
const NOTIFICATIONS=new Set(["google-search-console","bing-webmaster-tools","indexnow"]);
const ANALYTICS_KEYS=new Set(["adapter","property_id","expected_hostname","windows_days","organic_channel","key_events"]);
const AI_SEARCH_KEYS=new Set(["enabled","platforms","llms_txt_policy","measurement"]);
const AI_SEARCH_PLATFORMS=new Set(["google-ai-features","chatgpt-search","perplexity-search"]);
const AI_SEARCH_LLMS_POLICIES=new Set(["optional","validate-if-present","required"]);
const AI_SEARCH_MEASUREMENTS=new Set(["search-console-generative-ai","ga4-ai-referrals","prompt-citation-benchmark"]);
const SECRET_KEY=/(^|_)(api_?key|key_value|token|secret|password|credential|credential_path|credential_file|private_key|oauth_token)$/i;
const SECRET_VALUE=/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{20,}\b|\bsk-[A-Za-z0-9_-]{16,}\b|\bAKIA[A-Z0-9]{16}\b|\bAIza[A-Za-z0-9_-]{30,}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}\b|\bglpat-[A-Za-z0-9_-]{16,}\b|\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/;
const OVERRIDES=[/safe[-_ ]?zone/i,/\bpixel(?:s)?\b/i,/\bcoordinate(?:s)?\b/i,/\bx\s*=\s*\d/i,/\by\s*=\s*\d/i,/\b(?:retry|attempt) budget\b/i,/\bvalidation gate\b/i,/\bevery (?:rendered )?crop\b/i,/\ball (?:rendered )?crops\b/i];
const profilePath=process.argv[2];
const fail=(code,cls,detail)=>{process.stderr.write(JSON.stringify({adapter:"profile_validate",result:"failed",retryable:false,class:cls,detail})+"\n");process.exit(code);};
if(!profilePath)fail(64,"usage","provide a JSON profile path");
let raw;try{raw=fs.readFileSync(profilePath,"utf8");}catch{fail(64,"profile_unreadable","profile cannot be read");}
if(/\$\{[A-Z_][A-Z0-9_]*\}/.test(raw)||/\[[A-Z][A-Z _-]+\]/.test(raw))fail(64,"unresolved_placeholder","replace every placeholder");
if(SECRET_VALUE.test(raw))fail(64,"secret_value_forbidden","profile contains secret-like material");
let p;try{p=JSON.parse(raw);}catch{fail(64,"invalid_json","profile must be valid JSON");}
if(!p||typeof p!=="object"||Array.isArray(p))fail(64,"invalid_profile","profile must be one JSON object");
const inspect=(v,t=[])=>{if(!v||typeof v!=="object")return;for(const [k,c] of Object.entries(v)){if(SECRET_KEY.test(k))fail(64,"secret_field_forbidden",t.concat(k).join("."));inspect(c,t.concat(k));}};inspect(p);
for(const k of Object.keys(p))if(!TOP_LEVEL_KEYS.has(k))fail(64,"unknown_field",k);
if(p.core_policy_version!==CORE_POLICY_VERSION)fail(64,"core_policy_mismatch","core_policy_version must equal "+CORE_POLICY_VERSION);
for(const k of ["site_key","public_base_url","article_route","checkpoint_root","lock_root","timezone"])if(typeof p[k]!=="string"||!p[k].trim())fail(64,"missing_field",k);
if(!/^[a-z0-9][a-z0-9-]*$/.test(p.site_key))fail(64,"invalid_site_key","lowercase letters, numbers, hyphens only");

let base;try{base=new URL(p.public_base_url);if(base.protocol!=="https:"||base.username||base.password||base.search||base.hash||(base.pathname!=="/"&&base.pathname!==""))throw new Error();}catch{fail(64,"invalid_public_url","public_base_url must be HTTPS origin");}
const origin=base.origin,host=base.hostname.toLowerCase();
if(!/^\/(?!\/)(?!.*(?:\.\.|[?#]))[^\s]*<slug>[^\s]*$/.test(p.article_route)||(p.article_route.match(/<slug>/g)||[]).length!==1)fail(64,"invalid_article_route","use one traversal-free root-relative route containing <slug>");
const relative=(v,l)=>{if(typeof v!=="string"||!v||path.isAbsolute(v)||v.split(/[\\/]/).includes(".."))fail(64,"invalid_repository_path",l);};
if(p.image_directory!==undefined)relative(p.image_directory,"image_directory");
for(const k of ["sitemap_file","llms_file","llms_full_file"])if(p[k]!==undefined)relative(p[k],k);
if(!p.content_adapter||typeof p.content_adapter!=="object"||typeof p.content_adapter.name!=="string"||!p.content_adapter.name.trim())fail(64,"missing_content_adapter","content_adapter.name");
if(!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(p.content_adapter.name))fail(64,"invalid_content_adapter","safe adapter identifier required");for(const [k,v] of Object.entries(p.content_adapter))if(k!=="name"&&typeof v==="string"&&/(?:file|directory|path)$/.test(k))relative(v,"content_adapter."+k);
if(!p.deployment_adapter||typeof p.deployment_adapter!=="object"||typeof p.deployment_adapter.name!=="string"||!p.deployment_adapter.name.trim())fail(64,"missing_deployment_adapter","deployment_adapter.name");
if(!Array.isArray(p.editorial_guardrails)||!p.editorial_guardrails.length||p.editorial_guardrails.some(x=>typeof x!=="string"||!x.trim()))fail(64,"invalid_editorial_guardrails","non-empty string array required");
for(const k of ["repository","branch","remote","image_directory"])if(typeof p[k]!=="string"||!p[k].trim())fail(64,"missing_field",k);if(!path.isAbsolute(p.repository))fail(64,"repository_not_absolute","use absolute repository path");if(!Array.isArray(p.repository_instruction_files)||!p.repository_instruction_files.length)fail(64,"missing_repository_instructions","at least one reviewed path required");for(const x of p.repository_instruction_files)relative(x,"repository_instruction_files");
if(!p.image_policy||!Number.isInteger(p.image_policy.width)||p.image_policy.width<1||!Number.isInteger(p.image_policy.height)||p.image_policy.height<1)fail(64,"invalid_image_policy","positive integer dimensions required");
for(const k of Object.keys(p.image_policy))if(!IMAGE_POLICY.has(k))fail(64,"core_policy_override","image_policy."+k);
const imageFormats=new Set(["webp","jpeg","jpg","png","avif"]);
for(const k of ["hero_format","social_format"])if(p.image_policy[k]!==undefined&&!imageFormats.has(p.image_policy[k]))fail(64,"invalid_image_policy",k+" format unsupported");
for(const k of ["hero_quality","social_quality"])if(p.image_policy[k]!==undefined&&(!Number.isInteger(p.image_policy[k])||p.image_policy[k]<1||p.image_policy[k]>100))fail(64,"invalid_image_policy",k+" must be integer 1-100");
for(const k of ["derive_social_from_hero","strip_metadata"])if(p.image_policy[k]!==undefined&&typeof p.image_policy[k]!=="boolean")fail(64,"invalid_image_policy",k+" must be boolean");
if(p.image_policy.social_crawlers!==undefined&&(!Array.isArray(p.image_policy.social_crawlers)||p.image_policy.social_crawlers.some(x=>typeof x!=="string"||!x.trim())))fail(64,"invalid_image_policy","social_crawlers must be string array");
if(p.image_direction!==undefined&&p.image_direction!==null){if(typeof p.image_direction!=="object"||Array.isArray(p.image_direction))fail(64,"invalid_image_direction","object required");for(const k of Object.keys(p.image_direction))if(!IMAGE_DIRECTION.has(k))fail(64,"core_policy_override","image_direction."+k);const text=JSON.stringify(p.image_direction);for(const r of OVERRIDES)if(r.test(text))fail(64,"core_policy_override","operational image policy forbidden");}
if(!path.isAbsolute(p.checkpoint_root)||!path.isAbsolute(p.lock_root))fail(64,"state_root_not_absolute","state roots must be absolute");
const repo=path.resolve(p.repository),checkpoint=path.resolve(p.checkpoint_root),lock=path.resolve(p.lock_root);
if(checkpoint===lock)fail(64,"state_collision","state roots differ");
for(const [label,value] of [["checkpoint_root",checkpoint],["lock_root",lock]]){if(value===repo||value.startsWith(repo+path.sep))fail(64,label.replace("_root","")+"_inside_repository",label+" must be external");if(!value.split(path.sep).includes(p.site_key))fail(64,"state_not_namespaced",label+" must contain site_key");}
try{new Intl.DateTimeFormat("en-US",{timeZone:p.timezone}).format();}catch{fail(64,"invalid_timezone","valid IANA timezone required");}
const sameOrigin=(v,l)=>{let u;try{u=new URL(v);}catch{fail(64,"invalid_site_url",l);}if(u.protocol!=="https:"||u.origin!==origin)fail(64,"cross_site_identifier",l);if(u.username||u.password||u.search||u.hash)fail(64,"unsafe_site_url",l+" must not contain credentials, query, or fragment");return u;};
if(p.sitemap_url!==undefined)sameOrigin(p.sitemap_url,"sitemap_url");
if(p.bing_site_url!==undefined)sameOrigin(p.bing_site_url,"bing_site_url");
if(p.indexnow_host!==undefined&&String(p.indexnow_host).toLowerCase()!==host)fail(64,"cross_site_identifier","indexnow_host");
if(p.search_console_property!==undefined){const v=String(p.search_console_property);if(v.startsWith("sc-domain:")){const d=v.slice(10).toLowerCase();if(!(host===d||host.endsWith("."+d)))fail(64,"cross_site_identifier","search_console_property");}else{let u;try{u=new URL(v);}catch{fail(64,"invalid_search_console_property","use domain or HTTPS URL-prefix");}if(u.protocol!=="https:"||u.origin!==origin)fail(64,"cross_site_identifier","search_console_property");}}
if(p.ai_search!==undefined){
if(!p.ai_search||typeof p.ai_search!=="object"||Array.isArray(p.ai_search))fail(64,"invalid_ai_search","object required");
for(const k of Object.keys(p.ai_search))if(!AI_SEARCH_KEYS.has(k))fail(64,"unknown_field","ai_search."+k);
if(typeof p.ai_search.enabled!=="boolean")fail(64,"invalid_ai_search","enabled must be boolean");
for(const [k,allowed] of [["platforms",AI_SEARCH_PLATFORMS],["measurement",AI_SEARCH_MEASUREMENTS]]){const v=p.ai_search[k];if(!Array.isArray(v)||!v.length||new Set(v).size!==v.length||v.some(x=>!allowed.has(x)))fail(64,"invalid_ai_search",k+" must contain unique supported values");}
if(!AI_SEARCH_LLMS_POLICIES.has(p.ai_search.llms_txt_policy))fail(64,"invalid_ai_search","llms_txt_policy unsupported");
if(p.ai_search.llms_txt_policy==="required"&&!p.llms_file)fail(64,"invalid_ai_search","required llms.txt needs llms_file");
}
if(p.analytics!==undefined){
if(!p.analytics||typeof p.analytics!=="object"||Array.isArray(p.analytics))fail(64,"invalid_analytics","object required");
for(const k of Object.keys(p.analytics))if(!ANALYTICS_KEYS.has(k))fail(64,"unknown_field","analytics."+k);
if(p.analytics.adapter!=="google-analytics-data-v1")fail(64,"invalid_analytics_adapter","analytics.adapter");
if(typeof p.analytics.property_id!=="string"||!/^[1-9][0-9]{5,19}$/.test(p.analytics.property_id))fail(64,"invalid_analytics_property","numeric GA4 Property ID required");
if(typeof p.analytics.expected_hostname!=="string"||p.analytics.expected_hostname.toLowerCase()!==host||p.analytics.expected_hostname!==p.analytics.expected_hostname.toLowerCase())fail(64,"cross_site_identifier","analytics.expected_hostname");
if(!Array.isArray(p.analytics.windows_days)||p.analytics.windows_days.length!==3||p.analytics.windows_days.some((x,i)=>x!==[7,28,90][i]))fail(64,"invalid_analytics_windows","windows_days must equal [7,28,90]");
if(p.analytics.organic_channel!=="Organic Search")fail(64,"invalid_analytics_channel","organic_channel must equal Organic Search");
if(!Array.isArray(p.analytics.key_events)||p.analytics.key_events.length>20||new Set(p.analytics.key_events).size!==p.analytics.key_events.length||p.analytics.key_events.some(x=>typeof x!=="string"||!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(x)))fail(64,"invalid_analytics_events","key_events must be unique GA4 event names");
}
if(p.required_notifications!==undefined){if(!Array.isArray(p.required_notifications)||p.required_notifications.some(x=>!NOTIFICATIONS.has(x)))fail(64,"invalid_required_notifications","invalid name");if((p.required_notifications.includes("google-search-console")||p.required_notifications.includes("bing-webmaster-tools"))&&!p.sitemap_url)fail(64,"missing_search_identifier","sitemap_url");if(p.required_notifications.includes("google-search-console")&&!p.search_console_property)fail(64,"missing_search_identifier","search_console_property");if(p.required_notifications.includes("bing-webmaster-tools")&&!p.bing_site_url)fail(64,"missing_search_identifier","bing_site_url");if(p.required_notifications.includes("indexnow")&&!p.indexnow_host)fail(64,"missing_search_identifier","indexnow_host");}
const identifier=(v,l)=>{if(v!==undefined&&(typeof v!=="string"||!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(v)))fail(64,"invalid_adapter_identifier",l);};
identifier(p.remote,"remote"); identifier(p.prose_adapter,"prose_adapter"); identifier(p.notification_adapter,"notification_adapter");
if(!/^(?![-./])(?!.*(?:\.\.|\/\/|@\{|[~^:?*\[\\\s]))(?!.*(?:\/|\.|\.lock)$)[A-Za-z0-9._\/-]+$/.test(p.branch))fail(64,"invalid_branch","branch must be a safe Git ref name");
if(p.repository_instruction_files.some(x=>typeof x!=="string")||new Set(p.repository_instruction_files).size!==p.repository_instruction_files.length)fail(64,"invalid_repository_instructions","unique string paths required");
if(p.required_notifications!==undefined&&new Set(p.required_notifications).size!==p.required_notifications.length)fail(64,"invalid_required_notifications","duplicates forbidden");
if(p.internal_link_minimum!==undefined&&(!Number.isInteger(p.internal_link_minimum)||p.internal_link_minimum<0))fail(64,"invalid_internal_link_minimum","nonnegative integer required");
if(p.external_link_limits!==undefined){if(!p.external_link_limits||typeof p.external_link_limits!=="object"||Array.isArray(p.external_link_limits))fail(64,"invalid_external_link_limits","object required");for(const k of Object.keys(p.external_link_limits))if(!new Set(["body","sources_minimum","sources_maximum"]).has(k))fail(64,"unknown_field","external_link_limits."+k);for(const [k,x] of Object.entries(p.external_link_limits))if(!Number.isInteger(x)||x<0)fail(64,"invalid_external_link_limits",k);if(Number.isInteger(p.external_link_limits.sources_minimum)&&Number.isInteger(p.external_link_limits.sources_maximum)&&p.external_link_limits.sources_minimum>p.external_link_limits.sources_maximum)fail(64,"invalid_external_link_limits","sources_minimum exceeds sources_maximum");}
if(p.validation_commands!==undefined&&(!Array.isArray(p.validation_commands)||p.validation_commands.some(x=>typeof x!=="string"||!x.trim())))fail(64,"invalid_validation_commands","string array required");
if(p.crawler_user_agents!==undefined&&(!Array.isArray(p.crawler_user_agents)||p.crawler_user_agents.some(x=>typeof x!=="string"||!x.trim())))fail(64,"invalid_crawler_user_agents","string array required");
if(p.product_source!==undefined&&(typeof p.product_source!=="string"||!path.isAbsolute(p.product_source)))fail(64,"invalid_product_source","absolute external path required");
if(p.authorization!==undefined){if(!p.authorization||typeof p.authorization!=="object"||Array.isArray(p.authorization))fail(64,"invalid_authorization","object required");for(const k of Object.keys(p.authorization))if(!new Set(["owner_approved_unattended","scope","does_not_cover"]).has(k))fail(64,"unknown_field","authorization."+k);if(p.authorization.does_not_cover!==undefined&&(!Array.isArray(p.authorization.does_not_cover)||p.authorization.does_not_cover.some(x=>typeof x!=="string"||!x.trim())))fail(64,"invalid_authorization","does_not_cover must be a string array");}
if(p.schedule!==undefined){if(!p.schedule||typeof p.schedule!=="object"||Array.isArray(p.schedule))fail(64,"invalid_schedule","object required");for(const k of Object.keys(p.schedule))if(!new Set(["weekdays","local_time","timezone","slot_key"]).has(k))fail(64,"unknown_field","schedule."+k);const days=new Set(["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]);if(!Array.isArray(p.schedule.weekdays)||!p.schedule.weekdays.length||p.schedule.weekdays.some(x=>!days.has(x))||new Set(p.schedule.weekdays).size!==p.schedule.weekdays.length)fail(64,"invalid_schedule","unique lowercase weekdays required");}
if(typeof p.autopilot_enabled!=="boolean")fail(64,"invalid_autopilot","boolean required");
if(p.autopilot_enabled){if(!p.authorization||p.authorization.owner_approved_unattended!==true||typeof p.authorization.scope!=="string"||!p.authorization.scope.trim())fail(64,"missing_unattended_authorization","owner approval and scope required");if(!p.schedule||!Array.isArray(p.schedule.weekdays)||!p.schedule.weekdays.length||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(p.schedule.local_time||"")||typeof p.schedule.slot_key!=="string"||!p.schedule.slot_key.trim())fail(64,"invalid_schedule","weekdays, time, slot required");try{new Intl.DateTimeFormat("en-US",{timeZone:p.schedule.timezone}).format();}catch{fail(64,"invalid_schedule_timezone","valid IANA timezone required");}if(p.schedule.timezone!==p.timezone)fail(64,"schedule_timezone_mismatch","schedule/profile timezone mismatch");if(typeof p.notification_adapter!=="string"||!p.notification_adapter.trim())fail(64,"missing_notification_adapter","final reporting required");if(!Array.isArray(p.required_notifications)||!p.required_notifications.length)fail(64,"missing_required_notifications","explicit policy required");if(!p.validation_policy||p.validation_policy.secret_scan_required!==true)fail(64,"missing_secret_scan_gate","secret scan required");}
process.stdout.write(JSON.stringify({adapter:"profile_validate",result:"verified",retryable:false,site_key:p.site_key,mode:"structural",core_policy_version:CORE_POLICY_VERSION})+"\n");
