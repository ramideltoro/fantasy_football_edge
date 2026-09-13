import { zipSync, strToU8 } from "fflate";
import { fromBuffer } from "yauzl";
export const MAX_PACKAGE_BYTES = 8 * 1024 * 1024;
export function packSnapshot(snapshot: unknown) {
  const json = strToU8(JSON.stringify(snapshot));
  if (json.length > MAX_PACKAGE_BYTES)
    throw Error("Snapshot exceeds package limit");
  return Buffer.from(zipSync({ "snapshot.json": json }, { level: 6 }));
}
export function unpackSnapshot(buffer: Buffer): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (buffer.length > MAX_PACKAGE_BYTES)
      return reject(Error("Package too large"));
    fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip) return reject(Error("Invalid ZIP package"));
        let count = 0,
          content: Buffer | undefined;
        const fail = (e: Error) => {
          zip.close();
          reject(e);
        };
        zip.on("error", fail);
        zip.on("entry", (entry) => {
          if (
            ++count !== 1 ||
            entry.fileName !== "snapshot.json" ||
            entry.uncompressedSize > MAX_PACKAGE_BYTES ||
            entry.generalPurposeBitFlag & 1
          )
            return fail(
              Error("ZIP must contain only snapshot.json within size limit"),
            );
          zip.openReadStream(entry, (err, stream) => {
            if (err || !stream) return fail(Error("Cannot read ZIP entry"));
            const chunks: Buffer[] = [];
            let bytes = 0;
            stream.on("error", fail);
            stream.on("data", (chunk: Buffer) => {
              bytes += chunk.length;
              if (bytes > MAX_PACKAGE_BYTES) {
                stream.destroy();
                fail(Error("Expanded package too large"));
              } else chunks.push(chunk);
            });
            stream.on("end", () => {
              content = Buffer.concat(chunks);
              zip.readEntry();
            });
          });
        });
        zip.on("end", () => {
          try {
            if (count !== 1 || !content) throw Error("Missing snapshot");
            resolve(JSON.parse(content.toString("utf8")));
          } catch {
            reject(Error("Invalid snapshot JSON"));
          }
        });
        zip.readEntry();
      },
    );
  });
}
