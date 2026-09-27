/**
 * Helper to generate realistic textile sample patterns via Canvas
 * Allows instant 1-click testing on laptop, tablet, and mobile without external downloads.
 */

export interface SampleFabric {
  id: string;
  name: string;
  category: string;
  description: string;
  dataUrl: string;
}

export function generateSampleFabrics(): SampleFabric[] {
  if (typeof window === 'undefined') return [];

  const createSample = (
    drawFn: (ctx: CanvasRenderingContext2D, width: number, height: number) => void
  ): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Draw base fabric texture (weaving grid)
    ctx.fillStyle = '#d9d2c9'; // Base cotton/canvas cloth tone
    ctx.fillRect(0, 0, 400, 400);

    // Weave texture simulation
    ctx.strokeStyle = '#c4bcb2';
    ctx.lineWidth = 1;
    for (let x = 0; x < 400; x += 4) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 400);
      ctx.stroke();
    }
    for (let y = 0; y < 400; y += 4) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(400, y);
      ctx.stroke();
    }

    // Add subtle thread noise
    const imgData = ctx.getImageData(0, 0, 400, 400);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 16;
      data[i] = Math.min(255, Math.max(0, data[i] + noise));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    // Run custom defect drawing
    drawFn(ctx, 400, 400);

    return canvas.toDataURL('image/jpeg', 0.92);
  };

  // Sample 1: Defect Free (Clean cotton weave)
  const defectFreeUrl = createSample((ctx) => {
    // Just pristine regular weave, maybe a slight weave pattern
    ctx.strokeStyle = 'rgba(160, 150, 140, 0.3)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 400; i += 8) {
      ctx.strokeRect(i, i, 4, 4);
    }
  });

  // Sample 2: Noda / Stain (Oil/grease stain)
  const stainUrl = createSample((ctx, w, h) => {
    const grad = ctx.createRadialGradient(200, 190, 10, 200, 190, 75);
    grad.addColorStop(0, 'rgba(84, 52, 28, 0.85)');
    grad.addColorStop(0.5, 'rgba(120, 75, 40, 0.55)');
    grad.addColorStop(0.85, 'rgba(160, 110, 70, 0.25)');
    grad.addColorStop(1, 'rgba(160, 110, 70, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(200, 190, 80, 60, Math.PI / 6, 0, 2 * Math.PI);
    ctx.fill();

    // Satellite droplets
    ctx.fillStyle = 'rgba(95, 60, 32, 0.7)';
    ctx.beginPath();
    ctx.arc(280, 220, 14, 0, 2 * Math.PI);
    ctx.arc(140, 230, 9, 0, 2 * Math.PI);
    ctx.fill();
  });

  // Sample 3: Lubang / Hole (Torn aperture revealing dark backing)
  const holeUrl = createSample((ctx) => {
    // Dark hole cavity
    ctx.fillStyle = '#1c1b18';
    ctx.beginPath();
    ctx.ellipse(210, 200, 42, 38, 0.2, 0, 2 * Math.PI);
    ctx.fill();

    // Frayed yarn edges around the tear
    ctx.strokeStyle = '#e8e2d8';
    ctx.lineWidth = 1.5;
    for (let angle = 0; angle < Math.PI * 2; angle += 0.15) {
      const r1 = 36 + Math.random() * 8;
      const r2 = 48 + Math.random() * 12;
      const x1 = 210 + Math.cos(angle) * r1;
      const y1 = 200 + Math.sin(angle) * r1;
      const x2 = 210 + Math.cos(angle) * r2;
      const y2 = 200 + Math.sin(angle) * r2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  });

  // Sample 4: Cacat Vertikal / Vertical Defect (Warp yarn fault)
  const verticalDefectUrl = createSample((ctx) => {
    ctx.fillStyle = 'rgba(70, 60, 50, 0.65)';
    ctx.fillRect(188, 0, 18, 400);

    // Broken warp threads
    ctx.strokeStyle = '#2a221a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(196, 0);
    ctx.lineTo(196, 400);
    ctx.stroke();
  });

  return [
    {
      id: 'sample_clean',
      name: 'Kain Katun Standar',
      category: 'Bebas Cacat (Clean)',
      description: 'Struktur tenun rapi tanpa kontaminasi serat',
      dataUrl: defectFreeUrl,
    },
    {
      id: 'sample_stain',
      name: 'Kontaminasi Noda',
      category: 'Noda (Stain)',
      description: 'Bercak cairan pelumas pada area tengah',
      dataUrl: stainUrl,
    },
    {
      id: 'sample_hole',
      name: 'Kerusakan Lubang',
      category: 'Lubang (Hole)',
      description: 'Sobekan serat benang dengan tepi koyak',
      dataUrl: holeUrl,
    },
    {
      id: 'sample_vertical',
      name: 'Cacat Pakan Vertikal',
      category: 'Cacat Vertikal',
      description: 'Penyimpangan alur benang lusi vertikal',
      dataUrl: verticalDefectUrl,
    },
  ];
}
