const root = () => navigator.storage.getDirectory();

const isNotFound = (e: unknown) => e instanceof DOMException && e.name === "NotFoundError";

const META = ".meta.json";

export async function list(): Promise<string[]> {
    const files: string[] = [];

    for await (const [name, handle] of (await root()).entries()) {
        if (handle.kind !== "file" || name.endsWith(META)) continue;
        files.push(name);
    }

    return files.sort((a, b) => a.localeCompare(b));
}

export async function save(name: string, data: Blob | string | BufferSource, meta?: unknown): Promise<void> {
    const dir = await root();

    const write = async (fileName: string, content: Blob | string | BufferSource) => {
        const writable = await (await dir.getFileHandle(fileName, { create: true })).createWritable();
        await writable.write(content);
        await writable.close();
    };

    await write(name, data);
    if (meta !== undefined) await write(name + META, JSON.stringify(meta));
}

export async function load(name: string): Promise<File | null> {
    try {
        return await (await (await root()).getFileHandle(name)).getFile();
    } catch (e) {
        if (isNotFound(e)) return null;
        throw e;
    }
}

export async function loadJson<T>(name: string, meta = false): Promise<T | null> {
    const file = await load(meta ? name + META : name);
    return file ? (JSON.parse(await file.text()) as T) : null;
}

export async function remove(name: string): Promise<void> {
    for (const fileName of [name, name + META]) {
        try {
            await (await root()).removeEntry(fileName);
        } catch (e) {
            if (!isNotFound(e)) throw e;
        }
    }
}
