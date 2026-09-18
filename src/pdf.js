import {
  PDFDocument,
  clip,
  concatTransformationMatrix,
  endPath,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  setLineWidth,
  setStrokingColor,
  stroke,
} from "pdf-lib";
import { zipSync } from "fflate";

export const DEFAULT_DIVISIONS = 42;

export function pageGeometry(page) {
  const media = page.getMediaBox();
  const crop = page.getCropBox();
  // Viewers display the intersection, even when a CropBox exceeds the MediaBox.
  const x = Math.max(media.x, crop.x);
  const y = Math.max(media.y, crop.y);
  const width = Math.min(media.x + media.width, crop.x + crop.width) - x;
  const height = Math.min(media.y + media.height, crop.y + crop.height) - y;
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  if (
    ![x, y, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error("This PDF contains a page with invalid dimensions.");
  }
  if (![0, 90, 180, 270].includes(rotation)) {
    throw new Error("This PDF uses an unsupported page rotation.");
  }
  const sideways = rotation === 90 || rotation === 270;
  return {
    x,
    y,
    width,
    height,
    rotation,
    displayWidth: sideways ? height : width,
    displayHeight: sideways ? width : height,
  };
}

function gridPanel(page, x, width, height, spacing, tone) {
  page.pushOperators(
    pushGraphicsState(),
    rectangle(x, 0, width, height),
    clip(),
    endPath(),
  );
  page.drawRectangle({ x, y: 0, width, height, color: rgb(1, 1, 1) });
  const shade = tone === "dark" ? rgb(0.65, 0.72, 0.71) : rgb(0.8, 0.85, 0.84);
  const operators = [setStrokingColor(shade), setLineWidth(spacing * 0.02)];
  // Start each grid at the slide edge; horizontal rules align across both panels.
  const edge = x < 0 ? 0 : x;
  const direction = x < 0 ? -1 : 1;
  for (let i = 1; i * spacing < width; i++) {
    const column = edge + direction * i * spacing;
    operators.push(moveTo(column, 0), lineTo(column, height));
  }
  for (let i = 1; i * spacing < height; i++) {
    const row = height - i * spacing;
    operators.push(moveTo(x, row), lineTo(x + width, row));
  }
  operators.push(stroke(), popGraphicsState());
  page.pushOperators(...operators);
}

export async function extendPdf(
  data,
  { divisions = DEFAULT_DIVISIONS, tone = "light", onProgress } = {},
) {
  if (!Number.isInteger(divisions) || divisions < 20 || divisions > 70) {
    throw new Error("Grid density must be between 20 and 70 squares.");
  }
  let doc;
  try {
    doc = await PDFDocument.load(data, { updateMetadata: false });
  } catch (error) {
    if (/encrypt|password/i.test(String(error))) {
      throw new Error(
        "Password-protected PDF. Export an unlocked copy and try again.",
      );
    }
    throw new Error("Could not read this PDF. Try exporting a fresh copy.");
  }
  const pages = doc.getPages();
  if (!pages.length) throw new Error("This PDF has no pages.");
  for (const [index, page] of pages.entries()) {
    const {
      x,
      y,
      width: w,
      height: h,
      rotation,
      displayWidth: W,
      displayHeight: H,
    } = pageGeometry(page);
    const spacing = Math.min(W, H) / divisions;
    if ((1.5 * W + 2 * H) / spacing > 20000) {
      throw new Error("This page is too wide or tall to add a usable grid.");
    }

    // Keep the original page and its coordinate system: text, links, annotations,
    // page references and bookmarks do not need to be recreated or rasterized.
    // Clip existing content so previously cropped artwork stays out of the notes.
    page.node.normalize();
    const opening = doc.context.register(
      doc.context.contentStream([
        pushGraphicsState(),
        rectangle(x, y, w, h),
        clip(),
        endPath(),
      ]),
    );
    const closing = doc.context.register(
      doc.context.contentStream([popGraphicsState()]),
    );
    page.node.wrapContentStreams(opening, closing);

    const transforms = {
      0: [1, 0, 0, 1, x, y],
      90: [0, 1, -1, 0, x + w, y],
      180: [-1, 0, 0, -1, x + w, y + h],
      270: [0, -1, 1, 0, x, y + h],
    };
    const bounds = {
      0: [x - w / 2, y, w * 2.5, h],
      90: [x, y - h / 2, w, h * 2.5],
      180: [x - w, y, w * 2.5, h],
      270: [x, y - h, w, h * 2.5],
    }[rotation];
    page.setMediaBox(...bounds);
    page.setCropBox(...bounds);
    page.setTrimBox(...bounds);
    page.setBleedBox(...bounds);
    page.setArtBox(...bounds);
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(...transforms[rotation]),
    );
    gridPanel(page, -W / 2, W / 2, H, spacing, tone);
    gridPanel(page, W, W, H, spacing, tone);
    page.pushOperators(popGraphicsState());
    onProgress?.(index + 1, pages.length);
  }
  return doc.save({ updateFieldAppearances: false });
}

export function outputName(filename, used = new Set()) {
  const base =
    filename
      .replace(/\.pdf$/i, "")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .trim() || "lecture";
  let name = `${base}-notes.pdf`;
  let counter = 2;
  while (used.has(name.toLowerCase()))
    name = `${base}-notes (${counter++}).pdf`;
  used.add(name.toLowerCase());
  return name;
}

export function makeArchive(outputs) {
  const entries = Object.create(null);
  for (const { name, bytes } of outputs) entries[name] = bytes;
  // PDF streams are already compressed; store them to keep batch exports fast.
  return zipSync(entries, { level: 0 });
}
