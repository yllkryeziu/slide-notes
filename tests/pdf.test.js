import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFName, PDFNumber } from "pdf-lib";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { unzipSync } from "fflate";
import { extendPdf, outputName, makeArchive } from "../src/pdf.js";
import { lectureFixture } from "./fixtures.js";

async function open(bytes) {
  return getDocument({
    data: bytes.slice(),
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;
}

async function render(doc, index, scale = 1) {
  const page = await doc.getPage(index);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(
    Math.round(viewport.width),
    Math.round(viewport.height),
  );
  const context = canvas.getContext("2d");
  await page.render({ canvasContext: context, viewport }).promise;
  return {
    width: canvas.width,
    height: canvas.height,
    data: context.getImageData(0, 0, canvas.width, canvas.height).data,
  };
}

function viewportRect(page, rect) {
  const [a, b, c, d, e, f] = page.getViewport({ scale: 1 }).transform;
  return [
    a * rect[0] + c * rect[1] + e,
    b * rect[0] + d * rect[1] + f,
    a * rect[2] + c * rect[3] + e,
    b * rect[2] + d * rect[3] + f,
  ];
}

for (const cropped of [false, true]) {
  test(`preserves rendered slide, text, links and orientation at every rotation (cropped=${cropped})`, async () => {
    const source = await lectureFixture({ cropped });
    const output = await extendPdf(source);
    const original = await open(source);
    const extended = await open(output);
    assert.equal(extended.numPages, 4);
    for (let index = 1; index <= 4; index++) {
      const before = await render(original, index);
      const after = await render(extended, index);
      assert.equal(after.width, before.width * 2.5);
      assert.equal(after.height, before.height);
      const offset = before.width / 2;
      let changed = 0;
      for (let y = 1; y < before.height - 1; y++) {
        for (let x = 1; x < before.width - 1; x++) {
          const a = (y * before.width + x) * 4;
          const b = (y * after.width + x + offset) * 4;
          if (
            [0, 1, 2].some(
              (channel) =>
                Math.abs(before.data[a + channel] - after.data[b + channel]) >
                3,
            )
          )
            changed++;
        }
      }
      assert.ok(
        changed < before.width * before.height * 0.001,
        `Slide ${index}: ${changed} changed pixels`,
      );
      for (const range of [
        [0, offset - 1],
        [offset + before.width + 1, after.width - 1],
      ]) {
        for (let y = 5; y < after.height - 5; y += 13) {
          for (let x = range[0] + 2; x < range[1]; x += 13) {
            const i = (y * after.width + x) * 4;
            assert.ok(
              after.data[i] > 180 &&
                after.data[i + 1] > 180 &&
                after.data[i + 2] > 180,
              `Unexpected artwork in margin on page ${index}`,
            );
          }
        }
      }
      const originalPage = await original.getPage(index);
      const extendedPage = await extended.getPage(index);
      const textBefore = await originalPage.getTextContent();
      const textAfter = await extendedPage.getTextContent();
      assert.deepEqual(
        textAfter.items.map((item) => item.str),
        textBefore.items.map((item) => item.str),
      );
      const linksBefore = await originalPage.getAnnotations();
      const linksAfter = await extendedPage.getAnnotations();
      assert.equal(linksAfter[0].url, "https://example.org/lecture");
      assert.deepEqual(linksAfter[0].rect, linksBefore[0].rect);
      const oldRect = viewportRect(originalPage, linksBefore[0].rect);
      const newRect = viewportRect(extendedPage, linksAfter[0].rect);
      assert.deepEqual(
        newRect,
        oldRect.map((value, i) => value + (i % 2 === 0 ? offset : 0)),
      );
    }
    const metadata = await PDFDocument.load(output, { updateMetadata: false });
    assert.equal(metadata.getAuthor(), "Original lecturer");
    await original.loadingTask.destroy();
    await extended.loadingTask.destroy();
  });
}

test("grid is proportional and square when page dimensions double", async () => {
  const docs = [];
  for (const scale of [1, 2]) {
    docs.push(
      await open(
        await extendPdf(await lectureFixture({ scale, allRotations: false }), {
          tone: "dark",
        }),
      ),
    );
  }
  const first = await render(docs[0], 1);
  const second = await render(docs[1], 1, 0.5);
  assert.equal(first.width, second.width);
  assert.equal(first.height, second.height);
  let changed = 0;
  const starts = [];
  let inLine = false;
  for (let y = 2; y < first.height - 2; y++) {
    const idx = (y * first.width + 1001) * 4;
    const dark = first.data[idx] < 245;
    if (dark && !inLine) starts.push(y);
    inLine = dark;
    for (let x = 961; x < first.width - 1; x++) {
      const pixel = (y * first.width + x) * 4;
      if (Math.abs(first.data[pixel] - second.data[pixel]) > 1) changed++;
    }
  }
  assert.ok(changed < 10, `${changed} proportional grid pixels differ`);
  assert.ok(
    starts.length >= 39 && starts.length <= 43,
    `${starts.length} horizontal grid rules`,
  );
  const verticalStarts = [];
  inLine = false;
  for (let x = 963; x < first.width - 2; x++) {
    const dark = first.data[(101 * first.width + x) * 4] < 245;
    if (dark && !inLine) verticalStarts.push(x);
    inLine = dark;
  }
  const spacing = (values) => (values.at(-1) - values[0]) / (values.length - 1);
  assert.ok(
    Math.abs(spacing(starts) - spacing(verticalStarts)) < 0.1,
    "Cells must be square",
  );
  for (const doc of docs) await doc.loadingTask.destroy();
});

test("blank pages, mixed dimensions and user units remain usable", async () => {
  const doc = await PDFDocument.load(await lectureFixture({ blank: true }));
  doc.addPage([595.28, 841.89]);
  doc.getPage(0).node.set(PDFName.of("UserUnit"), PDFNumber.of(2));
  const result = await open(await extendPdf(await doc.save()));
  assert.equal(result.numPages, 5);
  assert.equal((await result.getPage(1)).userUnit, 2);
  const portrait = await result.getPage(5);
  const viewport = portrait.getViewport({ scale: 1 });
  assert.ok(Math.abs(viewport.width - 595.28 * 2.5) < 0.001);
  assert.equal(viewport.height, 841.89);
  await render(result, 2);
  await result.loadingTask.destroy();
});

test("bad inputs fail clearly, while ZIP names are safe and collision-free", async () => {
  await assert.rejects(
    extendPdf(new TextEncoder().encode("not a PDF")),
    /Could not read this PDF/,
  );
  await assert.rejects(
    extendPdf(new Uint8Array(), { divisions: 0 }),
    /Grid density/,
  );
  const names = new Set();
  const first = outputName("Lecture.PDF", names);
  const second = outputName("lecture.pdf", names);
  assert.equal(first, "Lecture-notes.pdf");
  assert.equal(second, "lecture-notes (2).pdf");
  assert.equal(outputName("../bad:name.pdf"), ".._bad_name-notes.pdf");
  const data = await extendPdf(await lectureFixture({ allRotations: false }));
  const archive = makeArchive([
    { name: first, bytes: data },
    { name: second, bytes: data },
  ]);
  const unpacked = unzipSync(archive);
  assert.deepEqual(Object.keys(unpacked), [first, second]);
  assert.deepEqual(unpacked[first], data);
});
