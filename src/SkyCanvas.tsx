import { useEffect, useMemo, useRef, useState } from "react";
import {
  project,
  type SkyObject,
  type Location,
  getConstellationLines,
} from "./sky";
export type View = { az: number; alt: number; fov: number };
type Props = {
  objects: SkyObject[];
  date: Date;
  location: Location;
  view: View;
  onView: (v: View) => void;
  selected?: string;
  onSelect: (id: string) => void;
  lines: boolean;
  labels: boolean;
  grid: boolean;
  night: boolean;
};
export default function SkyCanvas(p: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 900, height: 680 });
  const constellationLines = useMemo(
    () => getConstellationLines(p.date, p.location),
    [p.date, p.location],
  );
  const hits = useRef<{ x: number; y: number; id: string }[]>([]);
  const drag = useRef<{
    x: number;
    y: number;
    az: number;
    alt: number;
    moved: boolean;
  } | null>(null);
  useEffect(() => {
    const c = ref.current!;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(c);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const { width: w, height: h } = size;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const point = (alt: number, az: number) =>
      project(alt, az, p.view.az, p.view.alt, p.view.fov, w, h);
    const bg = ctx.createRadialGradient(
      w * 0.5,
      h * 0.45,
      0,
      w * 0.5,
      h * 0.5,
      w * 0.8,
    );
    bg.addColorStop(0, p.night ? "#180b0d" : "#101d2a");
    bg.addColorStop(1, p.night ? "#080506" : "#070c13");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    const line = (
      coords: { altitude: number; azimuth: number }[],
      color: string,
      width = 1,
    ) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      let previous: { x: number; y: number; visible: boolean } | null = null;
      for (const c of coords) {
        const q = point(c.altitude, c.azimuth);
        if (
          q.visible &&
          previous?.visible &&
          Math.hypot(q.x - previous.x, q.y - previous.y) < w / 2
        )
          ctx.lineTo(q.x, q.y);
        else ctx.moveTo(q.x, q.y);
        previous = q;
      }
      ctx.stroke();
    };
    if (p.grid) {
      for (let alt = -30; alt <= 90; alt += 15)
        line(
          Array.from({ length: 361 }, (_, az) => ({
            altitude: alt,
            azimuth: az,
          })),
          p.night ? "#50222566" : "#405c713b",
        );
      for (let az = 0; az < 360; az += 30)
        line(
          Array.from({ length: 121 }, (_, i) => ({
            altitude: i - 30,
            azimuth: az,
          })),
          p.night ? "#50222566" : "#405c713b",
        );
    }
    line(
      Array.from({ length: 361 }, (_, az) => ({ altitude: 0, azimuth: az })),
      p.night ? "#aa4545" : "#7f9c9280",
      1.5,
    );
    for (const [az, name] of [
      [0, "N"],
      [90, "E"],
      [180, "S"],
      [270, "W"],
    ] as const) {
      const q = point(2, az);
      if (q.visible) {
        ctx.font = "12px sans-serif";
        ctx.fillStyle = p.night ? "#df7777" : "#bdcbbf";
        ctx.fillText(name, q.x, q.y);
      }
    }
    const constellationLabels: { x: number; y: number; width: number }[] = [];
    if (p.lines)
      for (const group of constellationLines) {
        for (const segment of group.points)
          line(segment, p.night ? "#873c3c77" : "#83aaa750");
        if (p.labels) {
          const all = group.points.flat();
          const visible = all
            .map((c) => point(c.altitude, c.azimuth))
            .filter(
              (c) =>
                c.visible &&
                c.x > 50 &&
                c.x < w - 80 &&
                c.y > 40 &&
                c.y < h - 40,
            );
          if (visible.length > 2) {
            const x = visible.reduce((s, c) => s + c.x, 0) / visible.length,
              y = visible.reduce((s, c) => s + c.y, 0) / visible.length;
            ctx.fillStyle = p.night ? "#aa5555" : "#6f9298";
            ctx.font = "10px sans-serif";
            ctx.letterSpacing = "2px";
            const text = group.name.toUpperCase();
            const width = ctx.measureText(text).width;
            const left = x - width / 2;
            if (
              left > 12 &&
              left + width < w - 18 &&
              !constellationLabels.some(
                (b) =>
                  Math.abs(b.y - y) < 35 &&
                  left < b.x + b.width + 15 &&
                  left + width > b.x - 15,
              )
            ) {
              ctx.fillText(text, left, y - 20);
              constellationLabels.push({ x: left, y, width });
            }
            ctx.letterSpacing = "0px";
          }
        }
      }
    hits.current = [];
    const labelBoxes: { x: number; y: number }[] = constellationLabels.map(
      (b) => ({ x: b.x + b.width / 2, y: b.y - 10 }),
    );
    for (const o of [...p.objects].sort((a, b) => b.magnitude - a.magnitude)) {
      const q = point(o.altitude, o.azimuth);
      if (!q.visible || q.x < 0 || q.x > w || q.y < 0 || q.y > h) continue;
      const selected = o.id === p.selected;
      const r =
        o.kind === "moon"
          ? 6
          : o.kind === "sun"
            ? 7
            : o.kind === "planet"
              ? 3.7
              : Math.max(0.65, 2.6 - o.magnitude * 0.38);
      const color = p.night
        ? "#e18178"
        : o.kind === "planet"
          ? "#e6c79c"
          : o.kind === "sun"
            ? "#f8d690"
            : o.kind === "moon"
              ? "#eff0d4"
              : "#d8e6f0";
      ctx.globalAlpha = o.altitude < 0 ? 0.25 : 1;
      if (o.magnitude < 1.8 || o.kind !== "star") {
        const glow = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r * 6);
        glow.addColorStop(0, color + "60");
        glow.addColorStop(1, color + "00");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(q.x, q.y, r * 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
      ctx.fill();
      hits.current.push({ x: q.x, y: q.y, id: o.id });
      if (selected) {
        ctx.strokeStyle = p.night ? "#e18178" : "#c3e5d1";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(q.x, q.y, 15, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (
        selected ||
        (p.labels &&
          (o.kind !== "star" || o.magnitude < 1.7) &&
          !labelBoxes.some(
            (b) => Math.abs(b.x - q.x) < 75 && Math.abs(b.y - q.y) < 20,
          ))
      ) {
        ctx.font = selected ? "500 13px sans-serif" : "11px sans-serif";
        ctx.fillStyle = selected ? "#edf7f0" : color;
        ctx.fillText(o.name, q.x + 12, q.y - 10);
        labelBoxes.push(q);
      }
      ctx.globalAlpha = 1;
    }
  }, [
    p.objects,
    p.date,
    p.location,
    p.view,
    p.selected,
    p.lines,
    p.labels,
    p.grid,
    p.night,
    size,
    constellationLines,
  ]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="Interactive sky map. Drag to look around, use arrow keys to pan, and plus or minus to zoom. Search objects for an accessible alternative."
      tabIndex={0}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = {
          x: e.clientX,
          y: e.clientY,
          az: p.view.az,
          alt: p.view.alt,
          moved: false,
        };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x,
          dy = e.clientY - d.y;
        if (Math.hypot(dx, dy) > 4) d.moved = true;
        p.onView({
          ...p.view,
          az: (d.az - (dx * p.view.fov) / size.width + 720) % 360,
          alt: Math.max(
            -89,
            Math.min(89, d.alt + (dy * p.view.fov) / size.width),
          ),
        });
      }}
      onPointerUp={(e) => {
        if (drag.current && !drag.current.moved) {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left,
            y = e.clientY - rect.top;
          const hit = hits.current
            .filter((s) => Math.hypot(s.x - x, s.y - y) < 18)
            .sort(
              (a, b) =>
                Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y),
            )[0];
          if (hit) p.onSelect(hit.id);
        }
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onWheel={(e) =>
        p.onView({
          ...p.view,
          fov: Math.max(
            25,
            Math.min(120, p.view.fov + Math.sign(e.deltaY) * 5),
          ),
        })
      }
      onKeyDown={(e) => {
        const d: { [k: string]: Partial<View> } = {
          ArrowLeft: { az: (p.view.az + 350) % 360 },
          ArrowRight: { az: (p.view.az + 10) % 360 },
          ArrowUp: { alt: Math.min(89, p.view.alt + 10) },
          ArrowDown: { alt: Math.max(-89, p.view.alt - 10) },
          "+": { fov: Math.max(25, p.view.fov - 10) },
          "-": { fov: Math.min(120, p.view.fov + 10) },
        };
        if (d[e.key]) {
          e.preventDefault();
          p.onView({ ...p.view, ...d[e.key] });
        }
      }}
    />
  );
}
