import { test, expect } from "@playwright/test";

test.describe("TEKSCAN E2E Tests", () => {
  test("unggah gambar menampilkan status dan visual deteksi", async ({ page }) => {
    await page.route(/.*\/health/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ok",
          models: { yolo: "tekscan_yolo.onnx", resnet: "resnet50.onnx" },
          load_time_ms: 120.5,
          classes: { yolo: ["defect_free", "hole", "stain"], resnet50: ["defect_free", "hole", "stain"] },
        }),
      });
    });

    const realJpgB64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCABkAGQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD0iiivM/FfivW9N8S3dpaXvlwR7NqeUhxlFJ5Iz1JpN2LhBzdkemUV41/wnXiT/oI/+QI//iaP+E68Sf8AQR/8gR//ABNTzo1+rT7o9lorxr/hOvEn/QR/8gR//E0f8J14k/6CP/kCP/4mjnQfVp90ey0VzPgbVr3WNFmuL+fzpVuGQNsVfl2qccAeprpqpO5jKLi7MKKKKZIUUUUAFFFFABXjXjr/AJHK/wD+2f8A6LWvZa8a8df8jlf/APbP/wBFrUT2OjDfG/Q52iiiszuCiiigD1T4af8AIuXH/X23/oCV2dcZ8NP+RcuP+vtv/QErs62jsebW+NhRRRTMwooooAKKKKACvGvHX/I5X/8A2z/9FrXsteNeOv8Akcr/AP7Z/wDotaiex0Yb436HO0UUVmdwUUUUAeqfDT/kXLj/AK+2/wDQErs64z4af8i5cf8AX23/AKAldnW0djza3xsKKKKZmFFFFABRRRQAVzOreBtM1jU5r+4nu1ll27hG6heABxlT6V01FJq5UZOLujjP+FaaN/z83/8A38T/AOJo/wCFaaN/z83/AP38T/4muzoo5UV7Wfc4z/hWmjf8/N//AN/E/wDiaP8AhWmjf8/N/wD9/E/+Jrs6KOVB7WfczND0O28P2T2lpJM8byGQmUgnJAHYD0FadFFMhtt3YUUUUCCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//Z";

    await page.route(/.*\/predict.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "CACAT TERDETEKSI",
          statuses: { yolo: "CACAT TERDETEKSI" },
          model: "yolo",
          detections: [
            { class: "hole", class_id: 1, score: 0.92, box: [10, 10, 80, 80] },
          ],
          classification: null,
          latency_ms: 45.2,
          image: { w: 640, h: 640 },
          annotated_image_base64: realJpgB64,
        }),
      });
    });

    await page.goto("/");

    // 1. Verifikasi judul halaman dan badge status server
    await expect(page).toHaveTitle(/TEKSCAN/);
    const badge = page.locator("#server-badge");
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("Server siap");

    // 2. Unggah berkas ke input file
    const fileInput = page.locator("#file-input");
    await fileInput.setInputFiles({
      name: "test_fabric.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from(realJpgB64, "base64"),
    });

    // 3. Verifikasi status banner terupdate menjadi 'CACAT TERDETEKSI'
    const statusBanner = page.locator("#status-banner");
    await expect(statusBanner).toContainText("CACAT TERDETEKSI");

    // 4. Verifikasi latensi dan list deteksi muncul
    const latency = page.locator("#latency");
    await expect(latency).toBeVisible();
    await expect(latency).toContainText("45 ms");

    const detList = page.locator("#detections");
    await expect(detList).toBeVisible();
    await expect(detList).toContainText("hole");
    await expect(detList).toContainText("92.0%");
  });

  test("mode demo menampilkan spanduk merah tetap dan kontrol kasus uji", async ({ page }) => {
    await page.route(/.*\/health/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ok",
          model_mode: "demo",
          demo: true,
          models: { yolo: "tekscan_yolo_demo.onnx", resnet: "resnet50_demo.onnx" },
          load_time_ms: 12.0,
          classes: { yolo: ["defect_free", "hole", "lines"], resnet50: ["defect_free", "hole", "lines"] },
        }),
      });
    });

    await page.route(/.*\/predict.*/, async (route) => {
      const sampleB64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          demo: true,
          model_mode: "demo",
          status: "CACAT TERDETEKSI",
          statuses: { yolo: "CACAT TERDETEKSI" },
          model: "yolo",
          detections: [
            { class: "hole", class_id: 1, score: 0.92, box: [150, 70, 250, 170] },
          ],
          classification: null,
          latency_ms: 15.0,
          image: { w: 640, h: 480 },
          annotated_image_base64: sampleB64,
        }),
      });
    });

    await page.goto("/");

    // 1. Verifikasi spanduk merah tetap mode demo
    const demoBanner = page.locator("#demo-banner");
    await expect(demoBanner).toBeVisible();
    await expect(demoBanner).toContainText("MODE DEMO: model sementara, hasil BUKAN prediksi cacat sebenarnya");

    // 2. Verifikasi tombol pilihan simulasi status demo
    const defectBtn = page.locator("#demo-case-defect");
    const uncertainBtn = page.locator("#demo-case-uncertain");
    const cleanBtn = page.locator("#demo-case-clean");

    await expect(defectBtn).toBeVisible();
    await expect(uncertainBtn).toBeVisible();
    await expect(cleanBtn).toBeVisible();

    // 3. Verifikasi server badge melaporkan mode demo
    const badge = page.locator("#server-badge");
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("MODE DEMO");
  });

  test("membuka Control Panel, melihat status web, dan berpindah tab", async ({ page }) => {
    await page.route(/.*\/health/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ok",
          model_mode: "demo",
          demo: true,
          models: { yolo: "tekscan_yolo_demo.onnx", resnet: "resnet50_demo.onnx" },
          load_time_ms: 12.0,
          classes: { yolo: ["defect_free"], resnet50: ["defect_free"] },
        }),
      });
    });

    await page.route(/.*\/system\/status/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ok",
          model_mode: "demo",
          uptime_seconds: 120,
          diagnostics: {
            status: "healthy",
            resources: { cpu_percent: 15.0, ram_percent: 45.0, ram_total_gb: 16.0 },
            onnx: { providers: ["CPUExecutionProvider"], gpu_accelerated: false },
            database: { sqlite_local: true },
          },
        }),
      });
    });

    await page.route(/.*\/system\/web-status/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ok",
          web_status: {
            local_backend: { online: true, latency_ms: 12.5 },
          },
        }),
      });
    });

    await page.goto("/");

    // 1. Klik tombol buka control panel
    const openBtn = page.locator("#open-control-panel");
    await expect(openBtn).toBeVisible();

    // Ambil screenshot halaman utama tema terang sebelum membuka modal
    await page.screenshot({ path: "docs/demo/ui_light_theme.png", fullPage: true });

    await openBtn.click();

    // 2. Verifikasi modal terbuka
    const modalTitle = page.locator("text=Control Panel Pengaturan TEKSCAN");
    await expect(modalTitle).toBeVisible();

    // 3. Verifikasi tab Status Web aktif dan menampilkan status
    await expect(page.locator("text=Backend Lokal API")).toBeVisible();

    // Tunggu animasi modal selesai agar screenshot jernih dan solid
    await page.waitForTimeout(350);

    // Ambil screenshot modal Control Panel tema terang
    await page.screenshot({ path: "docs/demo/control_panel.png" });

    // 4. Tutup modal
    const closeBtn = page.locator("#close-control-panel");
    await closeBtn.click();
    await expect(modalTitle).not.toBeVisible();
  });
});
