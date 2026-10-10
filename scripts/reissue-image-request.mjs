#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { applyTransition, validateCheckpoint } from "./checkpoint-state.mjs";
import { inspectGeneratedSources } from "./image-recovery-correlation.mjs";
import { complete } from "./durable-work-queue.mjs";

const fail = message => { throw new Error(message); };
const digest = value => crypto.createHash("sha256").update(value).digest("hex").slice(0,16);

// This adapter changes only the pending image request. The recovery worker must
// then call image generation once with the returned distinct filename. If that
// call is lost, the watcher will discover and reissue the new checkpointed
// request after its deadline. It cannot inherit the old operation's artifacts.
export async function reissueImageRequest(jobPath, mediaRoot, {now=new Date().toISOString()}={}) {
  if (!Number.isFinite(Date.parse(now))) fail("invalid time");
  const absolute=path.resolve(jobPath), media=path.resolve(mediaRoot);
  if (path.basename(path.dirname(absolute))!=="inflight" || media===path.parse(media).root) fail("bounded leased job and media root required");
  const stat=await fs.lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) fail("regular leased job required");
  const job=JSON.parse(await fs.readFile(absolute,"utf8"));
  if (job.schema!=="serpsmith.work-queue.v1" || job.kind!=="stage_resume" ||
      job.payload?.action!=="recover_external" || !job.lease?.token ||
      Date.parse(job.lease.deadline_at)<=Date.parse(now)) fail("active image recovery lease required");
  if (!absolute.split(path.sep).includes(job.site_key) || !path.resolve(job.checkpoint).split(path.sep).includes(job.site_key)) fail("site boundary mismatch");
  const queueRoot=path.dirname(path.dirname(absolute));
  const checkpoint=validateCheckpoint(JSON.parse(await fs.readFile(job.checkpoint,"utf8")));
  if (checkpoint.revision>job.expected_revision &&
      checkpoint.data.image_reissues?.some(item=>item.old_operation_id===job.payload.operation_id &&
        item.new_operation_id===checkpoint.pending_operation?.operation_id)) {
    await complete(queueRoot,job.operation_id,job.lease.token,now);
    return {adapter:"reissue_image_request",result:"already_reissued"};
  }
  if (checkpoint.run.site_key!==job.site_key || checkpoint.run.run_key!==job.run_key ||
      checkpoint.revision!==job.expected_revision || checkpoint.lifecycle.state!=="waiting_external" ||
      checkpoint.pending_operation?.state!=="requested" ||
      checkpoint.pending_operation.operation_id!==job.payload.operation_id ||
      checkpoint.pending_operation.requested_filename!==job.payload.requested_filename) fail("image request binding mismatch");
  const entries=await fs.readdir(media,{withFileTypes:true});
  const request={output_filename:checkpoint.pending_operation.requested_filename,
    request_token:checkpoint.pending_operation.operation_id,
    requested_at:checkpoint.pending_operation.requested_at};
  const observed=await inspectGeneratedSources(request,entries,media);
  if (observed.status==="ready") {
    await complete(queueRoot,job.operation_id,job.lease.token,now);
    return {adapter:"reissue_image_request",result:"artifact_ready",count:observed.count};
  }
  if (observed.status==="invalid") fail("invalid recorded image request");
  const reason=observed.status==="overproduced"?"image_batch_overproduced":"image_artifact_timeout";
  const count=checkpoint.data.image_reissues?.length??0;
  if (count>=2) fail("image reissue budget exhausted");
  if (reason==="image_artifact_timeout" && Date.parse(now)<Math.min(
    Date.parse(checkpoint.pending_operation.deadline_at),Date.parse(checkpoint.pending_operation.requested_at)+600000)) fail("image request deadline has not elapsed");
  const token=`img-reissue-${digest(`${job.run_key}:${request.request_token}:${count+1}`)}`;
  const extension=path.extname(request.output_filename);
  const filename=`retry-${count+1}-${digest(token)}-${path.basename(request.output_filename,extension).slice(0,32)}${extension}`;
  const next=applyTransition(checkpoint,{type:"image_request_reissued",expected_revision:checkpoint.revision,
    old_operation_id:request.request_token,operation_id:token,reason,
    requested_filename:filename,deadline_at:new Date(Date.parse(now)+600000).toISOString()},now);
  const current=JSON.parse(await fs.readFile(job.checkpoint,"utf8"));
  if (current.revision!==checkpoint.revision || current.pending_operation?.operation_id!==request.request_token) fail("checkpoint changed during image reissue");
  const temporary=path.join(path.dirname(job.checkpoint),`.checkpoint-image-reissue-${process.pid}-${digest(token)}.tmp`);
  await fs.writeFile(temporary,JSON.stringify(next,null,2)+"\n",{flag:"wx",mode:0o600});
  await fs.rename(temporary,job.checkpoint);
  await complete(queueRoot,job.operation_id,job.lease.token,now);
  return {adapter:"reissue_image_request",result:"reissued",reason,
    operation_id:token,requested_filename:filename,revision:next.revision};
}

if (process.argv[1] && path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)) {
  reissueImageRequest(process.argv[2],process.argv[3]).then(result=>process.stdout.write(JSON.stringify(result)+"\n"))
    .catch(error=>{process.stderr.write(JSON.stringify({adapter:"reissue_image_request",result:"failed",detail:error.message})+"\n");process.exitCode=2;});
}
