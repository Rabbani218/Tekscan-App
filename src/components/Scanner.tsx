"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  API_URL,
  ACCEPTED_TYPES,
  ApiError,
  health,
  predict,
  smoothStatus,
  STATUS_CLEAN,
  STATUS_DEFECT,
  STATUS_VERIFY,
  validateFile,
  type HealthResponse,
  type ModelChoice,
  type PredictResponse,
  type ScanStatus,
  type DemoCase,
} from "@/lib/api";
import styles from "./Scanner.module.css";

const MODEL_OPTIONS: { value: ModelChoice; label: string; hint: string; badge?: string }[] = [
  { value: "yolo", label: "YOLO11s", hint: "Deteksi lokasi & kotak cacat tekstil (6 kelas)", badge: "Deteksi Aktif" },
  { value: "resnet", label: "ResNet50", hint: "Klasifikasi jenis cacat & kain bersih (7 kelas)", badge: "Klasifikasi Aktif" },
  { value: "both", label: "Keduanya", hint: "Bandingkan YOLO11s dan ResNet50 sekaligus", badge: "Komparasi Aktif" },
];

const CLASS_LABEL_ID: Record<string, string> = {
  defect_free: "Bebas Cacat",
  stain: "Noda",
  hole: "Lubang",
  tear: "Sobek",
  line: "Garis",
  lines: "Garis",
  horizontal: "Garis Horizontal",
  vertical: "Garis Vertikal",
};

const CLASS_COLOR: Record<string, string> = {
  stain: "#dc2626",
  hole: "#f59e0b",
  tear: "#10b981",
  line: "#9333ea",
  lines: "#9333ea",
  horizontal: "#2563eb",
  vertical: "#ec4899",
  defect_free: "#059669",
};

const YOLO_6_CLASSES = ["stain", "hole", "tear", "line", "horizontal", "vertical"] as const;
const RESNET_7_CLASSES = ["defect_free", "stain", "hole", "tear", "line", "horizontal", "vertical"] as const;

type ServerState =
  | { kind: "checking" }
  | { kind: "waking"; attempt: number; total: number }
  | { kind: "ready"; info: HealthResponse }
  | { kind: "down"; message: string };

interface UiError {
  kind: ApiError["kind"] | "camera" | "unknown";
  message: string;
}

function statusClass(s: ScanStatus | null | undefined): string {
  if (s === STATUS_DEFECT) return styles.statusDefect;
  if (s === STATUS_VERIFY) return styles.statusVerify;
  if (s === STATUS_CLEAN) return styles.statusClean;
  return styles.statusIdle;
}

function toUiError(err: unknown): UiError {
  if (err instanceof ApiError) return { kind: err.kind, message: err.message };
  if (err instanceof DOMException && err.name === "AbortError") return { kind: "unknown", message: "Dibatalkan." };
  return { kind: "unknown", message: err instanceof Error ? err.message : String(err) };
}

async function saveScan(
  r: PredictResponse,
  source: "upload" | "camera",
  fileName?: string,
): Promise<"saved" | "disabled" | "error"> {
  try {
    const res = await fetch("/api/scans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source,
        model: r.model,
        status: r.status,
        detections: r.detections,
        classification: r.classification,
        latency_ms: r.latency_ms,
        image: r.image,
        file_name: fileName,
        is_demo: Boolean(r.demo),
      }),
    });
    if (res.status === 503) return "disabled";
    return res.ok ? "saved" : "error";
  } catch {
    return "error";
  }
}

export default function Scanner() {
  const [model, setModel] = useState<ModelChoice>("yolo");
  const [mode, setMode] = useState<"upload" | "camera">("upload");
  const [demoCase, setDemoCase] = useState<DemoCase>("defect");
  const [server, setServer] = useState<ServerState>({ kind: "checking" });
  const [busy, setBusy] = useState(false);
  const [wakeMsg, setWakeMsg] = useState<string | null>(null);
  const [error, setError] = useState<UiError | null>(null);
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dbState, setDbState] = useState<"unknown" | "saved" | "disabled" | "error">("unknown");
  const [historyKey, setHistoryKey] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const lastFileRef = useRef<File | null>(null);

  // kamera
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runningRef = useRef(false);
  const statusHistory = useRef<ScanStatus[]>([]);
  const [cameraOn, setCameraOn] = useState(false);
  const [smoothed, setSmoothed] = useState<ScanStatus | null>(null);
  const [frames, setFrames] = useState(0);

  const onWaiting = useCallback((attempt: number, total: number) => {
    setWakeMsg(`Menyiapkan server… (percobaan ulang ${attempt}/${total}, tiap 5 detik)`);
  }, []);

  const checkServer = useCallback(async () => {
    setServer({ kind: "checking" });
    try {
      const info = await health((attempt, total) => setServer({ kind: "waking", attempt, total }));
      setServer({ kind: "ready", info });
    } catch (err) {
      setServer({ kind: "down", message: toUiError(err).message });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- memulai cek kesehatan server saat mount
    void checkServer();
  }, [checkServer]);

  const isDemo = (server.kind === "ready" && Boolean(server.info.demo)) || Boolean(result?.demo);

  const handleFile = useCallback(
    async (file: File | undefined | null, overrideModel?: ModelChoice) => {
      if (!file) return;
      const activeModel = overrideModel ?? model;
      setError(null);
      setFileName(file.name);
      try {
        validateFile(file);
      } catch (err) {
        setError(toUiError(err));
        return;
      }
      if (lastFileRef.current !== file) {
        lastFileRef.current = file;
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(file);
        });
      }
      setBusy(true);
      setWakeMsg(null);
      try {
        const r = await predict(file, activeModel, {
          onWaiting,
          demoCase: isDemo ? demoCase : undefined,
        });
        setResult(r);
        if (server.kind !== "ready") void checkServer();
        void saveScan(r, "upload", file.name).then((saved) => {
          setDbState(saved);
          if (saved === "saved") setHistoryKey((k) => k + 1);
        });
      } catch (err) {
        setError(toUiError(err));
      } finally {
        setBusy(false);
        setWakeMsg(null);
      }
    },
    [model, onWaiting, server.kind, checkServer, isDemo, demoCase],
  );

  const handleModelSelect = (nextModel: ModelChoice) => {
    setModel(nextModel);
    if (lastFileRef.current && mode === "upload" && !busy) {
      void handleFile(lastFileRef.current, nextModel);
    }
  };

  // ---------------- kamera ----------------
  const stopCamera = useCallback(() => {
    runningRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    setResult(null);
    statusHistory.current = [];
    setSmoothed(null);
    setFrames(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      setCameraOn(true);
      runningRef.current = true;
      const canvas = document.createElement("canvas");
      while (runningRef.current) {
        const t0 = performance.now();
        if (v.videoWidth > 0) {
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          canvas.getContext("2d")!.drawImage(v, 0, 0);
          const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.9));
          if (blob && runningRef.current) {
            try {
              const r = await predict(blob, model, {
                onWaiting,
                demoCase: isDemo ? demoCase : undefined,
              });
              setWakeMsg(null);
              if (!runningRef.current) break;
              statusHistory.current = [...statusHistory.current, r.status].slice(-5);
              setSmoothed(smoothStatus(statusHistory.current));
              setResult(r);
              setFrames((n) => n + 1);
            } catch (err) {
              setError(toUiError(err));
              stopCamera();
              break;
            }
          }
        }
        const wait = Math.max(0, 700 - (performance.now() - t0));
        await new Promise((r) => setTimeout(r, wait));
      }
    } catch (err) {
      const e = err as DOMException;
      setError({
        kind: "camera",
        message:
          e?.name === "NotAllowedError"
            ? "Izin kamera ditolak. Izinkan akses kamera di browser."
            : e?.name === "NotFoundError"
              ? "Kamera tidak ditemukan."
              : `Kamera tidak dapat dibuka: ${e?.message ?? String(err)}`,
      });
      stopCamera();
    }
  }, [model, onWaiting, stopCamera, isDemo, demoCase]);

  useEffect(() => stopCamera, [stopCamera]);

  const switchMode = (m: "upload" | "camera") => {
    if (m === mode) return;
    stopCamera();
    setResult(null);
    setError(null);
    setMode(m);
  };

  const shownStatus: ScanStatus | null = mode === "camera" ? smoothed ?? null : result?.status ?? null;

  return (
    <section className={styles.wrap} aria-label="Pemindai kain">
      {/* SPANDUK MERAH MODE DEMO TETAP */}
      {isDemo && (
        <div id="demo-banner" className={styles.demoBanner} role="alert">
          <span className={styles.demoIcon} aria-hidden>⚠️</span>
          <div>
            <strong>MODE DEMO:</strong> model sementara, hasil <u>BUKAN</u> prediksi cacat sebenarnya. Seluruh jalur praproses, ONNX decode, NMS, dan integrasi sedang diuji.
          </div>
        </div>
      )}

      <div className={styles.topBar}>
        <ServerBadge server={server} onRetry={checkServer} />
      </div>

      {/* KONTROL KASUS UJI DEMO */}
      {isDemo && (
        <div className={styles.demoCaseBox} role="toolbar" aria-label="Simulasi Status Demo">
          <span className={styles.demoCaseLabel}>Kasus Uji Status:</span>
          <div className={styles.demoCaseGroup}>
            <button
              id="demo-case-defect"
              type="button"
              className={`${styles.demoCaseBtn} ${demoCase === "defect" ? styles.demoCaseActiveDefect : ""}`}
              onClick={() => setDemoCase("defect")}
            >
              Cacat (Skor 0.92 → CACAT TERDETEKSI)
            </button>
            <button
              id="demo-case-uncertain"
              type="button"
              className={`${styles.demoCaseBtn} ${demoCase === "uncertain" ? styles.demoCaseActiveVerify : ""}`}
              onClick={() => setDemoCase("uncertain")}
            >
              Ragu (Skor 0.38 → PERLU VERIFIKASI)
            </button>
            <button
              id="demo-case-clean"
              type="button"
              className={`${styles.demoCaseBtn} ${demoCase === "clean" ? styles.demoCaseActiveClean : ""}`}
              onClick={() => setDemoCase("clean")}
            >
              Bersih (Skor 0.10 → TIDAK ADA CACAT)
            </button>
          </div>
        </div>
      )}

      <div className={styles.controls}>
        <div className={styles.segment} role="tablist" aria-label="Mode input">
          <button id="mode-upload" role="tab" aria-selected={mode === "upload"} className={mode === "upload" ? styles.segActive : ""} onClick={() => switchMode("upload")}>
            Unggah gambar
          </button>
          <button id="mode-camera" role="tab" aria-selected={mode === "camera"} className={mode === "camera" ? styles.segActive : ""} onClick={() => switchMode("camera")}>
            Kamera langsung
          </button>
        </div>

        <fieldset className={styles.models} disabled={cameraOn || busy}>
          <legend>Model</legend>
          {MODEL_OPTIONS.map((o) => (
            <label key={o.value} className={`${styles.modelCard} ${model === o.value ? styles.modelActive : ""}`}>
              <input id={`model-${o.value}`} type="radio" name="model" value={o.value} checked={model === o.value} onChange={() => handleModelSelect(o.value)} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                <span className={styles.modelName}>{o.label}</span>
                {o.badge && (
                  <span style={{ fontSize: "0.65rem", padding: "2px 6px", borderRadius: "4px", background: model === o.value ? "#dbeafe" : "#f1f5f9", color: model === o.value ? "#1e40af" : "#475569", fontWeight: 600 }}>
                    {o.badge}
                  </span>
                )}
              </div>
              <span className={styles.modelHint}>{o.hint}</span>
            </label>
          ))}
        </fieldset>
      </div>

      <div className={styles.grid}>
        <div className={styles.stage}>
          {mode === "upload" ? (
            <label
              htmlFor="file-input"
              className={`${styles.drop} ${dragOver ? styles.dropOver : ""} ${busy ? styles.dropBusy : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void handleFile(e.dataTransfer.files?.[0]);
              }}
            >
              <input
                id="file-input"
                type="file"
                accept={ACCEPTED_TYPES.join(",")}
                className={styles.hidden}
                disabled={busy}
                onChange={(e) => {
                  void handleFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {result?.annotated_image_base64 ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL dari backend
                <img id="annotated-image" className={styles.preview} src={`data:image/jpeg;base64,${result.annotated_image_base64}`} alt={`Hasil anotasi ${fileName ?? ""}`} />
              ) : previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- blob URL lokal
                <img className={styles.preview} src={previewUrl} alt={`Pratinjau ${fileName ?? ""}`} />
              ) : (
                <div className={styles.dropHint}>
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                    <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                  </svg>
                  <strong>Tarik gambar kain ke sini</strong>
                  <span>atau klik untuk memilih · JPG, PNG, WEBP</span>
                </div>
              )}
              {busy && (
                <div className={styles.overlay} role="status">
                  <span className={styles.spinner} />
                  <span>{wakeMsg ?? "Menganalisis…"}</span>
                </div>
              )}
            </label>
          ) : (
            <div className={styles.cameraBox}>
              <video ref={videoRef} className={`${styles.video} ${result?.annotated_image_base64 && cameraOn ? styles.hidden : ""}`} muted playsInline />
              {cameraOn && result?.annotated_image_base64 && (
                // eslint-disable-next-line @next/next/no-img-element -- data URL dari backend
                <img id="annotated-image" className={styles.preview} src={`data:image/jpeg;base64,${result.annotated_image_base64}`} alt="Bingkai kamera beranotasi" />
              )}
              {!cameraOn && <div className={styles.dropHint}><strong>Kamera mati</strong><span>Tekan tombol di bawah untuk mulai</span></div>}
              {wakeMsg && cameraOn && (
                <div className={styles.overlay} role="status">
                  <span className={styles.spinner} />
                  <span>{wakeMsg}</span>
                </div>
              )}
              <div className={styles.cameraBar}>
                <button id="camera-toggle" className={styles.primaryBtn} onClick={() => (cameraOn ? stopCamera() : void startCamera())}>
                  {cameraOn ? "Hentikan" : "Mulai kamera"}
                </button>
                {cameraOn && <span className={styles.muted}>{frames} bingkai · pemulusan 3 dari 5</span>}
              </div>
            </div>
          )}
        </div>

        <aside className={styles.panel} aria-live="polite">
          <div id="status-banner" className={`${styles.status} ${statusClass(shownStatus)}`} data-status={shownStatus ?? ""}>
            <span className={styles.statusDot} />
            <div>
              <div className={styles.statusLabel}>{mode === "camera" ? "Status (dimuluskan)" : "Status"}</div>
              <div className={styles.statusText}>{shownStatus ?? (busy ? "Menganalisis…" : "Belum ada hasil")}</div>
            </div>
          </div>

          {error && (
            <div id="error-box" className={styles.error} role="alert" data-kind={error.kind}>
              <strong>
                {error.kind === "invalid_file"
                  ? "Berkas tidak valid"
                  : error.kind === "network"
                    ? "Gagal terhubung"
                    : error.kind === "cold_start"
                      ? "Server belum siap"
                      : error.kind === "camera"
                        ? "Kamera"
                        : "Terjadi kesalahan"}
              </strong>
              <p>{error.message}</p>
            </div>
          )}

          {result && (
            <>
              <div className={styles.metrics}>
                <div>
                  <span className={styles.metricLabel}>Latensi model</span>
                  <span id="latency" className={styles.metricValue}>{result.latency_ms.toFixed(0)} ms</span>
                </div>
                <div>
                  <span className={styles.metricLabel}>Model</span>
                  <span className={styles.metricValue}>
                    {MODEL_OPTIONS.find((o) => o.value === result.model)?.label}
                    {result.demo && " (DEMO)"}
                  </span>
                </div>
                <div>
                  <span className={styles.metricLabel}>Gambar</span>
                  <span className={styles.metricValue}>{result.image.w}×{result.image.h}</span>
                </div>
              </div>

              {result.model === "both" && (
                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #cbd5e1",
                    borderRadius: "12px",
                    padding: "12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                    <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#0f172a" }}>
                      Komparasi YOLO11s (6 Kelas) vs ResNet50 (7 Kelas)
                    </span>
                    <span
                      style={{
                        fontSize: "0.73rem",
                        fontWeight: 700,
                        padding: "2px 9px",
                        borderRadius: "999px",
                        background: result.comparison?.class_agreement !== false ? "#dcfce7" : "#fef3c7",
                        color: result.comparison?.class_agreement !== false ? "#166534" : "#92400e",
                        border: `1px solid ${result.comparison?.class_agreement !== false ? "#86efac" : "#fde68a"}`,
                      }}
                    >
                      {result.comparison?.class_agreement !== false ? "✓ Konsisten" : "⚡ Komplementer"}
                    </span>
                  </div>

                  {result.comparison?.summary_id && (
                    <p style={{ margin: 0, fontSize: "0.78rem", color: "#334155", lineHeight: 1.45 }}>
                      {result.comparison.summary_id}
                    </p>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <div
                      style={{
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        padding: "8px 10px",
                        fontSize: "0.76rem",
                      }}
                    >
                      <div style={{ fontWeight: 700, color: "#1e40af", marginBottom: "4px" }}>
                        YOLO11s (6 Kelas Deteksi)
                      </div>
                      <div>
                        Status: <b className={statusClass(result.statuses.yolo)}>{result.statuses.yolo}</b>
                      </div>
                      <div>
                        Titik Cacat: <b>{result.detections.length} kotak</b>
                      </div>
                      <div>
                        Kelas Utama:{" "}
                        <b>
                          {result.detections[0]
                            ? `${result.detections[0].label_id ?? result.detections[0].class} (${(result.detections[0].score * 100).toFixed(1)}%)`
                            : "Bebas Cacat"}
                        </b>
                      </div>
                      {result.model_latencies?.yolo_ms !== undefined && (
                        <div style={{ color: "#64748b", marginTop: "2px" }}>
                          Latensi YOLO11s: {result.model_latencies.yolo_ms.toFixed(0)} ms
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        padding: "8px 10px",
                        fontSize: "0.76rem",
                      }}
                    >
                      <div style={{ fontWeight: 700, color: "#047857", marginBottom: "4px" }}>
                        ResNet50 (7 Kelas Klasifikasi)
                      </div>
                      <div>
                        Status: <b className={statusClass(result.statuses.resnet)}>{result.statuses.resnet}</b>
                      </div>
                      <div>
                        Prediksi Top-1:{" "}
                        <b>
                          {result.classification
                            ? `${result.classification.top1_label_id ?? (CLASS_LABEL_ID[result.classification.top1] || result.classification.top1)}`
                            : "-"}
                        </b>
                      </div>
                      <div>
                        Konfidensi:{" "}
                        <b>
                          {result.classification ? `${(result.classification.top1_score * 100).toFixed(1)}%` : "-"}
                        </b>
                      </div>
                      {result.model_latencies?.resnet_ms !== undefined && (
                        <div style={{ color: "#64748b", marginTop: "2px" }}>
                          Latensi ResNet50: {result.model_latencies.resnet_ms.toFixed(0)} ms
                        </div>
                      )}
                    </div>
                  </div>

                  {result.comparison?.per_class && (
                    <div style={{ overflowX: "auto" }}>
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          fontSize: "0.74rem",
                          background: "#ffffff",
                          borderRadius: "8px",
                          overflow: "hidden",
                        }}
                      >
                        <thead>
                          <tr style={{ background: "#f1f5f9", color: "#334155", textAlign: "left" }}>
                            <th style={{ padding: "5px 8px" }}>Kelas (7)</th>
                            <th style={{ padding: "5px 8px" }}>YOLO11s (6 Kelas)</th>
                            <th style={{ padding: "5px 8px" }}>ResNet50 (7 Kelas)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.comparison.per_class.map((row) => {
                            const dotColor = CLASS_COLOR[row.class] ?? "#64748b";
                            const isActive = row.yolo_count > 0 || row.resnet_prob >= 0.15;
                            return (
                              <tr
                                key={row.class}
                                style={{
                                  borderTop: "1px solid #e2e8f0",
                                  background: isActive ? "#f8fafc" : "#ffffff",
                                  fontWeight: isActive ? 600 : 400,
                                }}
                              >
                                <td style={{ padding: "4px 8px", display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span
                                    style={{
                                      width: "7px",
                                      height: "7px",
                                      borderRadius: "50%",
                                      background: dotColor,
                                      display: "inline-block",
                                      flexShrink: 0,
                                    }}
                                  />
                                  {row.label_id} ({row.class})
                                </td>
                                <td style={{ padding: "4px 8px", color: row.yolo_count > 0 ? "#0f172a" : "#94a3b8" }}>
                                  {!row.yolo_supported
                                    ? "— (Khusus ResNet50)"
                                    : row.yolo_count > 0
                                      ? `${row.yolo_count} kotak (${(row.yolo_max_score * 100).toFixed(1)}%)`
                                      : "0 kotak"}
                                </td>
                                <td style={{ padding: "4px 8px", color: row.resnet_prob >= 0.1 ? "#0f172a" : "#64748b" }}>
                                  {(row.resnet_prob * 100).toFixed(1)}%
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {result.model !== "resnet" && (
                <div>
                  <h3 className={styles.h3}>Deteksi YOLO11s ({result.detections.length} Kotak · 6 Kelas Cacat)</h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
                    {YOLO_6_CLASSES.map((clsKey) => {
                      const matches = result.detections.filter((d) => d.class === clsKey);
                      const count = matches.length;
                      const color = CLASS_COLOR[clsKey] ?? "#2563eb";
                      const label = `${CLASS_LABEL_ID[clsKey] ?? clsKey} (${clsKey})`;
                      return (
                        <span
                          key={clsKey}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            fontSize: "0.74rem",
                            fontWeight: count > 0 ? 700 : 500,
                            padding: "3px 9px",
                            borderRadius: "999px",
                            background: count > 0 ? "#f8fafc" : "#f1f5f9",
                            border: count > 0 ? `1.5px solid ${color}` : "1px solid #e2e8f0",
                            color: count > 0 ? "#0f172a" : "#64748b",
                            opacity: count > 0 ? 1 : 0.75,
                          }}
                        >
                          <span
                            style={{
                              width: "7px",
                              height: "7px",
                              borderRadius: "50%",
                              background: count > 0 ? color : "#cbd5e1",
                              display: "inline-block",
                            }}
                          />
                          {label}: <b>{count}</b>
                        </span>
                      );
                    })}
                  </div>
                  {result.detections.length === 0 ? (
                    <p className={styles.muted}>Tidak ada kotak cacat di atas ambang pada ke-6 kelas YOLO11s.</p>
                  ) : (
                    <ul id="detections" className={styles.detList}>
                      {result.detections.map((d, i) => {
                        const barColor = CLASS_COLOR[d.class] ?? "#2563eb";
                        return (
                          <li key={i}>
                            <span className={styles.detClass}>{d.label_id ? `${d.label_id} (${d.class})` : d.class}</span>
                            <span className={styles.bar}>
                              <span style={{ width: `${(d.score * 100).toFixed(1)}%`, background: barColor }} />
                            </span>
                            <span className={styles.detScore}>{(d.score * 100).toFixed(1)}%</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              {result.classification && (
                <div>
                  <h3 className={styles.h3}>Klasifikasi ResNet50 (7 Kelas)</h3>
                  <ul className={styles.detList}>
                    {RESNET_7_CLASSES.map((clsName) => [clsName, result.classification!.probs[clsName] ?? 0] as [string, number])
                      .sort((a, b) => b[1] - a[1])
                      .map(([name, p]) => {
                        const idLabel = CLASS_LABEL_ID[name];
                        const displayName = idLabel ? `${idLabel} (${name})` : name;
                        const barColor = CLASS_COLOR[name] ?? "#2563eb";
                        return (
                          <li key={name} className={name === result.classification!.top1 ? styles.top1 : ""}>
                            <span className={styles.detClass}>{displayName}</span>
                            <span className={styles.bar}>
                              <span style={{ width: `${(p * 100).toFixed(1)}%`, background: barColor }} />
                            </span>
                            <span className={styles.detScore}>{(p * 100).toFixed(1)}%</span>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              )}
              {mode === "upload" && dbState === "disabled" && <p className={styles.muted}>Riwayat tidak disimpan: database belum dikonfigurasi.</p>}
              {mode === "upload" && dbState === "error" && <p className={styles.muted}>Riwayat gagal disimpan ke database.</p>}
            </>
          )}
        </aside>
      </div>

      <History refreshKey={historyKey} />
    </section>
  );
}

function ServerBadge({ server, onRetry }: { server: ServerState; onRetry: () => void }) {
  let cls = styles.badgeChecking;
  let text = "Memeriksa server…";
  if (server.kind === "waking") {
    cls = styles.badgeWaking;
    text = `Menyiapkan server (cold start)… percobaan ${server.attempt}/${server.total}`;
  } else if (server.kind === "ready") {
    if (server.info.demo) {
      cls = styles.badgeDemo;
      text = "Server Siap (MODE DEMO)";
    } else {
      cls = styles.badgeReady;
      const m = [server.info.models.yolo && "YOLO11", server.info.models.resnet && "ResNet50"].filter(Boolean).join(" + ");
      text = `Server siap · ${m}`;
    }
  } else if (server.kind === "down") {
    cls = styles.badgeDown;
    text = `Server tidak terjangkau: ${server.message}`;
  }
  return (
    <div id="server-badge" className={`${styles.badge} ${cls}`} data-state={server.kind}>
      <span className={styles.badgeDot} />
      <span className={styles.badgeText}>{text}</span>
      <code className={styles.badgeUrl}>{API_URL}</code>
      {server.kind === "down" && (
        <button className={styles.linkBtn} onClick={onRetry}>
          Coba lagi
        </button>
      )}
    </div>
  );
}

interface HistoryRow {
  id: string;
  created_at: string;
  model: string;
  status: ScanStatus;
  latency_ms: number;
  file_name: string | null;
  detections: { class: string }[];
  is_demo?: boolean;
}

function History({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/scans?limit=10", { cache: "no-store" })
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (!alive) return;
        if (res.ok) {
          setRows(j.scans);
          setNote(null);
        } else {
          setRows(null);
          setNote(j.error ?? `HTTP ${res.status}`);
        }
      })
      .catch(() => alive && setNote("Riwayat tidak dapat dimuat."));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  return (
    <div className={styles.history}>
      <h2 className={styles.h2}>Riwayat pemindaian</h2>
      {note && <p className={styles.muted}>{note}</p>}
      {rows && rows.length === 0 && <p className={styles.muted}>Belum ada pemindaian tersimpan.</p>}
      {rows && rows.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Berkas</th>
              <th>Model</th>
              <th>Status</th>
              <th>Kelas</th>
              <th>Latensi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.created_at).toLocaleString("id-ID")}</td>
                <td>
                  {r.is_demo && <span className={styles.demoTag}>DEMO</span>}
                  {r.file_name ?? "-"}
                </td>
                <td>{r.model}</td>
                <td><span className={`${styles.pill} ${statusClass(r.status)}`}>{r.status}</span></td>
                <td>{Array.from(new Set(r.detections.map((d) => (d as any).label_id || d.class))).join(", ") || "-"}</td>
                <td>{Math.round(r.latency_ms)} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
