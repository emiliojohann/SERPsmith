import { promises as fs } from "node:fs";
import path from "node:path";

const rasterExtensions=new Set([".png",".webp",".jpg",".jpeg"]);

export async function correlateGeneratedSources(request, mediaEntries, mediaRoot) {
  if (!request?.output_filename || !request?.request_token || !request?.requested_at) return null;
  if (path.basename(request.output_filename) !== request.output_filename) return null;
  const requestedAt = Date.parse(request.requested_at);
  if (!Number.isFinite(requestedAt)) return null;
  const parsed = path.parse(request.output_filename);
  const generatedStem = parsed.name.slice(0, 60);
  const names = mediaEntries
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter(name => name === request.output_filename ||
      (name.startsWith(`${generatedStem}---`) && rasterExtensions.has(path.extname(name).toLowerCase())));
  const sources = [];
  for (const name of names) {
    const source = path.join(mediaRoot, name);
    const info = await fs.lstat(source);
    if (!info.isFile() || info.isSymbolicLink() || info.mtimeMs + 1000 < requestedAt) continue;
    const real = await fs.realpath(source);
    if (path.dirname(real) === mediaRoot) sources.push(real);
  }
  const unique = [...new Set(sources)].sort();
  return unique.length >= 1 && unique.length <= 4 ? unique : null;
}

export function candidateKey(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  const single = /^(?:CANDIDATE[-_])?([A-Z])$/.exec(normalized)?.[1];
  if (single) return single;
  return /^[A-Z][A-Z0-9._:-]{0,63}$/.test(normalized) ? normalized : null;
}
