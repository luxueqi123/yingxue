import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const [snapshotPath, outputDir, seedPath, publicBaseURL] = process.argv.slice(2);

if (!snapshotPath || !outputDir) {
    console.error("用法: node scripts/migrate-skill-showcase-media.mjs <source-snapshot.json> <output-dir>");
    process.exit(2);
}

const skills = JSON.parse(await readFile(snapshotPath, "utf8"));
const jobs = skills.flatMap((skill) => (skill.showcase_media ?? []).map((media, index) => ({
    skillID: skill.skill_id,
    skillName: skill.skill_name,
    index,
    media,
})));

await mkdir(outputDir, { recursive: true });

const manifest = [];
for (const [jobIndex, job] of jobs.entries()) {
    const skillDir = path.join(outputDir, job.skillID);
    const prefix = `${String(job.index + 1).padStart(2, "0")}-${job.media.type}.`;
    await mkdir(skillDir, { recursive: true });

    let filename = (await readdir(skillDir)).find((entry) => entry.startsWith(prefix) && isSupportedMediaFilename(entry));
    if (!filename || (await stat(path.join(skillDir, filename))).size === 0) {
        filename = await downloadWithRetry(job, skillDir, prefix);
    }

    const destination = path.join(skillDir, filename);
    const fileStat = await stat(destination);
    const contentType = contentTypeFor(filename);
    manifest.push({
        skill_id: job.skillID,
        skill_name: job.skillName,
        index: job.index,
        type: job.media.type,
        showcase_uri: job.media.showcase_uri,
        source_url: job.media.showcase_url,
        filename: path.posix.join(job.skillID, filename),
        content_type: contentType,
        size: fileStat.size,
        sha256: await sha256(destination),
    });
    console.log(`[${jobIndex + 1}/${jobs.length}] ${job.skillID}/${filename} ${fileStat.size}`);
}

await writeFile(path.join(outputDir, "download-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest.map(({ source_url: _sourceURL, ...item }) => item), null, 2)}\n`);

if (seedPath || publicBaseURL) {
    if (!seedPath || !publicBaseURL) throw new Error("更新种子数据时必须同时提供 seed-path 和 public-base-url");
    const seedSkills = JSON.parse(await readFile(seedPath, "utf8"));
    const sourceByID = new Map(skills.map((skill) => [skill.skill_id, skill]));
    const manifestByMedia = new Map(manifest.map((item) => [`${item.skill_id}:${item.index}`, item]));
    const normalizedBaseURL = publicBaseURL.replace(/\/$/, "");
    for (const skill of seedSkills) {
        const sourceSkill = sourceByID.get(skill.skill_id);
        if (!sourceSkill) throw new Error(`刷新清单缺少技能: ${skill.skill_id}`);
        skill.showcase_media = sourceSkill.showcase_media.map((media, index) => {
            const asset = manifestByMedia.get(`${skill.skill_id}:${index}`);
            if (!asset) throw new Error(`媒体清单缺少文件: ${skill.skill_id}:${index}`);
            return {
                type: media.type,
                showcase_uri: media.showcase_uri,
                showcase_url: `${normalizedBaseURL}/${asset.filename}`,
            };
        });
    }
    await writeFile(seedPath, `${JSON.stringify(seedSkills, null, 2)}\n`);
}
console.log(JSON.stringify({ files: manifest.length, bytes: manifest.reduce((sum, item) => sum + item.size, 0) }));

function extensionFor(contentType) {
    switch (contentType) {
        case "image/png": return "png";
        case "image/jpeg": return "jpg";
        case "video/mp4": return "mp4";
        case "video/quicktime": return "mov";
        default: throw new Error(`不支持的媒体类型: ${contentType || "unknown"}`);
    }
}

function contentTypeFor(filename) {
    const extension = path.extname(filename).toLowerCase();
    if (extension === ".png") return "image/png";
    if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
    if (extension === ".mov") return "video/quicktime";
    if (extension === ".mp4") return "video/mp4";
    throw new Error(`无法识别文件类型: ${filename}`);
}

function isSupportedMediaFilename(filename) {
    return [".png", ".jpg", ".jpeg", ".mov", ".mp4"].includes(path.extname(filename).toLowerCase());
}

async function downloadWithRetry(job, skillDir, prefix) {
    let lastError;
    for (let attempt = 1; attempt <= 4; attempt += 1) {
        let temporary = "";
        try {
            const response = await fetch(job.media.showcase_url);
            if (!response.ok || !response.body) {
                throw new Error(`HTTP ${response.status}`);
            }
            const contentType = (response.headers.get("content-type") ?? "").split(";", 1)[0];
            const filename = `${prefix}${extensionFor(contentType)}`;
            const destination = path.join(skillDir, filename);
            temporary = `${destination}.part`;
            await rm(temporary, { force: true });
            await pipeline(response.body, createWriteStream(temporary, { flags: "wx" }));
            await rm(destination, { force: true });
            await rename(temporary, destination);
            return filename;
        } catch (error) {
            lastError = error;
            if (temporary) await rm(temporary, { force: true });
            console.warn(`${job.skillID}/${job.index}: 第 ${attempt}/4 次下载失败: ${error.message}`);
        }
    }
    throw new Error(`${job.skillID}/${job.index}: 下载失败`, { cause: lastError });
}

async function sha256(filename) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(filename)) hash.update(chunk);
    return hash.digest("hex");
}
