#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { searchAnalytics,searchConsoleToken } from "./google-search-console-client.mjs";
import { collectSearchConsoleSnapshot } from "./google-search-console-snapshot-core.mjs";
const fail=(code,cls,detail)=>{process.stderr.write(JSON.stringify({adapter:"search_console_snapshot",result:"failed",retryable:code===75,class:cls,detail})+"\n");process.exit(code);};
try{
 const [profilePath,output]=process.argv.slice(2),credential=process.env.SERPSMITH_GSC_CREDENTIALS;
 if(!profilePath||!output||!credential||!path.isAbsolute(output))fail(64,"usage","provide profile, new absolute output, and credential environment");
 const profile=JSON.parse(await fs.readFile(path.resolve(profilePath),"utf8")),origin=new URL(profile.public_base_url).origin;
 if(!profile.site_key||!profile.search_console_property||!profile.checkpoint_root||!path.resolve(output).startsWith(path.resolve(profile.checkpoint_root)+path.sep))fail(64,"profile_binding","output must be inside the selected site state root");
 const token=await searchConsoleToken(credential),snapshot=await collectSearchConsoleSnapshot({site_key:profile.site_key,origin},body=>searchAnalytics(profile.search_console_property,token,body));
 await fs.mkdir(path.dirname(path.resolve(output)),{recursive:true,mode:0o700});
 await fs.writeFile(path.resolve(output),JSON.stringify(snapshot,null,2)+"\n",{flag:"wx",mode:0o600});
 process.stdout.write(JSON.stringify({adapter:"search_console_snapshot",result:"verified",site_key:profile.site_key,windows:snapshot.windows.map(x=>x.days)})+"\n");
}catch(error){fail(error.retryable?75:64,error.message,"snapshot not written");}
