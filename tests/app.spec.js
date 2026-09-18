import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { lectureFixture } from "./fixtures.js";

test("previews and exports a batch, preserving separate PDFs and skipping a corrupt file", async ({
  page,
}) => {
  const errors = [];
  const outgoing = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (
      !request.url().startsWith("http://127.0.0.1:4173") &&
      !request.url().startsWith("blob:") &&
      !request.url().startsWith("data:")
    )
      outgoing.push(request.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Add grid paper" }),
  ).toBeDisabled();
  await page.locator("#file-input").setInputFiles([
    {
      name: "Lecture.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await lectureFixture()),
    },
    {
      name: "lecture.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(
        await lectureFixture({ allRotations: false, cropped: true }),
      ),
    },
    {
      name: "broken.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("broken input"),
    },
  ]);
  await expect(page.locator("#preview-canvas")).toBeVisible();
  await expect(page.locator("#page-number")).toHaveText("1 / 4");
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator("#page-number")).toHaveText("2 / 4");
  await page.getByRole("button", { name: "Add grid paper" }).click();
  await expect(
    page.getByRole("link", { name: "Download all as ZIP" }),
  ).toBeVisible();
  await expect(page.locator("#result-summary")).toContainText("2 PDFs ready");
  await expect(page.locator("#result-summary")).toContainText(
    "1 could not be converted",
  );
  await expect(page.locator(".file-row.error")).toContainText(
    "Could not read this PDF",
  );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download all as ZIP" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("slide-notes.zip");
  const archive = unzipSync(await readFile(await download.path()));
  expect(Object.keys(archive)).toEqual([
    "Lecture-notes.pdf",
    "lecture-notes (2).pdf",
  ]);
  const result = await PDFDocument.load(archive["Lecture-notes.pdf"]);
  expect(result.getPageCount()).toBe(4);
  expect(result.getPage(0).getWidth()).toBe(1600);
  expect(result.getPage(0).getHeight()).toBe(400);
  expect(result.getAuthor()).toBe("Original lecturer");
  await expect(
    page.getByRole("link", { name: "Download Lecture-notes.pdf", exact: true }),
  ).toBeVisible();
  await page.locator("#grid-density").fill("32");
  await expect(page.locator("#download-area")).toBeHidden();
  await expect(page.locator("#grid-help")).toContainText("32 squares");
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page.locator("#demo-slide")).toBeVisible();
  await expect(page.locator("#file-list")).toBeEmpty();
  expect(errors).toEqual([]);
  expect(outgoing).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("drag and drop, duplicate selection, defined grid and a single PDF download", async ({
  page,
}) => {
  await page.goto("/");
  const bytes = [...(await lectureFixture({ allRotations: false }))];
  const transfer = await page.evaluateHandle((bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([new Uint8Array(bytes)], "Überblick.pdf", {
        type: "application/pdf",
        lastModified: 1,
      }),
    );
    transfer.items.add(
      new File(["ignore this"], "readme.txt", { type: "text/plain" }),
    );
    return transfer;
  }, bytes);
  await page
    .locator("#drop-zone")
    .dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.locator("#file-count")).toHaveText("1 PDF selected");
  await expect(page.locator("#selection-message")).toContainText("non-PDF");
  await page
    .locator("#drop-zone")
    .dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.locator("#file-count")).toHaveText("1 PDF selected");
  await expect(page.locator("#selection-message")).toContainText(
    "already selected",
  );
  await page.getByRole("radio", { name: "Defined" }).check();
  await page.getByRole("button", { name: "Add grid paper" }).click();
  const link = page.getByRole("link", { name: "Download Überblick-notes.pdf" });
  await expect(link).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await link.click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    "Überblick-notes.pdf",
  );
  await page.getByRole("button", { name: "Remove Überblick.pdf" }).click();
  await expect(page.locator("#download-area")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Add grid paper" }),
  ).toBeDisabled();
});
