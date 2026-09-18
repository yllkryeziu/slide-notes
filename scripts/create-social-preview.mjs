import { createCanvas } from "@napi-rs/canvas";
import { writeFile } from "node:fs/promises";

// A diagram of the actual layout, for link previews. No PDF contents are used.
const canvas = createCanvas(1200, 630);
const context = canvas.getContext("2d");
context.fillStyle = "#ffffff";
context.fillRect(0, 0, 1200, 630);
context.fillStyle = "#666666";
context.font = "24px sans-serif";
context.fillText("Slide Notes", 72, 74);
context.fillStyle = "#202020";
context.font = "bold 54px sans-serif";
context.fillText("Add grid paper to PDFs", 72, 155);
context.fillStyle = "#666666";
context.font = "24px sans-serif";
context.fillText("Free. No uploads. Batch PDF downloads.", 72, 203);

const x = 72;
const y = 268;
const width = 1056;
const height = 230;
const slideWidth = width / 2.5;
const leftWidth = slideWidth / 2;
const spacing = height / 42;
context.strokeStyle = "#ccd9d6";
context.lineWidth = 0.6;
for (const [start, panelWidth, direction] of [
  [x + leftWidth, leftWidth, -1],
  [x + leftWidth + slideWidth, slideWidth, 1],
]) {
  context.beginPath();
  for (let offset = spacing; offset < panelWidth; offset += spacing) {
    context.moveTo(start + direction * offset, y);
    context.lineTo(start + direction * offset, y + height);
  }
  for (let offset = spacing; offset < height; offset += spacing) {
    context.moveTo(start, y + offset);
    context.lineTo(start + direction * panelWidth, y + offset);
  }
  context.stroke();
}
context.fillStyle = "#f6f6f6";
context.fillRect(x + leftWidth, y, slideWidth, height);
context.strokeStyle = "#e6e6e6";
context.lineWidth = 1;
context.strokeRect(x, y, width, height);
context.fillStyle = "#888888";
context.font = "26px sans-serif";
context.textAlign = "center";
context.fillText(
  "Your PDF",
  x + leftWidth + slideWidth / 2,
  y + height / 2 + 9,
);
context.font = "19px sans-serif";
context.fillText("½ width", x + leftWidth / 2, 537);
context.fillText("Original slide", x + leftWidth + slideWidth / 2, 537);
context.fillText("1 × width", x + leftWidth + slideWidth * 1.5, 537);
context.textAlign = "right";
context.font = "17px sans-serif";
context.fillText("yllkryeziu.github.io/slide-notes", 1128, 593);
await writeFile(
  new URL("../public/social-preview.png", import.meta.url),
  canvas.toBuffer("image/png"),
);
