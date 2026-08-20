"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  useReactFlow,
} from "@xyflow/react";
import {
  buildHotspotPrompt,
  runHotspotCheck,
  type HotspotBlock as HotspotBlockData,
} from "@/lib/learning-interactions";
import type { MentorActionContext } from "@/lib/mentor-actions";
import type { Lang } from "@/lib/i18n";
import { siteCopy } from "@/lib/site-copy";
import { InteractiveCardShell } from "./interactive-card-shell";
import { Reveal } from "@/components/motion/reveal";
import { RollLabel } from "@/components/motion/roll-label";

type HotspotNodeStatus = "idle" | "correct" | "wrong";

type HotspotNodeData = {
  label: string;
  status: HotspotNodeStatus;
  active: boolean;
};

type HotspotEdgeData = {
  label: string;
};

type HotspotFlowNode = Node<HotspotNodeData, "hotspotNode">;
type HotspotFlowEdge = Edge<HotspotEdgeData, "hotspotEdge">;

const FLOW_WIDTH = 620;
const FLOW_HEIGHT = 420;
const NODE_ORIGIN: [number, number] = [0.5, 0.5];
const FIT_VIEW_OPTIONS = { padding: 0.18, minZoom: 0.55, maxZoom: 1.3 };
const NODE_TYPES = { hotspotNode: HotspotNode };
const EDGE_TYPES = { hotspotEdge: HotspotEdge };
const HORIZONTAL_LABEL_GAP = 46;
const VERTICAL_LABEL_GAP = 10;

const HANDLE_POSITIONS = [
  ["source-left", "target-left", Position.Left],
  ["source-right", "target-right", Position.Right],
  ["source-top", "target-top", Position.Top],
  ["source-bottom", "target-bottom", Position.Bottom],
] as const;

function HotspotNode({ data }: NodeProps<HotspotFlowNode>) {
  return (
    <div
      className={`hotspot-flow-node nodrag nopan${data.active ? " is-active" : ""}${data.status !== "idle" ? ` is-${data.status}` : ""}`}
    >
      {HANDLE_POSITIONS.map(([sourceId, targetId, position]) => (
        <span key={position}>
          <Handle id={sourceId} type="source" position={position} isConnectable={false} className="hotspot-flow-handle" />
          <Handle id={targetId} type="target" position={position} isConnectable={false} className="hotspot-flow-handle" />
        </span>
      ))}
      <span>{data.label}</span>
    </div>
  );
}

function HotspotEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<HotspotFlowEdge>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
  });
  const labelPlacement = edgeLabelPlacement(sourceX, sourceY, targetX, targetY, labelX, labelY);

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} className="hotspot-flow-edge-path" />
      {data?.label ? (
        <EdgeLabelRenderer>
          <div
            className="hotspot-flow-edge-label nodrag nopan"
            data-connector={labelPlacement.connector}
            style={{
              "--hotspot-edge-label-connector-length": `${labelPlacement.connectorLength}px`,
              transform: labelPlacement.transform,
            } as CSSProperties}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

function pointToFlowPosition(x: number, y: number, flowWidth: number) {
  return {
    x: (x / 100) * flowWidth,
    y: (y / 100) * FLOW_HEIGHT,
  };
}

function handlesForDelta(dx: number, dy: number) {
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: "source-right", targetHandle: "target-left" }
      : { sourceHandle: "source-left", targetHandle: "target-right" };
  }

  return dy >= 0
    ? { sourceHandle: "source-bottom", targetHandle: "target-top" }
    : { sourceHandle: "source-top", targetHandle: "target-bottom" };
}

function edgeLabelPlacement(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  labelX: number,
  labelY: number,
) {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      connector: "bottom",
      connectorLength: HORIZONTAL_LABEL_GAP,
      transform: `translate(-50%, -100%) translate(${labelX}px, ${labelY - HORIZONTAL_LABEL_GAP}px)`,
    };
  }

  const shouldPlaceLeft = labelX > FLOW_WIDTH / 2;
  return shouldPlaceLeft
    ? {
      connector: "right",
      connectorLength: VERTICAL_LABEL_GAP,
      transform: `translate(-100%, -50%) translate(${labelX - VERTICAL_LABEL_GAP}px, ${labelY}px)`,
    }
    : {
      connector: "left",
      connectorLength: VERTICAL_LABEL_GAP,
      transform: `translate(0, -50%) translate(${labelX + VERTICAL_LABEL_GAP}px, ${labelY}px)`,
    };
}

function HotspotFlowAutoFit({ fitKey }: { fitKey: string }) {
  const { fitView } = useReactFlow<HotspotFlowNode, HotspotFlowEdge>();

  useEffect(() => {
    let frame = 0;
    const refit = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        fitView(FIT_VIEW_OPTIONS);
      });
    };

    refit();
    window.addEventListener("resize", refit);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", refit);
    };
  }, [fitKey, fitView]);

  return null;
}

export function HotspotDiagramBlock({
  block,
  mentorActionContext,
  lang,
}: {
  block: HotspotBlockData;
  mentorActionContext?: MentorActionContext;
  lang: Lang;
}) {
  const common = siteCopy[lang].blocks.common;
  const copyT = siteCopy[lang].reader.copy;
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [hasChecked, setHasChecked] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "done" | "fail">("idle");
  const nodeById = useMemo(() => new Map(block.nodes.map((node) => [node.id, node])), [block.nodes]);
  const result = useMemo(() => runHotspotCheck(block, selectedNodeId), [block, selectedNodeId]);
  // narrow container: shrink coordinate width to avoid horizontal overflow (acceptance P2-5)
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageWidth, setStageWidth] = useState(0);
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => setStageWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const flowWidth = stageWidth > 0 ? Math.min(FLOW_WIDTH, stageWidth) : FLOW_WIDTH;
  // canvas height from node vertical span — short diagrams get shorter canvas
  const stageFitHeight = useMemo(() => {
    if (block.nodes.length === 0) return FLOW_HEIGHT;
    const ys = block.nodes.map((node) => node.y);
    const spanY = Math.max(...ys) - Math.min(...ys);
    return Math.round(Math.min(360, Math.max(150, (spanY / 100) * FLOW_HEIGHT + 120)));
  }, [block.nodes]);
  const fitKey = `${block.id}:${block.nodes.length}:${block.edges.length}:${flowWidth}`;
  const nodes = useMemo<HotspotFlowNode[]>(() => block.nodes.map((node) => {
    const isSelected = node.id === selectedNodeId;
    const status: HotspotNodeStatus = hasChecked && isSelected
      ? result.passed ? "correct" : "wrong"
      : "idle";

    return {
      id: node.id,
      type: "hotspotNode",
      position: pointToFlowPosition(node.x, node.y, flowWidth),
      data: {
        label: node.label,
        active: isSelected,
        status,
      },
      draggable: false,
      selectable: false,
      connectable: false,
      focusable: true,
      ariaRole: "button",
      domAttributes: { "aria-pressed": isSelected },
    };
  }), [block.nodes, flowWidth, hasChecked, result.passed, selectedNodeId]);
  const edges = useMemo<HotspotFlowEdge[]>(() => block.edges.flatMap((edge) => {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) return [];

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const { sourceHandle, targetHandle } = handlesForDelta(dx, dy);

    return [{
      id: `${edge.from}-${edge.to}-${edge.label}`,
      source: edge.from,
      target: edge.to,
      sourceHandle,
      targetHandle,
      type: "hotspotEdge",
      data: {
        label: edge.label,
      },
      selectable: false,
      focusable: false,
      reconnectable: false,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 12,
        height: 12,
      },
    }];
  }), [block.edges, nodeById]);

  const checkSelection = () => {
    setHasChecked(true);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildHotspotPrompt(block, selectedNodeId, result, lang, mentorActionContext));
      setCopyState("done");
    } catch {
      setCopyState("fail");
    }
    window.setTimeout(() => setCopyState("idle"), 1600);
  };

  return (
    <InteractiveCardShell eyebrow={block.label} title={block.prompt}>
      <p className="learning-interaction-why">{block.whyHere}</p>
      <div
        ref={stageRef}
        className="hotspot-diagram-stage"
        data-layout={block.layout}
        style={{ "--hotspot-stage-fit": `${stageFitHeight}px` } as CSSProperties}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          nodeOrigin={NODE_ORIGIN}
          fitView
          fitViewOptions={FIT_VIEW_OPTIONS}
          minZoom={0.55}
          maxZoom={1.3}
          panOnDrag={false}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable
          edgesFocusable={false}
          edgesReconnectable={false}
          elementsSelectable={false}
          selectNodesOnDrag={false}
          connectOnClick={false}
          autoPanOnConnect={false}
          autoPanOnNodeDrag={false}
          autoPanOnNodeFocus={false}
          deleteKeyCode={null}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
          zoomActivationKeyCode={null}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, node) => {
            setSelectedNodeId(node.id);
            setHasChecked(false);
          }}
        >
          <HotspotFlowAutoFit fitKey={fitKey} />
        </ReactFlow>
      </div>

      <Reveal show={hasChecked}>
        <div
          className={result.passed ? "learning-summary is-correct" : "learning-summary is-wrong"}
          aria-live="polite"
        >
          {result.passed ? common.localCheckPassed : common.localCheckFailed} {result.message}
        </div>
      </Reveal>

      <div className="interactive-actions">
        <button type="button" onClick={checkSelection} disabled={!selectedNodeId}>{common.check}</button>
        <button type="button" onClick={() => { setSelectedNodeId(""); setHasChecked(false); }}>{common.reset}</button>
        <button type="button" onClick={copy}>
          <RollLabel state={copyState} idle={common.copyToAgent} done={copyT.copied} fail={copyT.failed} />
        </button>
      </div>
    </InteractiveCardShell>
  );
}
