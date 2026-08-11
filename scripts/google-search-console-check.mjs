#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
const [property,sitemapUrl]=process.argv.slice(2),credentialPath=process.env.SERPSMITH_GSC_CREDENTIALS;
const fail=(code,cls)=>{process.stderr.write("gsc_check result=failed class="+cls+"\n");process.exit(code);};
const b64=v=>(Buffer.isBuffer(v)?v:Buffer.from(v)).toString("base64url");
if(!property||!sitemapUrl||!credentialPath)fail(64,"usage_or_configuration");
if(!(property.startsWith("sc-domain:")||property.startsWith("https://"))||!sitemapUrl.startsWith("https://"))fail(64,"invalid_identifier");
let sitemap,propertyHost;try{sitemap=new URL(sitemapUrl);if(sitemap.username||sitemap.password||sitemap.search||sitemap.hash)throw new Error();if(property.startsWith("sc-domain:")){propertyHost=property.slice(10).toLowerCase();if(!(sitemap.hostname.toLowerCase()===propertyHost||sitemap.hostname.toLowerCase().endsWith("."+propertyHost)))throw new Error();}else{const prefix=new URL(property);if(prefix.protocol!=="https:"||prefix.username||prefix.password||prefix.search||prefix.hash||prefix.origin!==sitemap.origin||!sitemap.href.startsWith(prefix.href))throw new Error();}}catch{fail(64,"property_sitemap_mismatch");}
let c;try{c=JSON.parse(fs.readFileSync(credentialPath,"utf8"));}catch{fail(77,"credential_unreadable");}
if(!c.client_email||!c.private_key||!c.token_uri)fail(77,"credential_invalid");
const now=Math.floor(Date.now()/1000),header=b64(JSON.stringify({alg:"RS256",typ:"JWT"})),claims=b64(JSON.stringify({iss:c.client_email,scope:"https://www.googleapis.com/auth/webmasters",aud:c.token_uri,iat:now,exp:now+3600})),unsigned=header+"."+claims;
let assertion;try{assertion=unsigned+"."+b64(crypto.sign("RSA-SHA256",Buffer.from(unsigned),c.private_key));}catch{fail(77,"credential_signing");}
let r,token;try{r=await fetch(c.token_uri,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion}),signal:AbortSignal.timeout(30000)});token=await r.json();}catch{fail(69,"token_transport");}
if(!r.ok||!token.access_token)fail(r.status===401||r.status===403?77:69,"token_response");
let sites;try{r=await fetch("https://www.googleapis.com/webmasters/v3/sites",{headers:{authorization:"Bearer "+token.access_token},signal:AbortSignal.timeout(30000)});sites=await r.json();}catch{fail(69,"property_transport");}
if(!r.ok)fail(r.status===401||r.status===403?77:69,"property_access");
const site=(sites.siteEntry||[]).find(x=>x.siteUrl===property);
if(!site||!["siteFullUser","siteOwner"].includes(site.permissionLevel))fail(77,"property_not_full_user");
try{r=await fetch(sitemapUrl,{redirect:"follow",signal:AbortSignal.timeout(30000)});}catch{fail(69,"sitemap_transport");}
if(!r.ok)fail(77,"sitemap_not_live");
process.stdout.write("gsc_check property="+property+" sitemap="+sitemapUrl+" result=verified\n");
