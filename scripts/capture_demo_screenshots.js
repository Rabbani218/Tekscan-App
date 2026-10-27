/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Skrip penangkap tangkapan layar otomatis untuk 3 status mode demo TEKSCAN dan Control Panel.
 * Menghasilkan:
 * - docs/demo/status_defect.png
 * - docs/demo/status_uncertain.png
 * - docs/demo/status_clean.png
 * - docs/demo/control_panel.png
 */

const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");

// Valid JPEG minimal 100x100
const SAMPLE_JPEG_B64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCABkAGQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD0iiivM/FfivW9N8S3dpaXvlwR7NqeUhxlFJ5Iz1JpN2LhBzdkemUV41/wnXiT/oI/+QI//iaP+E68Sf8AQR/8gR//ABNTzo1+rT7o9lorxr/hOvEn/QR/8gR//E0f8J14k/6CP/kCP/4mjnQfVp90ey0VzPgbVr3WNFmuL+fzpVuGQNsVfl2qccAeprpqpO5jKLi7MKKKKZIUUUUAFFFFABXjXjr/AJHK/wD+2f8A6LWvZa8a8df8jlf/APbP/wBFrUT2OjDfG/Q52iiiszuCiiigD1T4af8AIuXH/X23/oCV2dcZ8NP+RcuP+vtv/QErs62jsebW+NhRRRTMwooooAKKKKACvGvHX/I5X/8A2z/9FrXsteNeOv8Akcr/AP7Z/wDotaiex0Yb436HO0UUVmdwUUUUAeqfDT/kXLj/AK+2/wDQErs64z4af8i5cf8AX23/AKAldnW0djza3xsKKKKZmFFFFABRRRQAVzOreBtM1jU5r+4nu1ll27hG6heABxlT6V01FJq5UZOLujjP+FaaN/z83/8A38T/AOJo/wCFaaN/z83/AP38T/4muzoo5UV7Wfc4z/hWmjf8/N//AN/E/wDiaP8AhWmjf8/N/wD9/E/+Jrs6KOVB7WfczND0O28P2T2lpJM8byGQmUgnJAHYD0FadFFMhtt3YUUUUCCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//Z";

async function main() {
  const root = path.resolve(__dirname, "..");
  const demoDir = path.join(root, "docs", "demo");
  if (!fs.existsSync(demoDir)) fs.mkdirSync(demoDir, { recursive: true });

  console.log("Meluncurkan browser Edge...");
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  console.log("Membuka aplikasi TEKSCAN di http://localhost:3000 ...");
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

  // Pastikan spanduk demo muncul
  const demoBanner = page.locator("#demo-banner");
  await demoBanner.waitFor({ state: "visible", timeout: 10000 });
  console.log("✓ Spanduk MODE DEMO terdeteksi.");

  const cases = [
    {
      name: "defect",
      btnId: "#demo-case-defect",
      expectedStatus: "CACAT TERDETEKSI",
      file: "status_defect.png",
      sampleName: "sampel_kain_cacat.jpg",
    },
    {
      name: "uncertain",
      btnId: "#demo-case-uncertain",
      expectedStatus: "PERLU VERIFIKASI MANUAL",
      file: "status_uncertain.png",
      sampleName: "sampel_kain_verifikasi.jpg",
    },
    {
      name: "clean",
      btnId: "#demo-case-clean",
      expectedStatus: "TIDAK ADA CACAT",
      file: "status_clean.png",
      sampleName: "sampel_kain_bersih.jpg",
    },
  ];

  for (const c of cases) {
    console.log(`\n--- Menguji Kasus: ${c.name} (${c.expectedStatus}) ---`);
    await page.click(c.btnId);
    await page.waitForTimeout(300);

    // Unggah gambar
    const fileInput = page.locator("#file-input");
    await fileInput.setInputFiles({
      name: c.sampleName,
      mimeType: "image/jpeg",
      buffer: Buffer.from(SAMPLE_JPEG_B64, "base64"),
    });

    // Tunggu status sesuai
    const statusBanner = page.locator("#status-banner");
    await statusBanner.waitFor({ state: "visible" });
    await page.waitForFunction(
      ({ selector, expected }) => {
        const el = document.querySelector(selector);
        return el && el.textContent.includes(expected);
      },
      { selector: "#status-banner", expected: c.expectedStatus },
      { timeout: 15000 }
    );
    console.log(`✓ Status '${c.expectedStatus}' berhasil muncul.`);

    // Ambil tangkapan layar
    const outPath = path.join(demoDir, c.file);
    await page.screenshot({ path: outPath, fullPage: true });
    console.log(`✓ Tangkapan layar disimpan ke: ${outPath} (${fs.statSync(outPath).size} bytes)`);
  }

  // Ambil tangkapan layar Control Panel
  console.log("\n--- Mengambil Tangkapan Layar Control Panel ---");
  await page.click("#open-control-panel");
  await page.waitForTimeout(700);
  const cpPath = path.join(demoDir, "control_panel.png");
  await page.screenshot({ path: cpPath, fullPage: true });
  console.log(`✓ Tangkapan layar Control Panel disimpan ke: ${cpPath} (${fs.statSync(cpPath).size} bytes)`);

  await browser.close();
  console.log("\nSemua tangkapan layar mode demo dan Control Panel berhasil diambil!");
}

main().catch((err) => {
  console.error("Gagal mengambil tangkapan layar:", err);
  process.exit(1);
});
