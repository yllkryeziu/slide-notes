import { extendPdf, makeArchive, outputName } from "./pdf.js";

self.onmessage = async ({ data: { files, options } }) => {
  try {
    const outputs = [];
    const usedNames = new Set();
    for (const [index, file] of files.entries()) {
      try {
        const bytes = await extendPdf(file.data, {
          ...options,
          onProgress: (page, total) =>
            self.postMessage({
              type: "progress",
              id: file.id,
              index,
              page,
              total,
            }),
        });
        const name = outputName(file.name, usedNames);
        outputs.push({ id: file.id, name, bytes });
        self.postMessage({ type: "file-done", id: file.id, name });
      } catch (error) {
        self.postMessage({
          type: "file-error",
          id: file.id,
          message: error.message,
        });
      }
      file.data = null;
    }
    self.postMessage({ type: "packing", count: outputs.length });
    const archive = outputs.length ? makeArchive(outputs) : null;
    self.postMessage(
      { type: "complete", outputs, archive },
      outputs.length
        ? [archive.buffer, ...outputs.map((output) => output.bytes.buffer)]
        : [],
    );
  } catch (error) {
    self.postMessage({
      type: "fatal",
      message: error.message || "The export could not be completed.",
    });
  }
};
