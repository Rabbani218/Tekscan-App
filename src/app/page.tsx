import Scanner from "@/components/Scanner";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brand}>
            <div className={styles.logoIcon} aria-hidden>T</div>
            <span className={styles.title}>TEKSCAN</span>
            <span className={styles.badgeHeader}>YOLO11 & ResNet50</span>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.hero}>
          <h1>Sistem Deteksi Cacat Kain</h1>
          <p>
            Pemindaian kain tekstil real-time berbasis AI dengan model deteksi objek YOLO11 dan klasifikasi pembanding ResNet50.
          </p>
        </div>

        <Scanner />
      </main>

      <footer className={styles.footer}>
        <p>TEKSCAN &copy; 2026 &middot; Universitas Bina Sarana Informatika &middot; Pengolahan Citra</p>
      </footer>
    </div>
  );
}
