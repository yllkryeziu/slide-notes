import {
  PDFDocument,
  PDFName,
  PDFString,
  StandardFonts,
  degrees,
  rgb,
} from "pdf-lib";

export async function lectureFixture({
  scale = 1,
  allRotations = true,
  cropped = false,
  blank = false,
} = {}) {
  const doc = await PDFDocument.create();
  doc.setTitle("Example lecture");
  doc.setAuthor("Original lecturer");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const rotations = allRotations ? [0, 90, 180, 270] : [0];
  for (const rotation of rotations) {
    const page = doc.addPage([640 * scale, 400 * scale]);
    page.setRotation(degrees(rotation));
    if (cropped)
      page.setCropBox(70 * scale, 40 * scale, 500 * scale, 300 * scale);
    if (blank) continue;
    page.drawRectangle({
      x: 0,
      y: 0,
      width: 640 * scale,
      height: 400 * scale,
      color: rgb(0.18, 0.28, 0.23),
    });
    page.drawRectangle({
      x: 12 * scale,
      y: 12 * scale,
      width: 20 * scale,
      height: 20 * scale,
      color: rgb(1, 0, 0),
    });
    page.drawText(`Lecture ${rotation}: room for notes`, {
      x: 85 * scale,
      y: 260 * scale,
      size: 24 * scale,
      font,
      color: rgb(1, 1, 1),
    });
    page.drawCircle({
      x: 435 * scale,
      y: 140 * scale,
      size: 36 * scale,
      color: rgb(0.77, 0.82, 0.63),
    });
    const link = doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [85, 255, 260, 285].map((value) => value * scale),
      Border: [0, 0, 0],
      A: {
        Type: "Action",
        S: "URI",
        URI: PDFString.of("https://example.org/lecture"),
      },
    });
    page.node.set(
      PDFName.of("Annots"),
      doc.context.obj([doc.context.register(link)]),
    );
  }
  return doc.save();
}
