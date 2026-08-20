"use client";

import { useMemo, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  buildOrderPrompt,
  runOrderBlock,
  type OrderBlock as OrderBlockData,
  type OrderItem,
} from "@/lib/interactive-blocks";
import type { MentorActionContext } from "@/lib/mentor-actions";
import type { Lang } from "@/lib/i18n";
import { siteCopy } from "@/lib/site-copy";
import { InteractiveCardShell } from "./interactive-card-shell";
import { RollLabel } from "@/components/motion/roll-label";
import { Reveal } from "@/components/motion/reveal";

function reorderItems(items: OrderItem[], index: number, delta: -1 | 1) {
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  return arrayMove(items, index, target);
}

function toDomId(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "order";
}

function SortableOrderItem({
  item,
  index,
  isFirst,
  isLast,
  onMove,
  lang,
}: {
  item: OrderItem;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onMove: (index: number, delta: -1 | 1) => void;
  lang: Lang;
}) {
  const orderT = siteCopy[lang].blocks.order;
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: item.id });

  return (
    <li
      ref={setNodeRef}
      className={isDragging ? "is-dragging" : ""}
      style={{
        transform: (() => {
          const t = CSS.Transform.toString(transform);
          return isDragging && t ? `${t} rotate(-1.2deg)` : (t ?? undefined);
        })(),
        transition,
      }}
    >
      <button
        type="button"
        className="interactive-order-handle"
        aria-label={orderT.dragAria(item.text)}
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true" className="interactive-order-grip" />
      </button>
      <span className="interactive-order-text">{item.text}</span>
      <div className="interactive-order-controls">
        <button type="button" onClick={() => onMove(index, -1)} disabled={isFirst} aria-label={orderT.moveUpAria(item.text)}>
          ↑
        </button>
        <button type="button" onClick={() => onMove(index, 1)} disabled={isLast} aria-label={orderT.moveDownAria(item.text)}>
          ↓
        </button>
      </div>
    </li>
  );
}

export function OrderBlock({
  block,
  mentorActionContext,
  lang,
}: {
  block: OrderBlockData;
  mentorActionContext?: MentorActionContext;
  lang: Lang;
}) {
  const common = siteCopy[lang].blocks.common;
  const copyT = siteCopy[lang].reader.copy;
  const [items, setItems] = useState(block.items);
  const [submitted, setSubmitted] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "done" | "fail">("idle");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const dndContextId = useMemo(() => `agentmentor-order-${toDomId(block.id)}`, [block.id]);
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const isCorrect = useMemo(
    () => items.map((item) => item.id).join("|") === block.correctOrder.join("|"),
    [items, block.correctOrder],
  );
  const markChanged = () => {
    setSubmitted(false);
    setCopyState("idle");
  };
  const moveItem = (index: number, delta: -1 | 1) => {
    markChanged();
    setItems((prev) => reorderItems(prev, index, delta));
  };
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    markChanged();
    setItems((prev) => {
      const oldIndex = prev.findIndex((item) => item.id === active.id);
      const newIndex = prev.findIndex((item) => item.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };
  const checkFeedback = () => {
    setSubmitted(true);
  };
  const reset = () => {
    setItems(block.items);
    setSubmitted(false);
    setCopyState("idle");
  };
  const copy = async () => {
    const result = runOrderBlock(block, items);
    try {
      await navigator.clipboard.writeText(buildOrderPrompt(block, result, lang, mentorActionContext));
      setCopyState("done");
    } catch {
      setCopyState("fail");
    }
  };

  return (
    <InteractiveCardShell eyebrow={block.label} title={block.prompt}>
      <DndContext
        id={dndContextId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          <ol className="interactive-order-list">
            {items.map((item, index) => (
              <SortableOrderItem
                key={item.id}
                item={item}
                index={index}
                isFirst={index === 0}
                isLast={index === items.length - 1}
                onMove={moveItem}
                lang={lang}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <Reveal show={submitted}>
        <p className={isCorrect ? "interactive-feedback is-correct" : "interactive-feedback is-wrong"}>
          {isCorrect ? block.feedback : block.feedbackWrong}
        </p>
      </Reveal>
      <div className="interactive-actions">
        <button type="button" onClick={checkFeedback}>{common.showFeedback}</button>
        <button type="button" onClick={reset}>{common.reset}</button>
        <button type="button" onClick={copy}>
          <RollLabel state={copyState} idle={common.copyToAgent} done={copyT.copied} fail={copyT.failed} />
        </button>
      </div>
    </InteractiveCardShell>
  );
}
