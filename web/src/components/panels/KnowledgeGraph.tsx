import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import type { KnowledgeEntry } from "@/lib/api";
import { cn } from "@/lib/utils";

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "to", "of", "and", "or", "in", "on", "at",
  "for", "with", "my", "i", "me", "it", "this", "that", "be", "has", "have", "had", "as",
  "so", "do", "does", "did", "you", "your", "their", "they",
]);

function keywordsOf(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[a-z0-9']+/g) || []).filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

interface Node {
  id: string;
  text: string;
  kw: Set<string>;
  x: number;
  y: number;
  vx: number;
  vy: number;
}
interface Edge {
  a: number;
  b: number;
  strength: number;
}

interface KnowledgeGraphProps {
  entries: KnowledgeEntry[];
  onDelete: (id: string) => void;
}

/** Force-directed graph: nodes are knowledge entries, edges are real
 * lexical-overlap similarity (shared significant words) — not decorative. */
export default function KnowledgeGraph({ entries, onDelete }: KnowledgeGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const dragRef = useRef<Node | null>(null);
  const [selected, setSelected] = useState<Node | null>(null);
  const [dragging, setDragging] = useState(false);

  // (Re)build the graph whenever entries change.
  useEffect(() => {
    const canvas = canvasRef.current;
    const w = canvas?.width ?? 380;
    const h = canvas?.height ?? 200;
    const nodes: Node[] = entries.map((e, i) => ({
      id: e.id,
      text: e.text,
      kw: keywordsOf(e.text),
      x: w / 2 + Math.cos(i) * 40 + (Math.random() - 0.5) * 20,
      y: h / 2 + Math.sin(i) * 40 + (Math.random() - 0.5) * 20,
      vx: 0,
      vy: 0,
    }));
    const edges: Edge[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i],
          b = nodes[j];
        let shared = 0;
        a.kw.forEach((w2) => {
          if (b.kw.has(w2)) shared++;
        });
        const denom = Math.min(a.kw.size, b.kw.size) || 1;
        const strength = shared / denom;
        if (strength > 0.15) edges.push({ a: i, b: j, strength });
      }
    }
    nodesRef.current = nodes;
    edgesRef.current = edges;
    setSelected(null);
  }, [entries]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;

    function step() {
      const w = canvas!.width,
        h = canvas!.height;
      const cx = w / 2,
        cy = h / 2;
      const nodes = nodesRef.current;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i],
            b = nodes[j];
          let dx = a.x - b.x,
            dy = a.y - b.y;
          const dist2 = dx * dx + dy * dy || 0.01;
          const force = 900 / dist2;
          const dist = Math.sqrt(dist2);
          dx /= dist;
          dy /= dist;
          a.vx += dx * force;
          a.vy += dy * force;
          b.vx -= dx * force;
          b.vy -= dy * force;
        }
      }
      edgesRef.current.forEach(({ a: ai, b: bi, strength }) => {
        const a = nodes[ai],
          b = nodes[bi];
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const targetDist = 70 - strength * 35;
        const force = (dist - targetDist) * 0.02;
        const fx = (dx / dist) * force,
          fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      });
      nodes.forEach((n) => {
        n.vx += (cx - n.x) * 0.002;
        n.vy += (cy - n.y) * 0.002;
      });
      nodes.forEach((n) => {
        if (n === dragRef.current) return;
        n.vx *= 0.82;
        n.vy *= 0.82;
        n.x += n.vx;
        n.y += n.vy;
        n.x = Math.max(14, Math.min(w - 14, n.x));
        n.y = Math.max(14, Math.min(h - 14, n.y));
      });

      ctx!.clearRect(0, 0, w, h);
      if (!nodes.length) {
        ctx!.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--muted-foreground").trim() || "#aaa";
        ctx!.font = "12px -apple-system, sans-serif";
        ctx!.textAlign = "center";
        ctx!.fillText("Nothing saved yet — add something above", w / 2, h / 2);
      } else {
        const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#7C5CFF";
        const border = getComputedStyle(document.documentElement).getPropertyValue("--border-strong").trim() || "rgba(0,0,0,0.2)";

        edgesRef.current.forEach(({ a, b, strength }) => {
          const na = nodes[a],
            nb = nodes[b];
          ctx!.strokeStyle = border;
          ctx!.globalAlpha = 0.25 + strength * 0.5;
          ctx!.lineWidth = 1 + strength;
          ctx!.beginPath();
          ctx!.moveTo(na.x, na.y);
          ctx!.lineTo(nb.x, nb.y);
          ctx!.stroke();
        });
        ctx!.globalAlpha = 1;

        nodes.forEach((n) => {
          const isSelected = selected?.id === n.id;
          ctx!.beginPath();
          ctx!.arc(n.x, n.y, isSelected ? 9 : 6, 0, Math.PI * 2);
          ctx!.fillStyle = isSelected ? accent : border || "#999";
          ctx!.fill();
          if (isSelected) {
            ctx!.lineWidth = 2;
            ctx!.strokeStyle = accent;
            ctx!.stroke();
          }
        });
      }
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [selected]);

  function canvasPoint(e: { clientX: number; clientY: number }) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width,
      scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }
  function nodeAt(px: number, py: number) {
    return nodesRef.current.find((n) => Math.hypot(n.x - px, n.y - py) < 12);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={380}
        height={200}
        className={cn(
          "block w-full rounded-[14px] border border-border bg-muted",
          dragging ? "cursor-grabbing" : "cursor-grab"
        )}
        onPointerDown={(e) => {
          const p = canvasPoint(e);
          const n = nodeAt(p.x, p.y);
          if (n) {
            dragRef.current = n;
            setDragging(true);
            setSelected(n);
          }
        }}
        onPointerMove={(e) => {
          if (!dragRef.current) return;
          const p = canvasPoint(e);
          dragRef.current.x = p.x;
          dragRef.current.y = p.y;
          dragRef.current.vx = 0;
          dragRef.current.vy = 0;
        }}
        onPointerUp={() => {
          dragRef.current = null;
          setDragging(false);
        }}
        onClick={(e) => {
          if (dragRef.current) return;
          const p = canvasPoint(e);
          const n = nodeAt(p.x, p.y);
          setSelected(n || null);
        }}
      />
      {selected && (
        <div className="mt-2 flex items-start gap-2.5 rounded-xl border border-border bg-muted px-3 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
          <span className="flex-1">{selected.text}</span>
          <button
            className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
            title="Remove"
            onClick={() => {
              const id = selected.id;
              setSelected(null);
              onDelete(id);
            }}
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
