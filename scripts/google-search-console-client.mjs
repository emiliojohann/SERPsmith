#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";

const timeout=30_000;
const fail=(message,retryable=false)=>Object.assign(new Error(message),{retryable});
const b64=value=>Buffer.from(typeof value==="string"?value:JSON.stringify(value)).toString("base64url");
export async function searchConsoleToken(credentialPath){
  let credential;try{credential=JSON.parse(fs.readFileSync(credentialPath,"utf8"));}catch{throw fail("credentials_unreadable");}
  if(!credential?.client_email||!credential?.private_key||!credential?.token_uri)throw fail("credentials_invalid");
  const now=Math.floor(Date.now()/1000),unsigned=b64({alg:"RS256",typ:"JWT"})+"."+b64({iss:credential.client_email,scope:"https://www.googleapis.com/auth/webmasters.readonly",aud:credential.token_uri,iat:now,exp:now+3600});
  const assertion=unsigned+"."+crypto.sign("RSA-SHA256",Buffer.from(unsigned),credential.private_key).toString("base64url");
  let response;try{response=await fetch(credential.token_uri,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion}),signal:AbortSignal.timeout(timeout)});}catch{throw fail("token_transport",true);}
  if(!response.ok)throw fail("token_rejected");
  const body=await response.json();if(!body.access_token)throw fail("token_missing");
  return body.access_token;
}
export async function searchAnalytics(property,token,body){
  const endpoint="https://www.googleapis.com/webmasters/v3/sites/"+encodeURIComponent(property)+"/searchAnalytics/query";
  let response;try{response=await fetch(endpoint,{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});}catch{throw fail("search_analytics_transport",true);}
  if(response.status===429||response.status>=500)throw fail("search_analytics_temporary",true);
  if(!response.ok)throw fail("search_analytics_rejected");
  return response.json();
}
