'use client';

import React from 'react';

export default function DefectCatalog() {
  const defectClasses = [
    {
      id: 'defect_free',
      name: 'Bebas Cacat (Defect-Free)',
      grade: 'Grade A',
      status: 'Lolos Mutu',
      badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
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
      badgeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
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
      badgeColor: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
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
      badgeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      description:
        'Munculnya alur garis halus abnormal yang berbeda pantulan cahaya atau kerapatan dengan area permukaan kain di sekitarnya.',
      causes: 'Variasi nomor benang pakan, friksi ring guide roller, slip pada mekanisme penarik.',
      tolerance: 'Dapat ditoleransi jika tidak mencolok di bawah pencahayaan standar D65.',
    },
    {
      id: 'horizontal',
      name: 'Cacat Horizontal (Weft Fault / Pick Mark)',
      grade: 'Grade BS / Reject',
      status: 'Cacat Pakan',
      badgeColor: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
      description:
        'Cacat yang membentang searah lebar kain (arah pakan / weft), seperti start-mark, pakan renggang (thin bar), atau pakan bertumpuk (thick bar).',
      causes: 'Mesin tenun berhenti mendadak lalu jalan kembali (start mark), ketidakteraturan let-off motion.',
      tolerance: 'Tidak dapat ditoleransi untuk kain ekspor apparel.',
    },
    {
      id: 'vertical',
      name: 'Cacat Vertikal (Warp Fault / Reed Mark)',
      grade: 'Grade BS / Reject',
      status: 'Cacat Lusi',
      badgeColor: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
      description:
        'Cacat memanjang searah panjang gulungan kain (arah lusi / warp), seperti bekas goresan sisir (reed mark), benang lusi dobel, atau lusi yang hilang.',
      causes: 'Gigi sisir tenun (reed dent) bengkok/rusak, heald wire macet, benang lusi putus tidak terdeteksi.',
      tolerance: 'Kategori cacat kritis karena berpotensi merusak kain sepanjang roll.',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/60 rounded-xl p-5 border border-slate-800">
        <h2 className="text-base font-bold text-white mb-1">
          Katalog Taksonomi Cacat Kain Tekstil
        </h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Sistem klasifikasi 6 kelas TEKSCAN dirancang berdasarkan standar kontrol kualitas industri tekstil dan sistem penilaian cacat internasional (ASTM D5430 4-Point System).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {defectClasses.map((item) => (
          <div
            key={item.id}
            className="bg-slate-900/60 rounded-xl p-4 border border-slate-800 space-y-2.5 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-sm font-semibold text-white">{item.name}</h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${item.badgeColor}`}
                >
                  {item.grade}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {item.description}
              </p>
            </div>

            <div className="pt-2 border-t border-slate-800/80 space-y-1 text-[11px]">
              <div>
                <span className="text-slate-400 font-medium">Akar Masalah: </span>
                <span className="text-slate-400">{item.causes}</span>
              </div>
              <div>
                <span className="text-slate-400 font-medium">Ambang Toleransi: </span>
                <span className="text-slate-400">{item.tolerance}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
