# Slide Notes

Give a whole batch of lecture PDFs room for handwritten notes. Open the website, select your files, check the preview, and download a ZIP containing a separate `-notes.pdf` for each lecture.

**[Open Slide Notes](https://yllkryeziu.github.io/slide-notes/)**

Every page has this layout, with all sections the original page’s height:

```text
[ grid: ½ slide width ][ original slide ][ grid: 1 slide width ]
```

The original slide retains its size. The finished page is 2.5 times as wide. Grid squares scale with each page; the default is 42 squares along its shorter edge, matching the proportions of 5 mm squares on an A4 sheet. The square-size slider changes this density for the entire batch. Physical square size depends on the source PDF and print scaling.

## Using it

1. Drop in any number of PDFs or choose them in the file picker.
2. Click a filename to preview it. Use the arrows to inspect different pages.
3. Adjust square size or line contrast if needed.
4. Click **Make room for notes**, then **Download all as ZIP**. The arrows beside completed files download individual PDFs.

All processing happens on your device. No PDFs are uploaded, stored on a server, or sent to an analytics service. Fonts, preview assets and scripts are served with the site. Reloading clears the selection and results.

Pages are extended in place, keeping selectable text, vector artwork, links, annotations, bookmarks and the original PDF author metadata. Rotated, cropped, mixed-size and blank pages are supported. Previously cropped artwork stays clipped to the original slide area. Duplicate output names receive a numbered suffix. A corrupt or password-protected file is reported individually so the rest of the batch can finish. Export password-protected documents as unlocked PDFs before selecting them.

Large batches are limited by the memory available to your browser. Conversion runs in a worker to keep the interface responsive; **Cancel** stops it. Digital signatures cannot remain valid after a PDF is modified.

## Development

Requires Node.js 22.13 or later (Node 22 LTS recommended).

```sh
npm ci
npm run dev
```

Open the local URL printed in the terminal. To create a production build:

```sh
npm run build
npm run preview
```

The output is a static site in `dist/`. Relative asset paths support GitHub Pages project URLs.

## Verification

```sh
npm test
npx playwright install chromium webkit
npm run test:browser
```

PDF checks compare rendered slides before and after conversion at all four rotations, including cropped pages. They also verify selectable text, link targets and positions, author metadata, proportional square grids, blank pages, mixed page sizes, custom page units and ZIP contents. Browser checks exercise file selection, previews, batch export, per-file errors, Unicode filenames, duplicate names, drag and drop and individual downloads. They check that the app makes no requests to other origins.

## GitHub Pages

The included workflow tests and builds the app, then deploys it on every push to `main`. Set **Settings → Pages → Source** to **GitHub Actions** once for the repository.

Built with [pdf-lib](https://pdf-lib.js.org/), [PDF.js](https://mozilla.github.io/pdf.js/), [fflate](https://github.com/101arrowz/fflate), and [Vite](https://vite.dev/).

The self-hosted Newsreader typeface is licensed under the SIL Open Font License; see `public/fonts/OFL.txt`.
