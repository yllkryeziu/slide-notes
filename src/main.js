import "./style.css";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
const $ = (id) => document.getElementById(id);
const state = {
  files: [],
  selected: null,
  pdf: null,
  loadingTask: null,
  renderTask: null,
  page: 1,
  previewGeneration: 0,
  rendering: 0,
  worker: null,
  busy: false,
  zipUrl: null,
  results: [],
};
const density = $("grid-density");
const fileInput = $("file-input");
const tone = () => document.querySelector('input[name="tone"]:checked').value;
const sizeText = (bytes) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function updateGrid() {
  const divisions = Number(density.value);
  const frame = $("slide-frame").getBoundingClientRect();
  $("paper").style.setProperty(
    "--grid-size",
    `${Math.min(frame.width, frame.height) / divisions}px`,
  );
  $("paper").style.setProperty(
    "--grid-color",
    tone() === "dark" ? "#a6b8b5" : "#ccd9d6",
  );
  $("density-label").textContent =
    divisions === 42 ? "Standard" : divisions < 42 ? "Larger" : "Smaller";
  density.setAttribute(
    "aria-valuetext",
    `${divisions} squares along the shorter edge`,
  );
  $("grid-help").textContent = `${divisions} squares along the shorter edge.`;
}

function clearResults() {
  if (state.zipUrl) URL.revokeObjectURL(state.zipUrl);
  state.zipUrl = null;
  for (const result of state.results) URL.revokeObjectURL(result.url);
  state.results = [];
  $("download-area").hidden = true;
  $("download-zip").removeAttribute("href");
  for (const item of state.files) {
    item.status = sizeText(item.file.size);
    item.error = false;
  }
  renderFiles();
}

function renderFiles() {
  $("file-list").replaceChildren();
  for (const item of state.files) {
    const row = document.createElement("li");
    row.className = `file-row${item.id === state.selected ? " selected" : ""}${item.error ? " error" : ""}`;
    const select = document.createElement("button");
    select.className = "file-select";
    select.type = "button";
    select.title = `Preview ${item.file.name}`;
    select.setAttribute("aria-pressed", String(item.id === state.selected));
    const name = document.createElement("span");
    name.className = "file-name";
    name.textContent = item.file.name;
    const status = document.createElement("span");
    status.className = "file-status";
    status.textContent = item.status;
    select.append(name, status);
    select.addEventListener("click", () => selectPreview(item));
    row.append(select);
    const result = state.results.find((result) => result.id === item.id);
    if (result) {
      const link = document.createElement("a");
      link.className = "file-download";
      link.href = result.url;
      link.download = result.name;
      link.textContent = "↓";
      link.setAttribute("aria-label", `Download ${result.name}`);
      row.append(link);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-file";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${item.file.name}`);
    remove.disabled = state.busy;
    remove.addEventListener("click", () => removeFile(item.id));
    row.append(remove);
    $("file-list").append(row);
  }
  $("file-list-heading").hidden = !state.files.length;
  $("file-count").textContent =
    `${state.files.length} PDF${state.files.length === 1 ? "" : "s"} selected`;
  $("convert-button").disabled = state.busy || !state.files.length;
}

async function addFiles(files) {
  if (state.busy) return;
  clearResults();
  let rejected = 0;
  let duplicates = 0;
  for (const file of files) {
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      rejected++;
      continue;
    }
    if (
      state.files.some(
        (item) =>
          item.file.name === file.name &&
          item.file.size === file.size &&
          item.file.lastModified === file.lastModified,
      )
    ) {
      duplicates++;
      continue;
    }
    state.files.push({
      id: crypto.randomUUID(),
      file,
      status: sizeText(file.size),
      error: false,
    });
  }
  $("selection-message").textContent = [
    rejected
      ? `${rejected} non-PDF file${rejected === 1 ? "" : "s"} skipped.`
      : "",
    duplicates ? `${duplicates} already selected.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  renderFiles();
  if (!state.selected && state.files.length)
    await selectPreview(state.files[0]);
}

function removeFile(id) {
  clearResults();
  state.files = state.files.filter((item) => item.id !== id);
  if (state.selected === id) {
    if (state.files.length) selectPreview(state.files[0]);
    else resetPreview();
  }
  renderFiles();
}

function stopPreview() {
  state.previewGeneration++;
  state.rendering++;
  state.renderTask?.cancel();
  state.renderTask = null;
  state.loadingTask?.destroy().catch(() => {});
  state.loadingTask = null;
  state.pdf = null;
}

function resetPreview() {
  stopPreview();
  state.selected = null;
  state.page = 1;
  $("preview-canvas").hidden = true;
  $("demo-slide").hidden = false;
  $("slide-frame").style.aspectRatio = "16 / 10";
  $("preview-badge").textContent = "Example";
  $("preview-caption").textContent = "";
  $("preview-error").textContent = "";
  $("page-controls").hidden = true;
  updateGrid();
}

async function selectPreview(item) {
  stopPreview();
  state.selected = item.id;
  state.page = 1;
  const generation = state.previewGeneration;
  renderFiles();
  $("preview-badge").textContent = "Loading preview…";
  $("preview-error").textContent = "";
  $("preview-caption").textContent = item.file.name;
  $("page-controls").hidden = true;
  $("preview-canvas").hidden = true;
  $("demo-slide").hidden = false;
  try {
    const data = new Uint8Array(await item.file.arrayBuffer());
    if (generation !== state.previewGeneration) return;
    const assetBase = new URL("./pdfjs/", document.baseURI).href;
    const loadingTask = getDocument({
      data,
      isEvalSupported: false,
      cMapUrl: `${assetBase}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${assetBase}standard_fonts/`,
      wasmUrl: `${assetBase}wasm/`,
      iccUrl: `${assetBase}iccs/`,
    });
    state.loadingTask = loadingTask;
    const pdf = await loadingTask.promise;
    if (generation !== state.previewGeneration) {
      await loadingTask.destroy();
      return;
    }
    state.pdf = pdf;
    $("preview-badge").textContent = "";
    $("page-controls").hidden = pdf.numPages <= 1;
    await renderPreview();
  } catch (error) {
    if (generation !== state.previewGeneration) return;
    $("preview-badge").textContent = "Example";
    $("preview-error").textContent =
      error.name === "PasswordException"
        ? "Password-protected PDF. Export an unlocked copy to use it here."
        : "Preview unavailable for this file. You can still try the export.";
  }
}

async function renderPreview() {
  const pdf = state.pdf;
  if (!pdf) return;
  const generation = state.previewGeneration;
  const rendering = ++state.rendering;
  state.renderTask?.cancel();
  try {
    const page = await pdf.getPage(state.page);
    if (generation !== state.previewGeneration || rendering !== state.rendering)
      return;
    const natural = page.getViewport({ scale: 1 });
    $("slide-frame").style.aspectRatio = `${natural.width} / ${natural.height}`;
    updateGrid();
    const width = $("slide-frame").getBoundingClientRect().width;
    const scale = Math.min(
      (width * Math.min(devicePixelRatio || 1, 2)) / natural.width,
      2000 / Math.max(natural.width, natural.height),
    );
    const viewport = page.getViewport({ scale });
    // Render offscreen so cancelled/overlapping previews never share a canvas.
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const task = page.render({
      canvasContext: canvas.getContext("2d"),
      viewport,
    });
    state.renderTask = task;
    await task.promise;
    if (generation !== state.previewGeneration || rendering !== state.rendering)
      return;
    const visible = $("preview-canvas");
    visible.width = canvas.width;
    visible.height = canvas.height;
    visible.getContext("2d").drawImage(canvas, 0, 0);
    visible.hidden = false;
    $("demo-slide").hidden = true;
    $("page-number").textContent = `${state.page} / ${pdf.numPages}`;
    $("previous-page").disabled = state.page === 1;
    $("next-page").disabled = state.page === pdf.numPages;
    $("preview-error").textContent = "";
    state.renderTask = null;
  } catch (error) {
    if (
      error.name !== "RenderingCancelledException" &&
      generation === state.previewGeneration &&
      rendering === state.rendering
    ) {
      $("preview-error").textContent =
        "This page could not be previewed. You can still try the export.";
    }
  }
}

function setBusy(busy) {
  state.busy = busy;
  fileInput.disabled = busy;
  $("settings").disabled = busy;
  $("clear-files").disabled = busy;
  $("drop-zone").setAttribute("aria-disabled", String(busy));
  $("progress-area").hidden = !busy;
  $("convert-button").querySelector("span").textContent = busy
    ? "Processing…"
    : "Add grid paper";
  renderFiles();
}

function finishWorker() {
  state.worker?.terminate();
  state.worker = null;
  setBusy(false);
}

async function convert() {
  if (state.busy || !state.files.length) return;
  clearResults();
  $("selection-message").textContent = "";
  setBusy(true);
  $("progress").value = 0;
  $("progress-label").textContent = "Reading your PDFs…";
  let worker;
  try {
    worker = new Worker(new URL("./convert.worker.js", import.meta.url), {
      type: "module",
    });
    state.worker = worker;
    worker.onerror = () => {
      if (state.worker !== worker) return;
      $("selection-message").textContent =
        "The export stopped. Try a smaller batch or reload the page.";
      finishWorker();
    };
    worker.onmessage = ({ data }) => {
      if (state.worker !== worker) return;
      const item = state.files.find((item) => item.id === data.id);
      if (data.type === "progress") {
        $("progress-label").textContent =
          `PDF ${data.index + 1} of ${state.files.length} · Page ${data.page} of ${data.total}`;
        $("progress").value =
          (95 * (data.index + data.page / data.total)) / state.files.length;
      } else if (data.type === "file-done") {
        item.status = "Ready";
        renderFiles();
      } else if (data.type === "file-error") {
        item.status = data.message;
        item.error = true;
        renderFiles();
      } else if (data.type === "packing") {
        $("progress-label").textContent = "Packing your ZIP…";
        $("progress").value = 98;
      } else if (data.type === "complete") {
        state.results = data.outputs.map((output) => ({
          id: output.id,
          name: output.name,
          url: URL.createObjectURL(
            new Blob([output.bytes], { type: "application/pdf" }),
          ),
        }));
        if (data.archive) {
          state.zipUrl = URL.createObjectURL(
            new Blob([data.archive], { type: "application/zip" }),
          );
          $("download-zip").href = state.zipUrl;
          const skipped = state.files.length - data.outputs.length;
          $("result-summary").textContent =
            `${data.outputs.length} PDF${data.outputs.length === 1 ? "" : "s"} ready for notes.` +
            (skipped
              ? ` ${skipped} could not be converted; see the file list.`
              : " Your ZIP is ready.");
          $("download-area").hidden = false;
        } else {
          $("selection-message").textContent =
            "No PDFs could be converted. See the message beside each file.";
        }
        finishWorker();
      } else if (data.type === "fatal") {
        $("selection-message").textContent = data.message;
        finishWorker();
      }
    };
    const files = [];
    for (const item of state.files) {
      const data = await item.file.arrayBuffer();
      if (state.worker !== worker) return;
      files.push({ id: item.id, name: item.file.name, data });
    }
    worker.postMessage(
      { files, options: { divisions: Number(density.value), tone: tone() } },
      files.map((file) => file.data),
    );
  } catch {
    if (worker && state.worker !== worker) return;
    $("selection-message").textContent =
      "Could not read the selected files. Try selecting them again or use a smaller batch.";
    finishWorker();
  }
}

fileInput.addEventListener("change", () => {
  addFiles([...fileInput.files]);
  fileInput.value = "";
});
for (const name of ["dragenter", "dragover"])
  $("drop-zone").addEventListener(name, (event) => {
    event.preventDefault();
    if (!state.busy) $("drop-zone").classList.add("drag-over");
  });
for (const name of ["dragleave", "drop"])
  $("drop-zone").addEventListener(name, (event) => {
    event.preventDefault();
    $("drop-zone").classList.remove("drag-over");
  });
$("drop-zone").addEventListener("drop", (event) =>
  addFiles([...event.dataTransfer.files]),
);
// Dropping outside the picker should never navigate away from a prepared batch.
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => event.preventDefault());
$("clear-files").addEventListener("click", () => {
  clearResults();
  state.files = [];
  resetPreview();
  renderFiles();
  $("selection-message").textContent = "";
});
density.addEventListener("input", () => {
  clearResults();
  updateGrid();
});
document.querySelectorAll('input[name="tone"]').forEach((input) =>
  input.addEventListener("change", () => {
    clearResults();
    updateGrid();
  }),
);
$("reset-grid").addEventListener("click", () => {
  density.value = "42";
  clearResults();
  updateGrid();
});
$("previous-page").addEventListener("click", () => {
  if (state.pdf && state.page > 1) {
    state.page--;
    renderPreview();
  }
});
$("next-page").addEventListener("click", () => {
  if (state.pdf && state.page < state.pdf.numPages) {
    state.page++;
    renderPreview();
  }
});
$("convert-button").addEventListener("click", convert);
$("cancel-button").addEventListener("click", () => {
  finishWorker();
  clearResults();
  $("selection-message").textContent =
    "Export cancelled. Your files are still selected.";
});
new ResizeObserver(updateGrid).observe($("slide-frame"));
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderPreview, 180);
});
window.addEventListener("beforeunload", (event) => {
  if (state.busy) {
    event.preventDefault();
    event.returnValue = "";
  }
});
updateGrid();
