import type { InferenceResult } from './inference';

export interface InspectionRecord {
  id: string;
  timestamp: string;
  imageThumbnail: string;
  fileName: string;
  result: InferenceResult;
  status: 'PASSED' | 'REJECTED';
  defectLabel: string;
  confidence: number;
}

export interface SOPRecommendation {
  title: string;
  actionLevel: 'NORMAL' | 'WARNING' | 'CRITICAL';
  rootCauses: string[];
  correctiveActions: string[];
  preventionTips: string;
}

export const INDUSTRIAL_SOP: Record<string, SOPRecommendation> = {
  defect_free: {
    title: 'Standar Mutu Terpenuhi (Grade A)',
    actionLevel: 'NORMAL',
    rootCauses: ['Formasi lusi dan pakan stabil', 'Tegangan benang optimal'],
    correctiveActions: [
      'Lanjutkan proses penggulungan kain (Take-up motion).',
      'Bubuhkan stempel lolos QC untuk batch ini.',
      'Kain siap dikirim ke bagian finishing / packaging.',
    ],
    preventionTips: 'Jaga kebersihan area stenter dan rutin periksa tegangan loom.',
  },
  stain: {
    title: 'Penanganan Kontaminasi Cairan / Noda Minyak',
    actionLevel: 'WARNING',
    rootCauses: [
      'Pelumasan berlebih pada bearing rol pemandu',
      'Tetesan kondensasi pipa uap stenter',
      'Penyimpanan bahan baku di area lembab',
    ],
    correctiveActions: [
      'Segera tandai area noda menggunakan sticker QC reflektif.',
      'Uji coba spotting cleaning menggunakan deterjen enzimatik tekstil.',
      'Inspeksi segel pelumas gear box dan bearing mesin tenun terkait.',
    ],
    preventionTips: 'Gunakan pelumas berbasis sintetis non-drip dan lakukan scheduled wipe down.',
  },
  hole: {
    title: 'Penanganan Kerusakan Sobekan / Lubang Benang',
    actionLevel: 'CRITICAL',
    rootCauses: [
      'Jarum rajut / rapier patah atau bengkok',
      'Tegangan lusi terlampau tinggi menyebabkan benang putus',
      'Benda asing tajam pada rol pengarah',
    ],
    correctiveActions: [
      'Hentikan mesin tenun/rajut pada line produksi terkait.',
      'Ganti jarum atau cek sisir tenun (reed) untuk mata sisir yang cacat.',
      'Potong segmen kain yang berlubang sebelum proses packaging gulungan.',
    ],
    preventionTips: 'Terapkan sensor deteksi benang putus (warp stop motion) secara otomatis.',
  },
  lines: {
    title: 'Penyimpangan Jalur / Garis Tekstur Benang',
    actionLevel: 'WARNING',
    rootCauses: [
      'Perbedaan variasi ketebalan nomor benang (Ne/Denier)',
      'Goresan pada guide roller',
      'Tension disc slip saat penguluran pakan',
    ],
    correctiveActions: [
      'Verifikasi lot benang yang digunakan apakah berasal dari supplier/spool yang sama.',
      'Haluskan permukaan guide bar yang kasar dengan amplas mikron tekstil.',
      'Sesuaikan tegangan benang pada feeder.',
    ],
    preventionTips: 'Lakukan kalibrasi tension meter setiap awal shift kerja.',
  },
  horizontal: {
    title: 'Cacat Pakan Melintang (Horizontal Fault / Weft Bar)',
    actionLevel: 'CRITICAL',
    rootCauses: [
      'Start-mark akibat mesin sempat terhenti mendadak',
      'Ketidakteraturan motor let-off / take-up pakan',
      'Tegangan benang pakan tidak merata antar pick',
    ],
    correctiveActions: [
      'Periksa mekanisme anti-crack / anti-start mark mesin.',
      'Kalibrasi clutch dan rem pakan untuk mencegah jeda penyisipan.',
      'Tandai meteran cacat pada log sheet QC per roll kain.',
    ],
    preventionTips: 'Hindari mematikan mesin tenun di tengah siklus putaran tanpa prosedur parkir.',
  },
  vertical: {
    title: 'Cacat Lusi Membujur (Vertical Fault / Warp Streak)',
    actionLevel: 'CRITICAL',
    rootCauses: [
      'Mata sisir tenun (reed dent) bengkok atau aus',
      'Benang lusi terlepas dari heald wire',
      'Kerapatan benang tidak seragam saat beaming',
    ],
    correctiveActions: [
      'Cek deretan reed dent pada posisi garis vertikal yang terdeteksi.',
      'Luruskan heald wire dan pastikan benang lusi lewat di jalurnya.',
      'Jika cacat meluas sepanjang roll, kategorikan sebagai Grade C/BS.',
    ],
    preventionTips: 'Rutin bersihkan serat debu fly-waste yang menumpuk di area dropper dan sisir.',
  },
};
