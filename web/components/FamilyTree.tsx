"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  BackgroundVariant,
  type NodeTypes,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useRouter } from "next/navigation";
import type { FamilyNode as ApiNode, FamilyEdge as ApiEdge } from "@/lib/api";

// ─── Constantes de layout ─────────────────────────────────────────────────────
const NODE_W = 210;
const NODE_H = 70;
const RANK_H = 130;    // distancia vertical entre generaciones
const NODE_GAP = 250;  // distancia horizontal entre nodos del mismo nivel

// ─── Layout genealógico sin dependencias externas ─────────────────────────────
// Tipos "padre" son aristas de ancestor→descendant (source arriba, target abajo).
// Tipos "mismo nivel" (cónyuge, hermanos) van en la misma fila.
const PARENT_TYPES = new Set(["padre", "madre", "abuelo", "abuela", "tio", "tia"]);
const SAME_LEVEL   = new Set(["conyuge", "hermano", "hermana", "primo", "prima"]);

function computePositions(
  apiNodes: ApiNode[],
  apiEdges: ApiEdge[],
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (apiNodes.length === 0) return positions;
  if (apiNodes.length === 1) {
    positions.set(apiNodes[0].contact_id, { x: 0, y: 0 });
    return positions;
  }

  const allIds = apiNodes.map((n) => n.contact_id);

  // Adyacencias
  const parentOf  = new Map<string, Set<string>>(); // id → hijos
  const childOf   = new Map<string, Set<string>>(); // id → padres (en el grafo)
  const levelPeer = new Map<string, Set<string>>(); // id → mismo nivel

  allIds.forEach((id) => {
    parentOf.set(id, new Set());
    childOf.set(id, new Set());
    levelPeer.set(id, new Set());
  });

  apiEdges.forEach((e) => {
    if (PARENT_TYPES.has(e.type_id)) {
      parentOf.get(e.source)?.add(e.target);
      childOf.get(e.target)?.add(e.source);
    } else if (SAME_LEVEL.has(e.type_id)) {
      levelPeer.get(e.source)?.add(e.target);
      levelPeer.get(e.target)?.add(e.source);
    }
  });

  // Asignar generación (rank) por BFS desde los nodos sin padres en el grafo
  const rank = new Map<string, number>();
  const roots = allIds.filter((id) => childOf.get(id)!.size === 0);
  const queue = [...roots];
  roots.forEach((r) => rank.set(r, 0));

  while (queue.length > 0) {
    const id = queue.shift()!;
    const r = rank.get(id)!;

    // Hijos quedan un nivel abajo
    parentOf.get(id)?.forEach((child) => {
      if (!rank.has(child)) {
        rank.set(child, r + 1);
        queue.push(child);
      }
    });

    // Pares de mismo nivel (cónyuge/hermanos) quedan al mismo nivel
    levelPeer.get(id)?.forEach((peer) => {
      if (!rank.has(peer)) {
        rank.set(peer, r);
        queue.push(peer);
      }
    });
  }

  // Nodos no alcanzados (sin relaciones en el grafo) → rank 0
  allIds.forEach((id) => { if (!rank.has(id)) rank.set(id, 0); });

  // Agrupar por rank
  const byRank = new Map<number, string[]>();
  allIds.forEach((id) => {
    const r = rank.get(id)!;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(id);
  });

  // Calcular posiciones: cada rank centrado horizontalmente
  const sortedRanks = Array.from(byRank.keys()).sort((a, b) => a - b);
  sortedRanks.forEach((r) => {
    const nodes = byRank.get(r)!;
    const rankW = (nodes.length - 1) * NODE_GAP;
    nodes.forEach((id, i) => {
      positions.set(id, {
        x: i * NODE_GAP - rankW / 2,
        y: r * RANK_H,
      });
    });
  });

  return positions;
}

// ─── Nodo personalizado ───────────────────────────────────────────────────────
type NodeData = ApiNode & { isRoot: boolean };

function FamilyNodeComp({ data }: { data: NodeData }) {
  const router = useRouter();

  const genderColor =
    data.gender === "MALE"   ? "#38bdf8" :
    data.gender === "FEMALE" ? "#f472b6" :
                               "#6b7280";

  return (
    <div
      className={`fn-node${data.isRoot ? " fn-root" : ""}`}
      style={{ borderColor: genderColor + "88", cursor: data.isRoot ? "default" : "pointer" }}
      onClick={() => { if (!data.isRoot) router.push(`/contacto/${data.contact_id}/arbol`); }}
      title={data.isRoot ? undefined : "Ver árbol de esta persona"}
    >
      <Handle type="target" position={Position.Top}    style={{ opacity: 0 }} />
      <div className="fn-bar" style={{ background: genderColor }} />
      <div className="fn-body">
        <span className="fn-name">{data.first_name} {data.surname}</span>
        {data.isRoot && <span className="fn-badge">centro</span>}
        {!data.has_location && (
          <span className="fn-no-loc" title="Sin ubicación en mapa" />
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

const NODE_TYPES: NodeTypes = {
  familyNode: FamilyNodeComp as unknown as NodeTypes[string],
};

// ─── Estilo de aristas por tipo ───────────────────────────────────────────────
function edgeStyle(typeId: string): React.CSSProperties {
  switch (typeId) {
    case "conyuge":
      return { stroke: "#f472b6", strokeDasharray: "6 3", strokeWidth: 1.8 };
    case "hermano": case "hermana":
      return { stroke: "#a78bfa", strokeDasharray: "5 3", strokeWidth: 1.6 };
    case "primo":   case "prima":
      return { stroke: "#a78bfa", strokeDasharray: "3 4", strokeWidth: 1.3, opacity: 0.7 };
    case "tio":     case "tia":
      return { stroke: "#6ee7b7", strokeWidth: 1.5, opacity: 0.8 };
    default:
      return { stroke: "#38bdf8", strokeWidth: 2 };
  }
}

// ─── Construcción del grafo React Flow ────────────────────────────────────────
function buildFlow(
  apiNodes: ApiNode[],
  apiEdges: ApiEdge[],
  rootId: string,
): { nodes: Node[]; edges: Edge[] } {
  const positions = computePositions(apiNodes, apiEdges);

  const nodes: Node[] = apiNodes.map((n) => {
    const pos = positions.get(n.contact_id) ?? { x: 0, y: 0 };
    return {
      id: n.contact_id,
      type: "familyNode",
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: { ...n, isRoot: n.contact_id === rootId } as unknown as Record<string, unknown>,
      draggable: true,
    };
  });

  const edges: Edge[] = apiEdges.map((e) => ({
    id: `e-${e.id}`,
    source: e.source,
    target: e.target,
    label: e.label,
    type: "smoothstep",
    style: edgeStyle(e.type_id),
    labelStyle: { fontSize: 10, fill: "#9aa7b4", fontFamily: "inherit" },
    labelBgStyle: { fill: "rgba(11,15,20,0.88)" },
    labelBgPadding: [4, 6] as [number, number],
    labelBgBorderRadius: 4,
  }));

  return { nodes, edges };
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function FamilyTree({
  apiNodes,
  apiEdges,
  rootId,
}: {
  apiNodes: ApiNode[];
  apiEdges: ApiEdge[];
  rootId: string;
}) {
  const { nodes, edges } = useMemo(
    () => buildFlow(apiNodes, apiEdges, rootId),
    [apiNodes, apiEdges, rootId],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      fitView
      fitViewOptions={{ padding: 0.25, maxZoom: 1.2 }}
      minZoom={0.2}
      maxZoom={2.5}
      colorMode="dark"
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} color="#1a2030" gap={22} size={1.2} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
