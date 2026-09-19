import { projectAR, type Attitude } from "./orientation";
import type { SkyObject } from "./sky";
export type ProjectedObject = { object: SkyObject; x: number; y: number };
const RAD = Math.PI / 180;
const bodyColors: Record<string, string> = {
  mercury: "#dfcbb4", venus: "#fff3cb", mars: "#ffa486", jupiter: "#f7d4af",
  saturn: "#ead299", uranus: "#a9efec", neptune: "#94b6ff", sun: "#ffe386",
};
function vector(o: SkyObject) {
  return [Math.cos(o.altitude * RAD) * Math.sin(o.azimuth * RAD),
    Math.cos(o.altitude * RAD) * Math.cos(o.azimuth * RAD), Math.sin(o.altitude * RAD)];
}
const dot = (a: number[], b: number[]) => a.reduce((sum, n, i) => sum + n * b[i], 0);
/** The illuminated limb faces the Sun, including when the Sun is off-screen. */
export function lunarLimbAngle(moon: SkyObject, sun: SkyObject | undefined, attitude: Attitude): number {
  if (!sun) return 0;
  const m = vector(moon), s = vector(sun), along = dot(s, m);
  const tangent = s.map((n, i) => n - along * m[i]);
  const z = dot(m, attitude.forward), dz = dot(tangent, attitude.forward);
  const x = dot(tangent, attitude.right) * z - dot(m, attitude.right) * dz;
  const y = -(dot(tangent, attitude.up) * z - dot(m, attitude.up) * dz);
  return Math.atan2(y, x);
}
export function drawAR(
  ctx: CanvasRenderingContext2D, objects: ProjectedObject[], attitude: Attitude,
  width: number, height: number, fov: number, selected: string | undefined,
  moonFraction: number, sun: SkyObject | undefined,
) {
  // A horizon and cardinal labels give meaningful feedback even in empty fields.
  ctx.save(); ctx.strokeStyle = "#aacdc670"; ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]); ctx.beginPath(); let previous = false;
  for (let az = 0; az <= 360; az += 2) {
    const p = projectAR(0, az, attitude, fov, width, height);
    if (p.visible) { if (previous) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }
    previous = p.visible;
  }
  ctx.stroke(); ctx.setLineDash([]);
  ctx.font = "600 14px sans-serif"; ctx.textAlign = "center";
  for (const [az, label] of [[0, "N"], [90, "E"], [180, "S"], [270, "W"]] as const) {
    const p = projectAR(0, az, attitude, fov, width, height);
    if (p.visible) { ctx.strokeStyle = "#000"; ctx.lineWidth = 4; ctx.strokeText(label, p.x, p.y - 9);
      ctx.fillStyle = "#d3eee8"; ctx.fillText(label, p.x, p.y - 9); }
  }
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  const sorted = [...objects].sort((a, b) => (a.object.id === selected ? -1 : b.object.id === selected ? 1 : a.object.magnitude - b.object.magnitude));
  for (const { object: o, x, y } of sorted) {
    const isSelected = o.id === selected;
    let r = o.kind === "star" ? Math.max(1.2, Math.min(3.8, 3.4 - o.magnitude * 0.37)) : o.kind === "moon" ? 12 : o.kind === "sun" ? 10 : 5;
    if (o.kind === "moon" && o.distanceAu) r = Math.max(r, width / 2 / Math.tan(fov * RAD / 2) * 1737.4 / (o.distanceAu * 149597870.7));
    const color = o.kind === "star" ? (o.colorIndex !== undefined && o.colorIndex > 1 ? "#ffdcc0" : "#e9f5ff") : bodyColors[o.id] ?? "#f4f1df";
    ctx.shadowColor = color; ctx.shadowBlur = o.kind === "star" ? 5 : 11;
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    if (o.kind === "moon") {
      ctx.save(); ctx.translate(x, y); ctx.rotate(lunarLimbAngle(o, sun, attitude));
      ctx.fillStyle = "#323944"; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      const fraction = Math.max(0, Math.min(1, moonFraction));
      ctx.fillStyle = "#fff5d9"; ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const sy = -r + i * r / 20, sx = Math.sqrt(Math.max(0, r * r - sy * sy));
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      }
      for (let i = 40; i >= 0; i--) {
        const sy = -r + i * r / 20;
        ctx.lineTo((1 - 2 * fraction) * Math.sqrt(Math.max(0, r * r - sy * sy)), sy);
      }
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
    if (o.id === "saturn") {
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(x, y, r * 1.9, r * .55, -.4, 0, Math.PI * 2); ctx.stroke();
    }
    if (isSelected) { ctx.strokeStyle = "#ffdc95"; ctx.lineWidth = 1.7;
      ctx.beginPath(); ctx.arc(x, y, r + 7, 0, Math.PI * 2); ctx.stroke(); }
    // Always draw the object itself. Collision detection only hides its label.
    if (o.kind === "star" && o.magnitude > 3 && !isSelected) continue;
    ctx.font = `${isSelected ? 600 : 500} 13px sans-serif`;
    const textWidth = ctx.measureText(o.name).width;
    const tx = x + r + 8 + textWidth > width - 8 ? x - r - 8 - textWidth : x + r + 8;
    const ty = Math.max(16, y - r - 5);
    const box = { x: tx - 3, y: ty - 14, w: textWidth + 6, h: 20 };
    if (!isSelected && boxes.some(b => box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y)) continue;
    boxes.push(box); ctx.textAlign = "left"; ctx.lineWidth = 4;
    ctx.strokeStyle = "#000d"; ctx.strokeText(o.name, tx, ty); ctx.fillStyle = color; ctx.fillText(o.name, tx, ty);
  }
  ctx.restore();
}
