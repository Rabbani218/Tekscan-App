"use client";

import { useEffect, useState, useCallback } from "react";
import styles from "./ControlPanel.module.css";
import { API_URL } from "@/lib/api";

interface SystemDiagnostics {
  status?: string;
  os?: { system: string; release: string; python: string };
  resources?: { cpu_percent: number; ram_percent: number; ram_total_gb: number };
  onnx?: { providers: string[]; gpu_accelerated: boolean };
  ports?: { "7860_available": boolean; "3000_available": boolean };
  models?: { real_ready: boolean; demo_ready: boolean };
  database?: { sqlite_local: boolean };
}

interface WebStatusTarget {
  online: boolean;
  http_status: number;
  latency_ms: number;
  url: string;
}

export interface ControlPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onModelModeChange?: (mode: "real" | "demo") => void;
}

export default function ControlPanel({ isOpen, onClose, onModelModeChange }: ControlPanelProps) {
  const [activeTab, setActiveTab] = useState<"web" | "settings" | "heal" | "guide">("web");
  const [healing, setHealing] = useState(false);
  const [healLogs, setHealLogs] = useState<string[]>([]);
  const [diag, setDiag] = useState<SystemDiagnostics | null>(null);
  const [webTargets, setWebTargets] = useState<Record<string, WebStatusTarget>>({});
  const [modelMode, setModelMode] = useState<"real" | "demo">("real");
  const [confThreshold, setConfThreshold] = useState<number>(0.25);
  const [iouThreshold, setIouThreshold] = useState<number>(0.5);
  const [verifyThreshold, setVerifyThreshold] = useState<number>(0.25);
  const [copied, setCopied] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      // 1. Status sistem
      const resSys = await fetch(`${API_URL}/system/status`, { cache: "no-store" });
      if (resSys.ok) {
        const data = await resSys.json();
        setDiag(data.diagnostics);
        if (data.model_mode) setModelMode(data.model_mode);
      }

      // 2. Status web
      const resWeb = await fetch(`${API_URL}/system/web-status`, { cache: "no-store" });
      if (resWeb.ok) {
        const data = await resWeb.json();
        setWebTargets(data.web_status || {});
      }
    } catch {
      // Backend mungkin sedang booting
    } finally {}
  }, []);

  useEffect(() => {
    if (isOpen) {
      void fetchStatus();
    }
  }, [isOpen, fetchStatus]);

  const handleRunSelfHeal = async () => {
    setHealing(true);
    setHealLogs(["Memulai diagnosa dan perbaikan mandiri..."]);
    try {
      const res = await fetch(`${API_URL}/system/heal`, { method: "POST", cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const logs = data.self_healing?.logs || ["Selesai diperbaiki."];
        setHealLogs(logs);
        await fetchStatus();
      } else {
        setHealLogs((prev) => [...prev, "Gagal menghubungi endpoint self-healing."]);
      }
    } catch (err) {
      setHealLogs((prev) => [...prev, `Error: ${String(err)}`]);
    } finally {
      setHealing(false);
    }
  };

  const handleUpdateConfig = async (updates: Record<string, unknown>) => {
    try {
      const res = await fetch(`${API_URL}/system/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.model_mode) {
          setModelMode(data.model_mode);
          onModelModeChange?.(data.model_mode);
        }
      }
    } catch {
      // Abaikan jika error
    }
  };

  const copyCode = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label="Control Panel Pengaturan">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.titleBox}>
            <span className={styles.icon} aria-hidden>⚙️</span>
            <div>
              <h2 className={styles.title}>Control Panel Pengaturan TEKSCAN</h2>
              <span className={styles.subtitle}>Status Web, Self-Healing, dan Konfigurasi Model</span>
            </div>
          </div>
          <button id="close-control-panel" className={styles.closeBtn} onClick={onClose} aria-label="Tutup panel">
            ✕
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className={styles.navTabs}>
          <button
            className={`${styles.tabBtn} ${activeTab === "web" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("web")}
          >
            🌐 Status Web & Sistem
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === "settings" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("settings")}
          >
            🎛️ Pengaturan Toleransi
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === "heal" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("heal")}
          >
            ⚡ Diagnosa & Self-Healing
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === "guide" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("guide")}
          >
            💻 Jalankan di Laptop Lain
          </button>
        </div>

        {/* Content Body */}
        <div className={styles.body}>
          {/* TAB 1: STATUS WEB & SISTEM */}
          {activeTab === "web" && (
            <>
              <div className={styles.gridStatus}>
                <div className={styles.card}>
                  <div className={styles.cardHeader}>
                    <span className={styles.cardTitle}>Backend Lokal API</span>
                    <span className={webTargets.local_backend?.online ? styles.badgeOnline : styles.badgeOffline}>
                      {webTargets.local_backend?.online ? "ONLINE" : "OFFLINE"}
                    </span>
                  </div>
                  <div className={styles.cardValue}>{API_URL}</div>
                  <div className={styles.cardMeta}>
                    Latensi: {webTargets.local_backend?.latency_ms ?? 0} ms · Port 7860
                  </div>
                </div>

                <div className={styles.card}>
                  <div className={styles.cardHeader}>
                    <span className={styles.cardTitle}>Frontend Next.js</span>
                    <span className={styles.badgeOnline}>ONLINE</span>
                  </div>
                  <div className={styles.cardValue}>http://localhost:3000</div>
                  <div className={styles.cardMeta}>Next.js 16 · App Router</div>
                </div>

                <div className={styles.card}>
                  <div className={styles.cardHeader}>
                    <span className={styles.cardTitle}>Mode Model Aktif</span>
                    <span className={modelMode === "real" ? styles.badgeOnline : styles.badgeOffline}>
                      {modelMode.toUpperCase()}
                    </span>
                  </div>
                  <div className={styles.cardValue}>{modelMode === "real" ? "Model Asli Colab" : "Model Demo Tiruan"}</div>
                  <div className={styles.cardMeta}>
                    {diag?.models?.real_ready ? "Model produksi YOLO11s siap (6 kelas)" : "Model produksi siap"}
                  </div>
                </div>

                <div className={styles.card}>
                  <div className={styles.cardHeader}>
                    <span className={styles.cardTitle}>Basis Data Riwayat</span>
                    <span className={styles.badgeOnline}>SIAP</span>
                  </div>
                  <div className={styles.cardValue}>
                    {diag?.database?.sqlite_local ? "SQLite Lokal (Offline)" : "PostgreSQL / Supabase"}
                  </div>
                  <div className={styles.cardMeta}>Riwayat tersimpan mandiri di laptop</div>
                </div>
              </div>

              {/* Hardware & Provider */}
              <div className={styles.gridStatus}>
                <div className={styles.card}>
                  <div className={styles.cardTitle}>Penggunaan CPU & RAM</div>
                  <div className={styles.cardValue}>
                    CPU {diag?.resources?.cpu_percent ?? 0}% · RAM {diag?.resources?.ram_percent ?? 0}%
                  </div>
                  <div className={styles.cardMeta}>
                    Total RAM Sistem: {diag?.resources?.ram_total_gb ?? 0} GB
                  </div>
                </div>

                <div className={styles.card}>
                  <div className={styles.cardTitle}>ONNX Execution Provider</div>
                  <div className={styles.cardValue}>
                    {diag?.onnx?.gpu_accelerated ? "GPU Akselerasi Aktif" : "CPU Execution Provider"}
                  </div>
                  <div className={styles.cardMeta}>
                    Providers: {diag?.onnx?.providers?.join(", ") || "CPU"}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: PENGATURAN MODEL & TOLERANSI */}
          {activeTab === "settings" && (
            <div className={styles.settingGroup}>
              <div className={styles.settingItem}>
                <div className={styles.settingHeader}>
                  <span className={styles.settingLabel}>Ambang Batas Deteksi (Confidence Threshold)</span>
                  <span className={styles.settingVal}>{(confThreshold * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.95"
                  step="0.05"
                  value={confThreshold}
                  className={styles.slider}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setConfThreshold(val);
                    void handleUpdateConfig({ conf_threshold: val });
                  }}
                />
                <span className={styles.settingDesc}>
                  Skor minimal agar kotak cacat dianggap terdeteksi oleh YOLO11.
                </span>
              </div>

              <div className={styles.settingItem}>
                <div className={styles.settingHeader}>
                  <span className={styles.settingLabel}>Supresi Kotak Tumpang Tindih (IoU NMS Threshold)</span>
                  <span className={styles.settingVal}>{iouThreshold.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.10"
                  max="0.90"
                  step="0.05"
                  value={iouThreshold}
                  className={styles.slider}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setIouThreshold(val);
                    void handleUpdateConfig({ iou_threshold: val });
                  }}
                />
                <span className={styles.settingDesc}>
                  Batas tumpang tindih untuk menggabungkan deteksi ganda pada area cacat yang sama.
                </span>
              </div>

              <div className={styles.settingItem}>
                <div className={styles.settingHeader}>
                  <span className={styles.settingLabel}>Ambang Verifikasi Manual (Verify Threshold)</span>
                  <span className={styles.settingVal}>{(verifyThreshold * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.10"
                  max="0.60"
                  step="0.05"
                  value={verifyThreshold}
                  className={styles.slider}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setVerifyThreshold(val);
                    void handleUpdateConfig({ verify_threshold: val });
                  }}
                />
                <span className={styles.settingDesc}>
                  Skor di antara batas ini dan ambang deteksi akan memicu status kuning (PERLU VERIFIKASI).
                </span>
              </div>
            </div>
          )}

          {/* TAB 3: DIAGNOSA & SELF-HEALING */}
          {activeTab === "heal" && (
            <div className={styles.healSection}>
              <div className={styles.healActionBox}>
                <div>
                  <strong className={styles.healTitle}>Pusat Pemulihan Mandiri (Self-Healing)</strong>
                  <p className={styles.healDesc}>
                    Periksa dan perbaiki secara otomatis dependensi, port yang terkunci, model demo, dan basis data offline.
                  </p>
                </div>
                <button
                  id="btn-self-heal"
                  className={styles.healBtn}
                  onClick={handleRunSelfHeal}
                  disabled={healing}
                >
                  {healing ? "⚡ Memperbaiki…" : "⚡ Jalankan Self-Healing"}
                </button>
              </div>

              {healLogs.length > 0 && (
                <div className={styles.logBox}>
                  {healLogs.map((l, i) => (
                    <div key={i}>{l}</div>
                  ))}
                </div>
              )}

              <div className={styles.gridStatus}>
                <div className={styles.card}>
                  <div className={styles.cardTitle}>Port 7860 & 3000</div>
                  <div className={styles.cardValue}>Bebas Konflik</div>
                  <div className={styles.cardMeta}>Auto-kill proses zombie jika port terkunci</div>
                </div>
                <div className={styles.card}>
                  <div className={styles.cardTitle}>Integritas Model Demo</div>
                  <div className={styles.cardValue}>{diag?.models?.demo_ready ? "Siap" : "Perlu Regenerasi"}</div>
                  <div className={styles.cardMeta}>Auto-generate via scripts/make_demo_models.py</div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: PANDUAN JALANKAN DI LAPTOP LAIN */}
          {activeTab === "guide" && (
            <div className={styles.guideBox}>
              <strong className={styles.guideTitle}>
                Cara Menjalankan di Semua Laptop yang Berbeda (Zero Setup)
              </strong>
              <p className={styles.guideIntro}>
                Aplikasi ini dilengkapi <strong>Universal Self-Healing Runner (app.py)</strong>. Cukup salin folder ini ke laptop lain mana pun dan jalankan satu perintah di terminal:
              </p>

              <div className={styles.codeBlock}>
                <span>python app.py</span>
                <button className={styles.copyBtn} onClick={() => copyCode("python app.py")}>
                  {copied ? "Disalin!" : "Salin"}
                </button>
              </div>

              <div className={styles.guideList}>
                <strong>Apa yang otomatis dilakukan oleh app.py:</strong>
                <ol style={{ paddingLeft: "1.25rem", margin: "0.5rem 0" }}>
                  <li>Memeriksa versi Python sistem laptop Anda.</li>
                  <li>Membuat virtual environment dan memasang paket secara otomatis jika belum ada.</li>
                  <li>Memeriksa ketersediaan model (membuat model demo otomatis bila model asli belum diletakkan).</li>
                  <li>Membebaskan port 7860 dan 3000 jika terkunci oleh aplikasi lain.</li>
                  <li>Menyiapkan basis data SQLite lokal untuk menyimpan riwayat pemindaian secara offline.</li>
                  <li>Membuka peramban web otomatis ke <code>http://localhost:3000</code>.</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
