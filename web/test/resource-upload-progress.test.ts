import { expect, test } from "bun:test";
import type { AxiosProgressEvent } from "axios";
import { apiClient } from "../src/services/api/request";
import { ResourceUploadError, uploadResourceFile } from "../src/services/api/resources";

test("上传错误保留服务端 Retry-After，不要求案例消费者解析文案", async () => {
    const adapter = apiClient.defaults.adapter;
    try {
        apiClient.defaults.adapter = async config => ({ config, status: 429, statusText: "Too Many Requests", headers: { "retry-after": "49" }, data: { code: 429, msg: "cooldown" } });
        const error = await uploadResourceFile(new Blob(["test"]), "file").catch(error => error);
        expect(error).toBeInstanceOf(ResourceUploadError);
        expect(error.status).toBe(429);
        expect(error.permanent).toBe(false);
        expect(error.retryAfterMs).toBe(49000);
    } finally { apiClient.defaults.adapter = adapter; }
});

test("普通 multipart 将传输进度换算为文件字节，总量未知不伪造百分比", async () => {
    const adapter = apiClient.defaults.adapter;
    const progress: number[][] = [];
    try {
        apiClient.defaults.adapter = async (config) => {
            config.onUploadProgress?.({ loaded: 100, total: undefined } as AxiosProgressEvent);
            config.onUploadProgress?.({ loaded: 250, total: 1000 } as AxiosProgressEvent);
            config.onUploadProgress?.({ loaded: 1000, total: 1000 } as AxiosProgressEvent);
            return { config, status: 200, statusText: "OK", headers: {}, data: { code: 0, data: { resource: { id: "upload-test" } } } };
        };
        await uploadResourceFile(new Blob([new Uint8Array(400)]), "file", undefined, (loaded, total) => progress.push([loaded, total]));
        expect(progress).toEqual([[100, 400], [400, 400]]);
    } finally {
        apiClient.defaults.adapter = adapter;
    }
});

test("普通和分片上传都按整数毫秒提交时长且保留原始元数据", async () => {
    const adapter = apiClient.defaults.adapter;
    const metadata = { durationMs: 16648.005 };
    const durations: number[] = [];
    try {
        apiClient.defaults.adapter = async (config) => {
            let data: unknown = { resource: { id: "duration-test" } };
            if (config.url === "/resources/uploads") {
                const body = JSON.parse(config.data);
                durations.push(body.durationMs);
                expect(body.durationMs).toBe(16648);
                data = { uploadId: "duration-session", chunkSize: 64 * 1024 * 1024, chunkCount: 1 };
            } else if (config.url === "/resources") {
                durations.push(Number((config.data as FormData).get("durationMs")));
            } else if (config.url?.includes("/chunks/")) data = { index: 0 };
            return { config, status: 200, statusText: "OK", headers: {}, data: { code: 0, data } };
        };
        for (const size of [1024, 51 * 1024 * 1024]) {
            await uploadResourceFile(new Blob([new Uint8Array(size)]), "video", metadata);
        }
        expect(durations).toEqual([16648, 16648]);
        expect(metadata.durationMs).toBe(16648.005);
    } finally {
        apiClient.defaults.adapter = adapter;
    }
});

test("分片上传累加片内真实进度，传输 100% 后仍须等待合并响应", async () => {
    const adapter = apiClient.defaults.adapter;
    const size = 51 * 1024 * 1024;
    const chunkSize = 32 * 1024 * 1024;
    const progress: number[][] = [];
    let merged = false;
    try {
        apiClient.defaults.adapter = async (config) => {
            let data: unknown;
            if (config.url === "/resources/uploads") data = { uploadId: "session", chunkSize, chunkCount: 2 };
            else if (config.url?.endsWith("/complete")) {
                expect(progress.at(-1)).toEqual([size, size]);
                merged = true;
                data = { resource: { id: "chunk-test" } };
            } else {
                const index = Number(config.url?.split("/").at(-1));
                const bytes = index === 0 ? chunkSize : size - chunkSize;
                config.onUploadProgress?.({ loaded: bytes / 2, total: bytes } as AxiosProgressEvent);
                data = { index };
            }
            return { config, status: 200, statusText: "OK", headers: {}, data: { code: 0, data } };
        };
        await uploadResourceFile(new Blob([new Uint8Array(size)]), "video", undefined, (loaded, total) => progress.push([loaded, total]));
        expect(progress).toEqual([[chunkSize / 2, size], [chunkSize, size], [chunkSize + (size - chunkSize) / 2, size], [size, size]]);
        expect(merged).toBe(true);
    } finally {
        apiClient.defaults.adapter = adapter;
    }
});

test("传输结束不吞掉服务端保存错误", async () => {
    const adapter = apiClient.defaults.adapter;
    try {
        apiClient.defaults.adapter = async (config) => {
            config.onUploadProgress?.({ loaded: 100, total: 100 } as AxiosProgressEvent);
            return { config, status: 200, statusText: "OK", headers: {}, data: { code: 9, msg: "保存失败" } };
        };
        await expect(uploadResourceFile(new Blob(["text"]), "file", undefined, () => {})).rejects.toThrow("保存失败");
    } finally {
        apiClient.defaults.adapter = adapter;
    }
});

test("大文件分片会话按底座JSON合同传幂等键，重建会话仍沿用同一键", async () => {
    const adapter=apiClient.defaults.adapter;
    const keys:unknown[]=[];
    let starts=0, failFirstChunk=true;
    try {
        apiClient.defaults.adapter=async config=>{
            let data:unknown;
            if(config.url==="/resources/uploads") {
                keys.push(JSON.parse(config.data).idempotencyKey);
                starts++;
                data={uploadId:`session-${starts}`,chunkSize:64*1024*1024,chunkCount:1};
            } else if(config.url?.includes('/chunks/')) {
                if(failFirstChunk){failFirstChunk=false;throw new Error('Network Error');}
                data={index:0};
            } else data={resource:{id:"same-owned-resource"}};
            return {config,status:200,statusText:"OK",headers:{},data:{code:0,data}};
        };
        const resource=await uploadResourceFile(new Blob([new Uint8Array(51*1024*1024)]),"video",{idempotencyKey:"  case-file-identity  "});
        expect(resource.id).toBe("same-owned-resource");
        expect(starts).toBe(2);
        expect(keys).toEqual(["case-file-identity","case-file-identity"]);
    } finally {apiClient.defaults.adapter=adapter;}
});
