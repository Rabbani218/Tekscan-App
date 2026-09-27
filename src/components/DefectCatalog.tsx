'use client';

import React from 'react';

export default function DefectCatalog() {
  const defectClasses = [
    {
      id: 'defect_free',
      name: 'Bebas Cacat (Defect-Free)',
      grade: 'Grade A',
      status: 'Lolos Mutu Prima',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      description:
        'Kain tenun atau rajut yang memiliki kerapatan dan susunan benang lusi (warp) serta pakan (weft) yang sempurna tanpa kontaminasi kotoran, sobekan, atau penyimpangan benang.',
      causes: 'Operasi mesin normal, suplai benang prima, tegangan konstan.',
      tolerance: '0 cacat per roll / Standar 4-Point System.',
    },
    {
      id: 'stain',
      name: 'Noda (Stain / Oil Contamination)',
      grade: 'Grade B / Warning',
      status: 'Butuh Pembersihan',
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
      description:
        'Bercak zat asing berupa minyak pelumas mesin tenun, percikan zat pewarna (dye drop), jelaga, atau karat yang menempel pada serat kain selama proses produksi.',
      causes: 'Kebocoran pelumas gearbox, cipratan air kondensasi stenter, penanganan kain kotor.',
      tolerance: 'Maksimal 1 titik minor (< 5mm) per 100 meter lari jika dapat dihilangkan dengan spotting.',
    },
    {
      id: 'hole',
      name: 'Lubang (Hole / Tear)',
      grade: 'Grade BS / Reject',
      status: 'Cacat Kritis',
      badgeColor: 'bg-rose-100 text-rose-800 border-rose-300',
      description:
        'Kerusakan mekanis fisik berupa terputusnya susunan benang pembentuk kain sehingga membentuk celah kosong atau lubang sobekan yang tembus pandang.',
      causes: 'Jarum rajut patah, kait rapier bergesekan tajam, benang tersangkut benda asing tajam.',
      tolerance: '0 toleransi (cacat mayor langsung bernilai 4 point per lembar).',
    },
    {
      id: 'lines',
      name: 'Garis (Lines / Texture Streak)',
      grade: 'Grade B / Warning',
      status: 'Penyimpangan Tekstur',
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
      description:
        'Munculnya alur garis halus abnormal yang berbeda pantulan cahaya atau kerapatan dengan area permukaan kain di sekitarnya.',
      causes: 'Variasi nomor benang pakan, friksi ring guide roller, slip pada mekanisme penarik.',
      tolerance: 'Dapat ditoleransi jika tidak mencolok di bawah pencahayaan standar D65.',
    },
    {
      id: 'horizontal',
      name: 'Cacat Horizontal (Weft Fault / Pick Mark)',
      grade: 'Grade BS / Reject',
      status: 'Cacat Pakan Melintang',
      badgeColor: 'bg-rose-100 text-rose-800 border-rose-300',
      description:
        'Cacat yang membentang searah lebar kain (arah pakan / weft), seperti start-mark, pakan renggang (thin bar), atau pakan bertumpuk (thick bar).',
      causes: 'Mesin tenun berhenti mendadak lalu jalan kembali (start mark), ketidakteraturan let-off motion.',
      tolerance: 'Tidak dapat ditoleransi untuk kain ekspor apparel.',
    },
    {
      id: 'vertical',
      name: 'Cacat Vertikal (Warp Fault / Reed Mark)',
      grade: 'Grade BS / Reject',
      status: 'Cacat Lusi Membujur',
      badgeColor: 'bg-rose-100 text-rose-800 border-rose-300',
      description:
        'Cacat memanjang searah panjang gulungan kain (arah lusi / warp), seperti bekas goresan sisir (reed mark), benang lusi dobel, atau lusi yang hilang.',
      causes: 'Gigi sisir tenun (reed dent) bengkok/rusak, heald wire macet, benang lusi putus tidak terdeteksi.',
      tolerance: 'Kategori cacat kritis karena berpotensi merusak kain sepanjang roll.',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-1">
          Katalog Taksonomi Cacat Kain Tekstil
        </h2>
        <p className="text-xs text-slate-500 leading-relaxed max-w-3xl">
          Sistem klasifikasi 6 kelas TEKSCAN dirancang berdasarkan standar kontrol kualitas industri tekstil internasional (ASTM D5430 4-Point System) untuk mempermudah identifikasi cepat oleh operator pabrik.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {defectClasses.map((item) => (
          <div
            key={item.id}
            className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3 flex flex-col justify-between hover:shadow-md transition-shadow"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-sm font-bold text-slate-900">{item.name}</h3>
                <span
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${item.badgeColor}`}
                >
                  {item.grade}
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {item.description}
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-1.5 text-xs">
              <div>
                <span className="text-slate-500 font-semibold">Akar Masalah: </span>
                <span className="text-slate-700">{item.causes}</span>
              </div>
              <div>
                <span className="text-slate-500 font-semibold">Ambang Toleransi: </span>
                <span className="text-slate-700">{item.tolerance}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
