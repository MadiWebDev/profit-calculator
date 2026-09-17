"use client";

import {
  useEditor,
  EditorContent,
  NodeViewWrapper,
  NodeViewProps,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { Node, mergeAttributes, Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle, Color } from "@tiptap/extension-text-style"; 
import { Highlight } from "@tiptap/extension-highlight";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  Link as LinkIcon,
  Image as ImageIcon,
  Heading1,
  Heading2,
  Heading3,
  Underline as UnderlineIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  X,
  Code2,
  Columns2,
  Baseline,
  Highlighter,
  Video,
  Minus,
  Maximize2,
  Minimize2,
  Globe,
  FileCode2,
  RotateCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState, useCallback, useRef } from "react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const lowlight = createLowlight(common);

// ─────────────────────────────────────────────────────────────────────────────
// Shared ProseMirror helpers — insert / replace / remove a block node by a
// matcher on its attrs. Used by every "upload a placeholder, then swap it for
// the real thing" flow (images, videos, rows, ...).
// ─────────────────────────────────────────────────────────────────────────────

function insertBlockNode(
  editor: any,
  typeName: string,
  attrs: Record<string, unknown>,
) {
  if (!editor) return;
  const { state, dispatch } = editor.view;
  const { schema, selection, tr } = state;
  const nodeType = schema.nodes[typeName];
  if (!nodeType) return;
  const node = nodeType.create(attrs);
  const $anchor = selection.$anchor;
  let insertPos = $anchor.after($anchor.depth);
  if (insertPos >= state.doc.content.size) insertPos = state.doc.content.size;
  dispatch(tr.insert(insertPos, node));
}

function replaceNodeByMatcher(
  editor: any,
  typeName: string,
  matcher: (attrs: any) => boolean,
  newAttrs: Record<string, unknown>,
): boolean {
  if (!editor) return false;
  const { state, dispatch } = editor.view;
  const { tr } = state;
  let found = false;
  state.doc.descendants((node: any, pos: number) => {
    if (found) return false;
    if (node.type.name === typeName && matcher(node.attrs)) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...newAttrs });
      found = true;
      return false;
    }
    return true;
  });
  if (found) dispatch(tr);
  return found;
}

function removeNodeByMatcher(
  editor: any,
  typeName: string,
  matcher: (attrs: any) => boolean,
): boolean {
  if (!editor) return false;
  const { state, dispatch } = editor.view;
  const { tr } = state;
  let target: { pos: number; size: number } | null = null;
  state.doc.descendants((node: any, pos: number) => {
    if (target) return false;
    if (node.type.name === typeName && matcher(node.attrs)) {
      target = { pos, size: node.nodeSize };
      return false;
    }
    return true;
  });
  if (target) {
    const t = target as { pos: number; size: number };
    dispatch(tr.delete(t.pos, t.pos + t.size));
    return true;
  }
  return false;
}

function placeholderSvg(label: string, w = 800, h = 200) {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#f3f4f6" rx="8"/>
            <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"
                  font-family="sans-serif" font-size="16" fill="#9ca3af">${label}</text>
        </svg>`,
  )}`;
}

/** Turns a YouTube / Vimeo URL into its embeddable iframe URL. Returns null for anything else. */
function toEmbedUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");

    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] === "embed" && parts[1]) return raw;
      if (parts[0] === "shorts" && parts[1])
        return `https://www.youtube.com/embed/${parts[1]}`;
      return null;
    }
    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DragHandle ProseMirror Plugin
// Shows a grip icon on the left when hovering a top-level block.
// Uses HTML5 drag-and-drop to reorder nodes.
// ─────────────────────────────────────────────────────────────────────────────

const dragHandlePluginKey = new PluginKey("dragHandle");

function createDragHandlePlugin() {
  let handle: HTMLElement | null = null;
  let hoveredNodePos: number | null = null;
  let dragging = false;
  let dragFromPos: number | null = null;
  let currentView: any = null;

  function getHandle(): HTMLElement {
    if (!handle) {
      handle = document.createElement("div");
      handle.setAttribute("data-drag-handle", "");
      handle.style.cssText = [
        "position:absolute",
        "left:-28px",
        "top:0",
        "width:20px",
        "height:24px",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "cursor:grab",
        "opacity:0",
        "transition:opacity 0.15s",
        "color:#9ca3af",
        "border-radius:4px",
        "z-index:50",
        "user-select:none",
      ].join(";");

      handle.innerHTML = `<svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor">
                <circle cx="3" cy="3" r="1.5"/><circle cx="9" cy="3" r="1.5"/>
                <circle cx="3" cy="9" r="1.5"/><circle cx="9" cy="9" r="1.5"/>
                <circle cx="3" cy="15" r="1.5"/><circle cx="9" cy="15" r="1.5"/>
            </svg>`;

      handle.draggable = true;

      handle.addEventListener("mouseover", () => {
        handle!.style.opacity = "1";
        handle!.style.color = "#6366f1";
        handle!.style.background = "rgba(99,102,241,0.08)";
      });
      handle.addEventListener("mouseout", () => {
        if (!dragging) {
          handle!.style.opacity = "0";
          handle!.style.color = "#9ca3af";
          handle!.style.background = "";
        }
      });

      handle.addEventListener("dragstart", (e) => {
        if (hoveredNodePos === null || !currentView) return;
        dragging = true;
        dragFromPos = hoveredNodePos;
        handle!.style.opacity = "1";
        handle!.style.cursor = "grabbing";

        const domNode = currentView.nodeDOM(
          hoveredNodePos,
        ) as HTMLElement | null;
        if (domNode && e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setDragImage(domNode, 0, 10);
        }
      });

      handle.addEventListener("dragend", () => {
        dragging = false;
        dragFromPos = null;
        handle!.style.opacity = "0";
        handle!.style.cursor = "grab";
        handle!.style.background = "";
        document
          .querySelectorAll("[data-drop-indicator]")
          .forEach((el) => el.remove());
      });
    }
    return handle;
  }

  return new Plugin({
    key: dragHandlePluginKey,

    view(editorView) {
      currentView = editorView;
      const h = getHandle();

      const wrapper = editorView.dom.parentElement;
      if (wrapper) {
        const existing = window.getComputedStyle(wrapper).position;
        if (existing === "static") wrapper.style.position = "relative";
      }
      editorView.dom.parentElement?.appendChild(h);

      return {
        destroy() {
          h.remove();
          handle = null;
          currentView = null;
        },
      };
    },

    props: {
      handleDOMEvents: {
        mousemove(view, event) {
          const h = getHandle();
          if (dragging) return false;

          const coords = { left: event.clientX, top: event.clientY };
          const pos = view.posAtCoords(coords);
          if (!pos) {
            h.style.opacity = "0";
            return false;
          }

          const $pos = view.state.doc.resolve(pos.pos);
          let depth = $pos.depth;
          while (depth > 1) depth--;
          const nodePos = $pos.before(depth > 0 ? depth : 1);

          const domNode = view.nodeDOM(nodePos) as HTMLElement | null;
          if (!domNode) {
            h.style.opacity = "0";
            return false;
          }

          const editorRect = view.dom.getBoundingClientRect();
          const nodeRect = domNode.getBoundingClientRect();
          const top =
            nodeRect.top -
            editorRect.top +
            (view.dom.parentElement?.scrollTop ?? 0);

          h.style.top = `${top + nodeRect.height / 2 - 12}px`;
          h.style.opacity = "1";
          hoveredNodePos = nodePos;
          currentView = view;

          return false;
        },

        mouseleave(view) {
          if (!dragging) getHandle().style.opacity = "0";
          return false;
        },

        dragover(view, event) {
          event.preventDefault();
          if (!event.dataTransfer) return false;
          event.dataTransfer.dropEffect = "move";

          const coords = { left: event.clientX, top: event.clientY };
          const pos = view.posAtCoords(coords);
          if (!pos) return false;

          document
            .querySelectorAll("[data-drop-indicator]")
            .forEach((el) => el.remove());

          const $pos = view.state.doc.resolve(pos.pos);
          let depth = $pos.depth;
          while (depth > 1) depth--;
          const nodePos = $pos.before(depth > 0 ? depth : 1);
          const domNode = view.nodeDOM(nodePos) as HTMLElement | null;
          if (!domNode) return false;

          const editorRect = view.dom.getBoundingClientRect();
          const nodeRect = domNode.getBoundingClientRect();
          const relTop =
            nodeRect.top -
            editorRect.top +
            (view.dom.parentElement?.scrollTop ?? 0);
          const isBefore = event.clientY < nodeRect.top + nodeRect.height / 2;

          const line = document.createElement("div");
          line.setAttribute("data-drop-indicator", "");
          line.style.cssText = `
                        position:absolute;
                        left:0;right:0;
                        top:${isBefore ? relTop - 2 : relTop + nodeRect.height - 2}px;
                        height:3px;
                        background:#6366f1;
                        border-radius:2px;
                        pointer-events:none;
                        z-index:100;
                    `;
          view.dom.parentElement?.appendChild(line);

          return false;
        },

        drop(view, event) {
          event.preventDefault();
          document
            .querySelectorAll("[data-drop-indicator]")
            .forEach((el) => el.remove());

          if (dragFromPos === null) return false;

          const coords = { left: event.clientX, top: event.clientY };
          const dropResult = view.posAtCoords(coords);
          if (!dropResult) return false;

          const { state, dispatch } = view;
          const { tr, doc } = state;

          const fromNode = doc.nodeAt(dragFromPos);
          if (!fromNode) return false;

          const $drop = doc.resolve(dropResult.pos);
          let depth = $drop.depth;
          while (depth > 1) depth--;
          const targetPos = $drop.before(depth > 0 ? depth : 1);

          if (targetPos === dragFromPos) return false;

          const isBefore = dropResult.pos < dragFromPos;
          const nodeSize = fromNode.nodeSize;

          const newTr = tr.delete(dragFromPos, dragFromPos + nodeSize);
          const adjustedTarget = isBefore ? targetPos : targetPos - nodeSize;

          const $target = newTr.doc.resolve(
            Math.min(adjustedTarget, newTr.doc.content.size),
          );
          const insertAt =
            event.clientY <
            (view.nodeDOM(targetPos) as HTMLElement)?.getBoundingClientRect()
              .top +
              ((view.nodeDOM(targetPos) as HTMLElement)?.getBoundingClientRect()
                .height ?? 0) /
                2
              ? $target.before($target.depth > 0 ? $target.depth : 1)
              : $target.after($target.depth > 0 ? $target.depth : 1);

          newTr.insert(Math.min(insertAt, newTr.doc.content.size), fromNode);
          dispatch(newTr);
          dragFromPos = null;
          return true;
        },
      },
    },
  });
}

const DragHandleExtension = Extension.create({
  name: "dragHandle",
  addProseMirrorPlugins() {
    return [createDragHandlePlugin()];
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Shared alignment mini-toolbar used by every resizable media node
// ─────────────────────────────────────────────────────────────────────────────

function AlignPicker({
  align,
  onChange,
  options = ["left", "center", "right", "inline"] as const,
}: {
  align: string;
  onChange: (a: string) => void;
  options?: readonly string[];
}) {
  const glyph: Record<string, string> = {
    left: "⇤",
    center: "⇔",
    right: "⇥",
    inline: "↔",
  };
  return (
    <>
      {options.map((a) => (
        <button
          key={a}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            onChange(a);
          }}
          className={cn(
            "px-1.5 py-0.5 rounded text-xs font-medium transition-colors",
            align === a
              ? "bg-indigo-600 text-white"
              : "hover:bg-muted text-muted-foreground",
          )}
          title={`Align ${a}`}
        >
          {glyph[a]}
        </button>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ResizableImage — custom Node View with drag-to-resize handles + alignment
// ─────────────────────────────────────────────────────────────────────────────

function ResizableImageView({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [isRotating, setIsRotating] = useState(false);

  const width: number | string = node.attrs.width || "auto";
  const align: string = node.attrs.align || "center";
  const height: number | string = node.attrs.height || "auto";
  const rotation: number = node.attrs.rotation || 0;

  const startResize = useCallback(
    (
      e: React.MouseEvent,
      handle: "e" | "w" | "n" | "s" | "se" | "sw" | "ne" | "nw",
    ) => {
      e.preventDefault();
      e.stopPropagation();

      const img = imgRef.current;
      if (!img) return;

      const startX = e.clientX;
      const startY = e.clientY;

      const startWidth = img.offsetWidth;
      const startHeight = img.offsetHeight;

      if (!startWidth || !startHeight) return;

      const aspectRatio = startWidth / startHeight;

      const MIN_WIDTH = 80;
      const MIN_HEIGHT = 80;

      // Mouse deltas arrive in screen space, but the box is visually rotated.
      // Rotate the delta vector by -rotation so it lines up with the box's
      // own (unrotated) width/height axes before we apply it.
      const rad = (-rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      setIsResizing(true);

      const onMove = (ev: MouseEvent) => {
        const rawDeltaX = ev.clientX - startX;
        const rawDeltaY = ev.clientY - startY;
        const deltaX = rawDeltaX * cos - rawDeltaY * sin;
        const deltaY = rawDeltaX * sin + rawDeltaY * cos;

        let newWidth = startWidth;
        let newHeight = startHeight;

        switch (handle) {
          case "e": {
            newWidth = Math.max(MIN_WIDTH, startWidth + deltaX);
            newHeight = newWidth / aspectRatio;
            break;
          }
          case "w": {
            newWidth = Math.max(MIN_WIDTH, startWidth - deltaX);
            newHeight = newWidth / aspectRatio;
            break;
          }
          case "n": {
            newHeight = Math.max(MIN_HEIGHT, startHeight - deltaY);
            newWidth = newHeight * aspectRatio;
            break;
          }
          case "s": {
            newHeight = Math.max(MIN_HEIGHT, startHeight + deltaY);
            newWidth = newHeight * aspectRatio;
            break;
          }
          case "se": {
            const widthFromX = startWidth + deltaX;
            const heightFromY = startHeight + deltaY;
            if (Math.abs(deltaX) >= Math.abs(deltaY)) {
              newWidth = Math.max(MIN_WIDTH, widthFromX);
              newHeight = newWidth / aspectRatio;
            } else {
              newHeight = Math.max(MIN_HEIGHT, heightFromY);
              newWidth = newHeight * aspectRatio;
            }
            break;
          }
          case "sw": {
            const widthFromX = startWidth - deltaX;
            const heightFromY = startHeight + deltaY;
            if (Math.abs(deltaX) >= Math.abs(deltaY)) {
              newWidth = Math.max(MIN_WIDTH, widthFromX);
              newHeight = newWidth / aspectRatio;
            } else {
              newHeight = Math.max(MIN_HEIGHT, heightFromY);
              newWidth = newHeight * aspectRatio;
            }
            break;
          }
          case "ne": {
            const widthFromX = startWidth + deltaX;
            const heightFromY = startHeight - deltaY;
            if (Math.abs(deltaX) >= Math.abs(deltaY)) {
              newWidth = Math.max(MIN_WIDTH, widthFromX);
              newHeight = newWidth / aspectRatio;
            } else {
              newHeight = Math.max(MIN_HEIGHT, heightFromY);
              newWidth = newHeight * aspectRatio;
            }
            break;
          }
          case "nw": {
            const widthFromX = startWidth - deltaX;
            const heightFromY = startHeight - deltaY;
            if (Math.abs(deltaX) >= Math.abs(deltaY)) {
              newWidth = Math.max(MIN_WIDTH, widthFromX);
              newHeight = newWidth / aspectRatio;
            } else {
              newHeight = Math.max(MIN_HEIGHT, heightFromY);
              newWidth = newHeight * aspectRatio;
            }
            break;
          }
        }

        updateAttributes({
          width: Math.round(newWidth),
          height: Math.round(newHeight),
        });
      };

      const onUp = () => {
        setIsResizing(false);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [updateAttributes, rotation],
  );

  const startRotate = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const box = boxRef.current;
      if (!box) return;

      // Rotating around the box's own center keeps this stable regardless
      // of the current angle: the AABB of a shape rotated about its center
      // stays centered on that same point.
      const rect = box.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      setIsRotating(true);

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - centerX;
        const dy = ev.clientY - centerY;
        // atan2(dx, -dy) => 0° points straight up, increases clockwise
        let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
        angle = (angle + 360) % 360;
        if (ev.shiftKey) angle = Math.round(angle / 15) * 15; // snap w/ Shift
        updateAttributes({ rotation: Math.round(angle) });
      };

      const onUp = () => {
        setIsRotating(false);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [updateAttributes],
  );

  const alignClass =
    {
      left: "flex justify-start",
      center: "flex justify-center",
      right: "flex justify-end",
      inline: "inline-flex",
    }[align] ?? "flex justify-center";

  const RESIZE_HANDLES: Array<{
    handle: "e" | "w" | "n" | "s" | "se" | "sw" | "ne" | "nw";
    className: string;
    cursor: string;
    corner?: boolean;
  }> = [
    { handle: "e", cursor: "cursor-ew-resize", className: "top-1/2 -right-1 -translate-y-1/2 w-3 h-7" },
    { handle: "w", cursor: "cursor-ew-resize", className: "top-1/2 -left-1.5 -translate-y-1/2 w-3 h-7" },
    { handle: "n", cursor: "cursor-ns-resize", className: "-top-1 left-1/2 -translate-x-1/2 w-7 h-3" },
    { handle: "s", cursor: "cursor-ns-resize", className: "-bottom-1 left-1/2 -translate-x-1/2 w-7 h-3" },
    { handle: "se", cursor: "cursor-nwse-resize", className: "-bottom-1.5 -right-1 w-3.5 h-3.5", corner: true },
    { handle: "sw", cursor: "cursor-nesw-resize", className: "-bottom-1.5 -left-1 w-3.5 h-3.5", corner: true },
    { handle: "ne", cursor: "cursor-nesw-resize", className: "-top-1.5 -right-1 w-3.5 h-3.5", corner: true },
    { handle: "nw", cursor: "cursor-nwse-resize", className: "-top-1.5 -left-1 w-3.5 h-3.5", corner: true },
  ];

  return (
    <NodeViewWrapper
      as="div"
      className="relative my-2 w-full leading-none"
      style={{ display: "block" }}
    >
      <div className={alignClass}>
        <div
          ref={boxRef}
          className={cn(
            "relative select-none",
            selected &&
              "outline outline-2 outline-offset-1 outline-blue-500 rounded",
            (isResizing || isRotating) && "pointer-events-none",
          )}
          style={{
            width: typeof width === "number" ? `${width}px` : "100%",
            height: typeof height === "number" ? `${height}px` : "auto",
            display: "inline-block",
            transform: rotation ? `rotate(${rotation}deg)` : undefined,
            transformOrigin: "center center",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={node.attrs.src}
            alt={node.attrs.alt ?? ""}
            draggable={false}
            className="block w-full rounded-lg"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
            }}
          />

          {selected && (
            <div className="absolute -top-9 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-primary dark:bg-zinc-900 border rounded-lg shadow-lg px-1 py-0.5 z-50 whitespace-nowrap">
              <AlignPicker
                align={align}
                onChange={(a) => updateAttributes({ align: a })}
              />
              <span className="mx-1 text-muted-foreground text-xs border-l pl-1.5">
                {typeof width === "number" ? `${width}px` : "100%"}
              </span>
              <span className="text-muted-foreground text-xs border-l pl-1.5">
                {rotation}°
              </span>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  updateAttributes({ width: null, height: null, rotation: 0 });
                }}
                className="px-1.5 py-0.5 rounded text-xs hover:bg-muted text-muted-foreground"
                title="Reset size & rotation"
              >
                ↺
              </button>
            </div>
          )}

          {selected && (
            <>
              {RESIZE_HANDLES.map(({ handle, className, cursor, corner }) => (
                <div
                  key={handle}
                  onMouseDown={(e) => startResize(e, handle)}
                  className={cn(
                    "absolute bg-primary border-indigo-500 shadow-md z-50 hover:scale-110 transition-transform",
                    corner ? "border-2 rounded-full hover:scale-125" : "border rounded-md",
                    cursor,
                    className,
                  )}
                />
              ))}

              {/* Rotate handle: a stalk + knob above the box, rotates together
                  with the image since it's inside the transformed container */}
              <div
                className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
                style={{ top: -32, width: 2, height: 24, background: "#a5b4fc" }}
              />
              <div
                onMouseDown={startRotate}
                title="Drag to rotate (hold Shift to snap to 15°)"
                className={cn(
                  "absolute left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-primary border-2 border-indigo-500 shadow-md z-50 flex items-center justify-center cursor-grab hover:scale-125 transition-transform",
                  isRotating && "cursor-grabbing scale-125",
                )}
                style={{ top: -40 }}
              >
                <RotateCw className="w-3 h-3 text-indigo-500" />
              </div>
            </>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

const ResizableImage = Node.create({
  name: "image",
  group: "block",
  inline: false,
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      width: { default: null },
      align: { default: "center" },
     rotation: {
  default: 0,
  parseHTML: (el) => {
    const m = el.style.transform?.match(/rotate\(([-\d.]+)deg\)/);
    return m ? parseFloat(m[1]) : 0;
  },
  renderHTML: () => ({}), // handled manually in the node's renderHTML above
},
    };
  },

  parseHTML() {
    return [{ tag: "div[data-image-block] img" }, { tag: "img[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const { width, align, rotation, ...rest } = HTMLAttributes;
    const hasWidth = width != null;
    // When image has a specific pixel width, use display:table so the wrapper
    // shrink-wraps and margin:0 auto / margin-left:auto actually works.
    // When full-width, use text-align on the wrapper block instead.
    const wrapStyle = hasWidth
      ? [
          "display:table",
          `width:${typeof width === "number" ? width + "px" : width}`,
          "max-width:100%",
          align === "center" ? "margin:0 auto" : "",
          align === "right" ? "margin-left:auto;margin-right:0" : "",
          align === "left" ? "margin-right:auto;margin-left:0" : "",
        ]
          .filter(Boolean)
          .join(";")
      : [
          "display:block",
          "width:100%",
          align === "center" ? "text-align:center" : "",
          align === "right" ? "text-align:right" : "",
          align === "left" ? "text-align:left" : "",
        ]
          .filter(Boolean)
          .join(";");
    const imgStyle = [
      hasWidth ? "width:100%" : "width:100%",
      "height:auto",
      "border-radius:8px",
      "display:block",
      rotation ? `transform:rotate(${rotation}deg)` : "",
    ]
      .filter(Boolean)
      .join(";");
    return [
      "div",
      { style: wrapStyle, "data-image-block": "1", "data-align": align ?? "center" },
      ["img", mergeAttributes(rest, { style: imgStyle })],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },

  addCommands() {
    return {
      setImage:
        (attrs: Record<string, unknown>) =>
        ({ state, dispatch }: { state: any; dispatch: any }) => {
          const { schema, selection, tr } = state;
          const imageNode = schema.nodes.image.create(attrs);
          const $anchor = selection.$anchor;
          let insertPos = $anchor.after($anchor.depth);
          if (insertPos >= state.doc.content.size)
            insertPos = state.doc.content.size;
          dispatch(tr.insert(insertPos, imageNode));
          return true;
        },
    } as any;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// ResizableVideo — same idea as ResizableImage, plus loop / mute / autoplay
// toggles, since a video needs more than just a width.
// ─────────────────────────────────────────────────────────────────────────────

function ResizableVideoView({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isResizing, setIsResizing] = useState(false);

  const width: number | string = node.attrs.width || 480;
  const align: string = node.attrs.align || "center";
  const { controls, autoplay, loop, muted } = node.attrs;

  const startResize = useCallback(
    (e: React.MouseEvent, handle: "se" | "sw" | "e" | "w") => {
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startWidth =
        videoRef.current?.offsetWidth ??
        (typeof width === "number" ? width : 480);
      setIsResizing(true);

      const onMove = (ev: MouseEvent) => {
        const delta = handle.includes("e")
          ? ev.clientX - startX
          : startX - ev.clientX;
        const newWidth = Math.max(120, Math.round(startWidth + delta));
        updateAttributes({ width: newWidth });
      };

      const onUp = () => {
        setIsResizing(false);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [width, updateAttributes],
  );

  const alignClass =
    {
      left: "flex justify-start",
      center: "flex justify-center",
      right: "flex justify-end",
    }[align] ?? "flex justify-center";

  const toggle = (key: "loop" | "muted" | "autoplay") => {
    if (key === "autoplay" && !autoplay) {
      // Browsers block autoplay unless the video is muted.
      updateAttributes({ autoplay: true, muted: true });
    } else {
      updateAttributes({ [key]: !node.attrs[key] });
    }
  };

  return (
    <NodeViewWrapper as="div" className="relative my-2 w-full leading-none">
      <div className={alignClass}>
        <div
          className={cn(
            "relative select-none",
            selected &&
              "outline outline-2 outline-offset-1 outline-blue-500 rounded",
            isResizing && "pointer-events-none",
          )}
          style={{
            width: typeof width === "number" ? `${width}px` : width,
            maxWidth: "100%",
            display: "inline-block",
          }}
        >
          <video
            ref={videoRef}
            src={node.attrs.src}
            controls={controls}
            loop={loop}
            muted={muted}
            autoPlay={autoplay}
            playsInline
            className="block w-full h-auto rounded-lg bg-black"
          />

          {selected && (
            <div className="absolute -top-9 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-primary dark:bg-zinc-900 border rounded-lg shadow-lg px-1 py-0.5 z-50 whitespace-nowrap">
              <AlignPicker
                align={align}
                onChange={(a) => updateAttributes({ align: a })}
                options={["left", "center", "right"]}
              />
              <span className="mx-1 border-l pl-1.5" />
              {(["loop", "muted", "autoplay"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    toggle(k);
                  }}
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[10px] font-medium uppercase",
                    node.attrs[k]
                      ? "bg-indigo-600 text-white"
                      : "hover:bg-muted text-muted-foreground",
                  )}
                  title={`Toggle ${k}`}
                >
                  {k[0]}
                </button>
              ))}
              <span className="mx-1 text-muted-foreground text-xs border-l pl-1.5">
                {typeof width === "number" ? `${width}px` : "100%"}
              </span>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  updateAttributes({ width: null });
                }}
                className="px-1.5 py-0.5 rounded text-xs hover:bg-muted text-muted-foreground"
                title="Reset width"
              >
                ↺
              </button>
            </div>
          )}

          {selected && (
            <>
              <div
                onMouseDown={(e) => startResize(e, "e")}
                className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-6 bg-primary border border-indigo-500 rounded cursor-ew-resize shadow z-50"
              />
              <div
                onMouseDown={(e) => startResize(e, "w")}
                className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-6 bg-primary border border-indigo-500 rounded cursor-ew-resize shadow z-50"
              />
              <div
                onMouseDown={(e) => startResize(e, "se")}
                className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-indigo-600 rounded-full cursor-nwse-resize shadow z-50"
              />
              <div
                onMouseDown={(e) => startResize(e, "sw")}
                className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-indigo-600 rounded-full cursor-nesw-resize shadow z-50"
              />
            </>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

const VideoBlock = Node.create({
  name: "videoBlock",
  group: "block",
  inline: false,
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: null },
      controls: { default: true },
      autoplay: { default: false },
      loop: { default: false },
      muted: { default: false },
      width: { default: null },
      align: { default: "center" },
      // Transient upload-tracking id — never written to output HTML.
      phId: {
        default: null,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-video-block] video" }, { tag: "video[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const { width, align, ...rest } = HTMLAttributes;
    const hasWidth = width != null;
    const wrapStyle = hasWidth
      ? [
          "display:table",
          `width:${typeof width === "number" ? width + "px" : width}`,
          "max-width:100%",
          align === "center" ? "margin:0 auto" : "",
          align === "right" ? "margin-left:auto;margin-right:0" : "",
          align === "left" ? "margin-right:auto;margin-left:0" : "",
        ]
          .filter(Boolean)
          .join(";")
      : [
          "display:block",
          "width:100%",
          align === "center" ? "text-align:center" : "",
          align === "right" ? "text-align:right" : "",
          align === "left" ? "text-align:left" : "",
        ]
          .filter(Boolean)
          .join(";");
    const videoStyle = [
      "width:100%",
      "height:auto",
      "border-radius:8px",
      "display:block",
      "background:#000",
    ].join(";");
    return [
      "div",
      { style: wrapStyle, "data-video-block": "1", "data-align": align ?? "center" },
      ["video", mergeAttributes(rest, { style: videoStyle, controls: "true" })],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableVideoView);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// EmbedBlock — iframe embeds for YouTube / Vimeo links, width-resizable with a
// locked 16:9 aspect ratio.
// ─────────────────────────────────────────────────────────────────────────────

function EmbedBlockView({ node, updateAttributes, selected }: NodeViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);

  const width: number | string = node.attrs.width || 560;
  const align: string = node.attrs.align || "center";

  const startResize = useCallback(
    (e: React.MouseEvent, handle: "e" | "w") => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth =
        wrapRef.current?.offsetWidth ??
        (typeof width === "number" ? width : 560);
      setIsResizing(true);
      const onMove = (ev: MouseEvent) => {
        const delta =
          handle === "e" ? ev.clientX - startX : startX - ev.clientX;
        updateAttributes({
          width: Math.max(200, Math.round(startWidth + delta)),
        });
      };
      const onUp = () => {
        setIsResizing(false);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [width, updateAttributes],
  );

  const alignClass =
    {
      left: "flex justify-start",
      center: "flex justify-center",
      right: "flex justify-end",
    }[align] ?? "flex justify-center";

  return (
    <NodeViewWrapper as="div" className="relative my-2 w-full">
      <div className={alignClass}>
        <div
          ref={wrapRef}
          className={cn(
            "relative select-none",
            selected &&
              "outline outline-2 outline-offset-1 outline-blue-500 rounded",
            isResizing && "pointer-events-none",
          )}
          style={{
            width: typeof width === "number" ? `${width}px` : width,
            maxWidth: "100%",
          }}
        >
          <div
            className="relative w-full rounded-lg overflow-hidden bg-black"
            style={{ aspectRatio: "16 / 9" }}
          >
            <iframe
              src={node.attrs.src}
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              frameBorder={0}
            />
          </div>

          {selected && (
            <div className="absolute -top-9 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-primary dark:bg-zinc-900 border rounded-lg shadow-lg px-1 py-0.5 z-50 whitespace-nowrap">
              <AlignPicker
                align={align}
                onChange={(a) => updateAttributes({ align: a })}
                options={["left", "center", "right"]}
              />
            </div>
          )}

          {selected && (
            <>
              <div
                onMouseDown={(e) => startResize(e, "e")}
                className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-6 bg-primary border border-indigo-500 rounded cursor-ew-resize shadow z-50"
              />
              <div
                onMouseDown={(e) => startResize(e, "w")}
                className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-6 bg-primary border border-indigo-500 rounded cursor-ew-resize shadow z-50"
              />
            </>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

const EmbedBlock = Node.create({
  name: "embedBlock",
  group: "block",
  inline: false,
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: null },
      width: { default: 560 },
      align: { default: "center" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-embed-block] iframe" }];
  },

  renderHTML({ HTMLAttributes }) {
    const { width, align, src } = HTMLAttributes;
    const w = typeof width === "number" ? width + "px" : (width ?? "560px");
    const wrapStyle = [
      "display:table",
      `width:${w}`,
      "max-width:100%",
      align === "center" ? "margin:0 auto" : "",
      align === "right" ? "margin-left:auto;margin-right:0" : "",
      align === "left" ? "margin-right:auto;margin-left:0" : "",
    ]
      .filter(Boolean)
      .join(";");
    return [
      "div",
      {
        style: wrapStyle,
        "data-embed-block": "1",
        "data-align": align ?? "center",
      },
      [
        "div",
        {
          style:
            "position:relative;width:100%;aspect-ratio:16/9;border-radius:8px;overflow:hidden;background:#000;",
        },
        [
          "iframe",
          {
            src,
            style: "position:absolute;inset:0;width:100%;height:100%;border:0;",
            allowfullscreen: "true",
          },
        ],
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmbedBlockView);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// CodeEmbedBlock — a self-contained HTML/CSS/JS sandbox rendered in an
// isolated iframe. This is what makes the editor "support HTML/CSS/JS":
// content authors can drop in a fully custom, scripted block.
// ─────────────────────────────────────────────────────────────────────────────

function CodeEmbedView({ node, updateAttributes, selected }: NodeViewProps) {
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<"html" | "css" | "js">("html");
  const [html, setHtml] = useState<string>(node.attrs.html ?? "");
  const [css, setCss] = useState<string>(node.attrs.css ?? "");
  const [js, setJs] = useState<string>(node.attrs.js ?? "");
  const height: number = node.attrs.height || 240;

  useEffect(() => {
    setHtml(node.attrs.html ?? "");
    setCss(node.attrs.css ?? "");
    setJs(node.attrs.js ?? "");
  }, [node.attrs.html, node.attrs.css, node.attrs.js]);

  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"/><style>body{margin:0;padding:12px;font-family:system-ui,sans-serif;}${node.attrs.css ?? ""}</style></head><body>${node.attrs.html ?? ""}<script>${node.attrs.js ?? ""}<\/script></body></html>`;

  const applyChanges = () => {
    updateAttributes({ html, css, js });
    setEditing(false);
  };

  const startResizeHeight = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startY = e.clientY;
      const startHeight = height;
      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientY - startY;
        updateAttributes({
          height: Math.max(100, Math.round(startHeight + delta)),
        });
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [height, updateAttributes],
  );

  return (
    <NodeViewWrapper as="div" className="relative my-2 w-full">
      <div
        className={cn(
          "relative rounded-lg border bg-primary dark:bg-zinc-950 overflow-hidden",
          selected && "outline outline-2 outline-offset-1 outline-blue-500",
        )}
      >
        <div className="flex items-center justify-between bg-muted/60 border-b px-2 py-1">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <FileCode2 className="h-3.5 w-3.5" /> HTML / CSS / JS embed
          </span>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              setEditing((v) => !v);
            }}
            className="text-xs px-2 py-0.5 rounded bg-indigo-600 text-white hover:bg-indigo-500"
          >
            {editing ? "Close" : "Edit code"}
          </button>
        </div>

        {editing && (
          <div className="border-b bg-muted/30">
            <div className="flex items-center gap-1 px-2 pt-2">
              {(["html", "css", "js"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setTab(t);
                  }}
                  className={cn(
                    "text-xs px-2 py-1 rounded-t font-mono uppercase",
                    tab === t
                      ? "bg-primary dark:bg-zinc-900 border border-b-0"
                      : "text-muted-foreground",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            <textarea
              value={tab === "html" ? html : tab === "css" ? css : js}
              onChange={(e) => {
                if (tab === "html") setHtml(e.target.value);
                else if (tab === "css") setCss(e.target.value);
                else setJs(e.target.value);
              }}
              spellCheck={false}
              className="w-full font-mono text-xs p-3 bg-primary dark:bg-zinc-900 focus:outline-none resize-y"
              style={{ minHeight: 140 }}
              placeholder={
                tab === "html"
                  ? "<div>Hello world</div>"
                  : tab === "css"
                    ? "div { color: hotpink; }"
                    : "console.log('hi')"
              }
            />
            <div className="flex justify-end gap-2 p-2">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setEditing(false);
                }}
                className="text-xs px-3 py-1 rounded hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyChanges();
                }}
                className="text-xs px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-500"
              >
                Apply
              </button>
            </div>
          </div>
        )}

        <div className="relative" style={{ height }}>
          <iframe
            title="code-embed"
            srcDoc={srcDoc}
            sandbox="allow-scripts"
            className="w-full h-full border-0 bg-primary"
          />
          <div
            onMouseDown={startResizeHeight}
            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-2 my-0.5 rounded-full bg-gray-300 hover:bg-indigo-500 cursor-ns-resize"
            title="Drag to resize height"
          />
        </div>
      </div>
    </NodeViewWrapper>
  );
}

const CodeEmbedBlock = Node.create({
  name: "codeEmbed",
  group: "block",
  inline: false,
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      html: {
        default:
          '<div style="padding:16px;text-align:center;">Edit this block</div>',
        parseHTML: (el) => el.getAttribute("data-html") ?? "",
        renderHTML: (attrs) => ({ "data-html": attrs.html }),
      },
      css: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-css") ?? "",
        renderHTML: (attrs) => ({ "data-css": attrs.css }),
      },
      js: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-js") ?? "",
        renderHTML: (attrs) => ({ "data-js": attrs.js }),
      },
      height: {
        default: 240,
        parseHTML: (el) => Number(el.getAttribute("data-height") ?? 240),
        renderHTML: (attrs) => ({ "data-height": String(attrs.height) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-code-embed]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const html = HTMLAttributes["data-html"] ?? "";
    const css = HTMLAttributes["data-css"] ?? "";
    const js = HTMLAttributes["data-js"] ?? "";
    const height = HTMLAttributes["data-height"] ?? "240";
    const srcDoc = `<!doctype html><html><head><meta charset="utf-8"/><style>body{margin:0;padding:12px;font-family:system-ui,sans-serif;}${css}</style></head><body>${html}<script>${js}<\/script></body></html>`;

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-code-embed": "1",
        style: `display:block;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;height:${height}px;`,
      }),
      [
        "iframe",
        {
          srcdoc: srcDoc,
          sandbox: "allow-scripts",
          style: "width:100%;height:100%;border:0;",
        },
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeEmbedView);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// MediaRow (node name kept as "imageRow" for backward compatibility with
// already-saved content) — rows×cols grid, each cell holding an image OR a video,
// with drag-to-resize dividers between columns and rows.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// MediaGridPicker — hover over a rows×cols matrix to preview, click to confirm.
// ─────────────────────────────────────────────────────────────────────────────

function MediaGridPicker({
  onSelect,
}: {
  onSelect: (rows: number, cols: number) => void;
}) {
  const MAX = 4;
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const activeR = hover?.r ?? 0;
  const activeC = hover?.c ?? 0;

  return (
    <div>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${MAX}, 1fr)` }}
        onMouseLeave={() => setHover(null)}
      >
        {Array.from({ length: MAX }).map((_, rowIdx) =>
          Array.from({ length: MAX }).map((_, colIdx) => {
            const isActive = rowIdx < activeR && colIdx < activeC;
            return (
              <button
                key={`${rowIdx}-${colIdx}`}
                type="button"
                onMouseEnter={() => setHover({ r: rowIdx + 1, c: colIdx + 1 })}
                onClick={() => onSelect(rowIdx + 1, colIdx + 1)}
                className={cn(
                  "w-7 h-7 rounded border-2 transition-colors",
                  isActive
                    ? "bg-indigo-500 border-indigo-600"
                    : "bg-muted border-muted-foreground/20 hover:border-indigo-400",
                )}
                title={`${rowIdx + 1} row${rowIdx > 0 ? "s" : ""} × ${colIdx + 1} col${colIdx > 0 ? "s" : ""}`}
                aria-label={`${rowIdx + 1}×${colIdx + 1} grid`}
              />
            );
          }),
        )}
      </div>
      <p className="mt-1.5 text-center text-[11px] text-muted-foreground select-none">
        {hover
          ? `${hover.r} row${hover.r > 1 ? "s" : ""} × ${hover.c} col${hover.c > 1 ? "s" : ""}`
          : "hover to select"}
      </p>
    </div>
  );
}

type RowItem = { type: "image" | "video"; src: string; alt?: string };

/** Build equal-width percentages for `n` items, e.g. 3 → [33.33, 33.33, 33.34] */
function equalWidths(n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor((100 / n) * 100) / 100;
  const arr = Array(n).fill(base);
  arr[n - 1] = Math.round((100 - base * (n - 1)) * 100) / 100;
  return arr;
}

/** Same as equalWidths but for row heights (also percentages summing to 100). */
function equalHeights(n: number): number[] {
  return equalWidths(n);
}

function MediaRowView({ node, updateAttributes, selected }: NodeViewProps) {
  // ── derive layout dimensions ─────────────────────────────────────────────
  const cols: number = node.attrs.cols || 1;
  const rows: number = node.attrs.rows || 1;
  const totalCells = rows * cols;
  const items: RowItem[] = (node.attrs.items ?? []).slice(0, totalCells);

  // colWidths: % per column summing to 100
  const rawWidths: number[] | null = node.attrs.widths ?? null;
  const colWidths: number[] =
    Array.isArray(rawWidths) && rawWidths.length === cols
      ? rawWidths
      : equalWidths(cols);

  // rowHeights: % per row summing to 100 — used as flex-grow weights
  const rawHeights: number[] | null = node.attrs.rowHeights ?? null;
  const rowHeights: number[] =
    Array.isArray(rawHeights) && rawHeights.length === rows
      ? rawHeights
      : equalHeights(rows);

  const containerRef = useRef<HTMLDivElement>(null);

  // ── column-width resize ──────────────────────────────────────────────────
  const startColResize = useCallback(
    (e: React.MouseEvent, colIdx: number) => {
      e.preventDefault();
      e.stopPropagation();
      const containerWidth = containerRef.current?.offsetWidth ?? 0;
      if (containerWidth === 0) return;
      const startX = e.clientX;
      const snap = [...colWidths];
      const onMove = (ev: MouseEvent) => {
        const delta = ((ev.clientX - startX) / containerWidth) * 100;
        const next = [...snap];
        const minPct = 8;
        next[colIdx] = Math.max(
          minPct,
          Math.min(
            snap[colIdx] + delta,
            snap[colIdx] + snap[colIdx + 1] - minPct,
          ),
        );
        next[colIdx + 1] = snap[colIdx] + snap[colIdx + 1] - next[colIdx];
        updateAttributes({
          widths: next.map((w) => Math.round(w * 100) / 100),
        });
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [colWidths, updateAttributes],
  );

  // ── row-height resize ────────────────────────────────────────────────────
  const startRowResize = useCallback(
    (e: React.MouseEvent, rowIdx: number) => {
      e.preventDefault();
      e.stopPropagation();
      const containerHeight = containerRef.current?.offsetHeight ?? 0;
      if (containerHeight === 0) return;
      const startY = e.clientY;
      const snap = [...rowHeights];
      const onMove = (ev: MouseEvent) => {
        const delta = ((ev.clientY - startY) / containerHeight) * 100;
        const next = [...snap];
        const minPct = 8;
        next[rowIdx] = Math.max(
          minPct,
          Math.min(
            snap[rowIdx] + delta,
            snap[rowIdx] + snap[rowIdx + 1] - minPct,
          ),
        );
        next[rowIdx + 1] = snap[rowIdx] + snap[rowIdx + 1] - next[rowIdx];
        updateAttributes({
          rowHeights: next.map((h) => Math.round(h * 100) / 100),
        });
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [rowHeights, updateAttributes],
  );

  // ── delete a cell ────────────────────────────────────────────────────────
  const removeItem = useCallback(
    (cellIdx: number) => {
      const next = items.filter((_, i) => i !== cellIdx);
      const newCols = cols;
      const newRows = Math.max(1, Math.ceil(next.length / newCols));
      updateAttributes({
        items: next,
        rows: newRows,
        rowHeights: equalHeights(newRows),
      });
    },
    [items, cols, updateAttributes],
  );

  return (
    <NodeViewWrapper as="div" className="relative my-2 w-full">
      <div
        ref={containerRef}
        className={cn(
          "relative w-full",
          selected &&
            "outline outline-2 outline-offset-1 outline-blue-500 rounded",
        )}
      >
        {/* ── rows ────────────────────────────────────────────────── */}
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div
            key={rowIdx}
            className="relative flex flex-row w-full"
            style={{ flex: `${rowHeights[rowIdx] ?? 100 / rows} 0 0%` }}
          >
            {/* ── cells in this row ───────────────────────────── */}
            {Array.from({ length: cols }).map((_, colIdx) => {
              const cellIdx = rowIdx * cols + colIdx;
              const item: RowItem | undefined = items[cellIdx];
              return (
                <div
                  key={colIdx}
                  className="relative group/cell flex-none"
                  style={{
                    width: `${colWidths[colIdx] ?? 100 / cols}%`,
                    padding: "2px",
                  }}
                >
                  {item ? (
                    item.type === "video" ? (
                      <video
                        src={item.src}
                        controls
                        className="w-full h-full rounded-lg object-cover block bg-black"
                        style={{ minHeight: 60 }}
                        draggable={false}
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.src}
                        alt={item.alt ?? ""}
                        className="w-full h-full rounded-lg object-cover block"
                        style={{ minHeight: 60 }}
                        draggable={false}
                      />
                    )
                  ) : (
                    <div
                      className="w-full rounded-lg bg-muted/40 border-2 border-dashed border-muted-foreground/20 flex items-center justify-center text-muted-foreground/40 text-xs"
                      style={{ minHeight: 80 }}
                    >
                      empty
                    </div>
                  )}

                  {/* delete cell */}
                  {selected && item && (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        removeItem(cellIdx);
                      }}
                      className="absolute top-2 right-2 z-50 w-5 h-5 flex items-center justify-center rounded-full bg-red-500 text-white opacity-0 group-hover/cell:opacity-100 transition-opacity shadow"
                      title="Remove cell"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}

                  {/* vertical column-resize divider (right edge of each col except last) */}
                  {selected && colIdx < cols - 1 && (
                    <div
                      onMouseDown={(e) => startColResize(e, colIdx)}
                      className="absolute top-0 bottom-0 z-40 flex items-center justify-center cursor-col-resize"
                      style={{ right: -5, width: 10 }}
                      title="Drag to resize column"
                    >
                      <div className="w-1 h-8 rounded-full bg-indigo-500 opacity-60 hover:opacity-100 transition-opacity" />
                    </div>
                  )}
                </div>
              );
            })}

            {/* horizontal row-resize divider (bottom edge of each row except last) */}
            {selected && rowIdx < rows - 1 && (
              <div
                onMouseDown={(e) => startRowResize(e, rowIdx)}
                className="absolute left-0 right-0 z-40 flex items-center justify-center cursor-row-resize"
                style={{ bottom: -5, height: 10 }}
                title="Drag to resize row"
              >
                <div className="h-1 w-16 rounded-full bg-indigo-500 opacity-60 hover:opacity-100 transition-opacity" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* size labels */}
      {selected && (cols > 1 || rows > 1) && (
        <div className="flex items-center gap-2 mt-1 px-1 text-[10px] text-muted-foreground">
          <span>
            {rows}×{cols} grid
          </span>
          {cols > 1 && (
            <span>{colWidths.map((w) => `${Math.round(w)}%`).join(" | ")}</span>
          )}
          {rows > 1 && (
            <span className="opacity-60">
              rows: {rowHeights.map((h) => `${Math.round(h)}%`).join(" | ")}
            </span>
          )}
        </div>
      )}
    </NodeViewWrapper>
  );
}

const MediaRow = Node.create({
  name: "imageRow",
  group: "block",
  inline: false,
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      items: {
        default: [] as RowItem[],
        parseHTML: (el) => {
          const raw =
            el.getAttribute("data-items") ?? el.getAttribute("data-images");
          try {
            const parsed = JSON.parse(raw ?? "[]");
            return parsed.map((it: any) => ({
              type: it.type ?? "image",
              src: it.src,
              alt: it.alt ?? "",
            }));
          } catch {
            return [];
          }
        },
        renderHTML: (attrs) => ({
          "data-items": JSON.stringify(attrs.items ?? []),
        }),
      },
      cols: {
        default: 2,
        parseHTML: (el) =>
          Number(
            el.getAttribute("data-cols") ??
              el.getAttribute("data-image-row") ??
              2,
          ),
        renderHTML: (attrs) => ({
          "data-cols": String(attrs.cols),
          "data-image-row": String(attrs.cols),
        }),
      },
      rows: {
        default: 1,
        parseHTML: (el) => Number(el.getAttribute("data-rows") ?? 1),
        renderHTML: (attrs) => ({ "data-rows": String(attrs.rows) }),
      },
      widths: {
        default: null as number[] | null,
        parseHTML: (el) => {
          try {
            const r = el.getAttribute("data-widths");
            return r ? JSON.parse(r) : null;
          } catch {
            return null;
          }
        },
        renderHTML: (attrs) =>
          attrs.widths ? { "data-widths": JSON.stringify(attrs.widths) } : {},
      },
      rowHeights: {
        default: null as number[] | null,
        parseHTML: (el) => {
          try {
            const r = el.getAttribute("data-row-heights");
            return r ? JSON.parse(r) : null;
          } catch {
            return null;
          }
        },
        renderHTML: (attrs) =>
          attrs.rowHeights
            ? { "data-row-heights": JSON.stringify(attrs.rowHeights) }
            : {},
      },
      rowid: {
        default: null,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
      align: {
        default: "center",
        parseHTML: (el) => el.getAttribute("data-align") ?? "center",
        renderHTML: (attrs) => ({ "data-align": attrs.align ?? "center" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-image-row]" }];
  },

renderHTML({ node, HTMLAttributes }) {
  const items: RowItem[] = node.attrs.items ?? [];
  const cols: number = node.attrs.cols || 1;
  const rows: number = node.attrs.rows || 1;
  const colWidths: number[] =
    Array.isArray(node.attrs.widths) && node.attrs.widths.length === cols
      ? node.attrs.widths
      : equalWidths(cols);

  const rowNodes = Array.from({ length: rows }).map((_, rowIdx) => {
    const cells = Array.from({ length: cols }).map((_, colIdx) => {
      const cellIdx = rowIdx * cols + colIdx;
      const it: RowItem | undefined = items[cellIdx];
      const w = colWidths[colIdx] ?? 100 / cols;
      const wrapStyle = [
        `display:inline-block`,
        `width:${w}%`,
        `vertical-align:top`,
        `padding:2px`,
        `box-sizing:border-box`,
        `margin:0`,
      ].join(";");
      const mediaStyle = [
        `width:100%`,
        `height:auto`,
        `display:block`,
        `border-radius:8px`,
        `object-fit:cover`,
        `margin:0`,
      ].join(";");
      if (!it) {
        return ["div", { style: wrapStyle }] as [string, Record<string, string>];
      }
      return [
        "div",
        { style: wrapStyle },
        it.type === "video"
          ? [
              "video",
              {
                src: it.src,
                controls: "true",
                playsinline: "true",
                style: mediaStyle + ";background:#000;",
              },
            ]
          : ["img", { src: it.src, alt: it.alt ?? "", style: mediaStyle }],
      ] as [string, Record<string, string>, [string, Record<string, string>]];
    });
    return [
      "div",
      {
        style: [
          "display:block",
          "width:100%",
          "font-size:0",
          "margin:0 0 4px 0",
          "padding:0",
          "line-height:0",
        ].join(";"),
      },
      ...cells,
    ] as any;
  });

  return [
    "div",
    {
      "data-image-row": String(cols),
      "data-cols": String(cols),
      "data-rows": String(rows),
      "data-items": JSON.stringify(items),
      "data-align": node.attrs.align ?? "center",
      ...(node.attrs.widths ? { "data-widths": JSON.stringify(node.attrs.widths) } : {}),
      ...(node.attrs.rowHeights
        ? { "data-row-heights": JSON.stringify(node.attrs.rowHeights) }
        : {}),
      style: "display:block;width:100%;margin:0;padding:0;",
    },
    ...rowNodes,
  ] as any;
},

  addNodeView() {
    return ReactNodeViewRenderer(MediaRowView);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// RichTextEditor
// ─────────────────────────────────────────────────────────────────────────────

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  onImageUpload?: (file: File) => Promise<string>;
  onVideoUpload?: (file: File) => Promise<string>;
  placeholder?: string;
  editable?: boolean;
  className?: string;
  minHeight?: string;
}

export default function RichTextEditor({
  content,
  onChange,
  onImageUpload,
  onVideoUpload,
  placeholder = "Start typing...",
  editable = true,
  className,
  minHeight = "400px",
}: RichTextEditorProps) {
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [showVideoUrlInput, setShowVideoUrlInput] = useState(false);
  const [videoUrlValue, setVideoUrlValue] = useState("");
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<"wysiwyg" | "source">("wysiwyg");
  const [sourceHtml, setSourceHtml] = useState(content);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [counts, setCounts] = useState({ words: 0, chars: 0 });
  const [showMediaGridPicker, setShowMediaGridPicker] = useState(false);
  const [gridUploading, setGridUploading] = useState(false);
  const prevModeRef = useRef<"wysiwyg" | "source">("wysiwyg");
  // Tracks whether the last content change originated from the editor itself
  // (via onUpdate). Used to prevent the content-sync useEffect from calling
  // setContent() on a change the editor just emitted — which would re-parse
  // the HTML and wipe transient node attrs like `rowid` mid-upload.
  const isInternalUpdate = useRef(false);

  // Always-current reference to the editor instance — used inside async
  // file-input callbacks that are created once but fire after re-renders,
  // where a stale `editor` closure would cause replaceNodeByMatcher to miss.
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  useEffect(() => {
    editorRef.current = editor;
  });

  // Populated after the editor exists, so drag/paste handlers declared inside
  // editorProps (which run before `editor` is defined) can still reach them.
  const uploadRef = useRef<{
    image?: (file: File) => void;
    video?: (file: File) => void;
  }>({});

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: { HTMLAttributes: { class: "list-disc pl-4" } },
        orderedList: { HTMLAttributes: { class: "list-decimal pl-4" } },
        blockquote: {
          HTMLAttributes: {
            class: "border-l-4 border-gray-300 pl-4 italic my-4",
          },
        },
      }),
      Underline,
      ResizableImage,
      MediaRow,
      VideoBlock,
      EmbedBlock,
      CodeEmbedBlock,
      DragHandleExtension,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-blue-600 hover:underline",
          rel: "noopener noreferrer",
          target: "_blank",
        },
        validate: (href) => /^https?:\/\//.test(href),
      }),
      CodeBlockLowlight.configure({
        lowlight,
        HTMLAttributes: {
          class:
            "bg-gray-900 text-gray-100 rounded-lg p-4 my-4 font-mono text-sm",
        },
      }),
      Placeholder.configure({ placeholder }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
    ],
    content,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-lg dark:prose-invert max-w-none focus:outline-none p-4",
          !editable && "cursor-not-allowed opacity-70",
        ),
        style: `min-height: ${minHeight}`,
      },
      handleDrop(_view, event) {
        const files = Array.from(event.dataTransfer?.files ?? []);
        const media = files.filter(
          (f) => f.type.startsWith("image/") || f.type.startsWith("video/"),
        );
        if (!media.length) return false;
        event.preventDefault();
        media.forEach((file) => {
          if (file.type.startsWith("video/")) uploadRef.current.video?.(file);
          else uploadRef.current.image?.(file);
        });
        return true;
      },
      handlePaste(_view, event) {
        const files = Array.from(event.clipboardData?.files ?? []);
        const media = files.filter(
          (f) => f.type.startsWith("image/") || f.type.startsWith("video/"),
        );
        if (!media.length) return false;
        event.preventDefault();
        media.forEach((file) => {
          if (file.type.startsWith("video/")) uploadRef.current.video?.(file);
          else uploadRef.current.image?.(file);
        });
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
      isInternalUpdate.current = true;
    },
    editable,
    immediatelyRender: false,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!editor) return;
    if (prevModeRef.current === "wysiwyg" && mode === "source") {
      setSourceHtml(editor.getHTML());
    } else if (prevModeRef.current === "source" && mode === "wysiwyg") {
      editor.commands.setContent(sourceHtml, { emitUpdate: false });
      onChange(sourceHtml);
    }
    prevModeRef.current = mode;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    // If the content change came from the editor itself (onUpdate fired),
    // skip the setContent round-trip — the editor is already up to date.
    // This prevents re-parsing HTML mid-upload which wipes transient attrs
    // like `rowid` and breaks the placeholder→real-URL replacement.
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      setSourceHtml(content);
      return;
    }
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false } as any);
    }
    setSourceHtml(content);
  }, [content, editor]);

  useEffect(() => {
    return () => {
      if (editor) editor.destroy();
    };
  }, [editor]);

  // Word / character count, live-updated.
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const text = editor.getText();
      const trimmed = text.trim();
      setCounts({
        words: trimmed.length ? trimmed.split(/\s+/).length : 0,
        chars: text.length,
      });
    };
    update();
    editor.on("update", update);
    editor.on("selectionUpdate", update);
    return () => {
      editor.off("update", update);
      editor.off("selectionUpdate", update);
    };
  }, [editor]);

  const openLinkInput = useCallback(() => {
    if (!editor) return;
    const currentHref = editor.getAttributes("link").href as string | undefined;
    setLinkUrl(currentHref ?? "");
    setShowVideoUrlInput(false);
    setShowLinkInput((v) => !v);
  }, [editor]);

  const addLink = useCallback(() => {
    if (!editor || !linkUrl) return;
    if (editor.isActive("link")) {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: linkUrl })
        .run();
    } else {
      editor.chain().focus().setLink({ href: linkUrl }).run();
    }
    setLinkUrl("");
    setShowLinkInput(false);
  }, [editor, linkUrl]);

  const removeLink = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().unsetLink().run();
    setShowLinkInput(false);
  }, [editor]);

  // ── Insert image as a true block ─────────────────────────────────────────
  const uploadAndInsert = useCallback(
    async (file: File, align: string = "center") => {
      if (!editorRef.current || !onImageUpload) return;

      const placeholderId = `placeholder-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      insertBlockNode(editorRef.current, "image", {
        src: placeholderSvg("Uploading…"),
        alt: placeholderId,
        align,
      });

      try {
        const url = await onImageUpload(file);
        const ed = editorRef.current;
        if (!ed) return;
        const replaced = replaceNodeByMatcher(
          ed,
          "image",
          (a) => a.alt === placeholderId,
          { src: url, alt: "" },
        );
        if (!replaced)
          insertBlockNode(ed, "image", { src: url, alt: "", align });
      } catch (err) {
        console.error("Image upload failed:", err);
        if (editorRef.current)
          removeNodeByMatcher(editorRef.current, "image", (a) => a.alt === placeholderId);
      }
    },
    [onImageUpload],
  );

  // ── Insert video as a true block ─────────────────────────────────────────
  const uploadAndInsertVideoFile = useCallback(
    async (file: File) => {
      if (!editorRef.current || !onVideoUpload) return;

      const placeholderId = `video-ph-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      insertBlockNode(editorRef.current, "videoBlock", {
        src: placeholderSvg("Uploading video…"),
        phId: placeholderId,
        align: "center",
      });

      try {
        const url = await onVideoUpload(file);
        const ed = editorRef.current;
        if (!ed) return;
        const replaced = replaceNodeByMatcher(
          ed,
          "videoBlock",
          (a) => a.phId === placeholderId,
          { src: url, phId: null },
        );
        if (!replaced)
          insertBlockNode(ed, "videoBlock", { src: url, align: "center" });
      } catch (err) {
        console.error("Video upload failed:", err);
        if (editorRef.current)
          removeNodeByMatcher(editorRef.current, "videoBlock", (a) => a.phId === placeholderId);
      }
    },
    [onVideoUpload],
  );

  // Keep the paste/drop handlers (declared before `editor` exists) pointed at
  // the latest versions of these callbacks.
  useEffect(() => {
    uploadRef.current.image = (file: File) => {
      void uploadAndInsert(file, "center");
    };
    uploadRef.current.video = (file: File) => {
      void uploadAndInsertVideoFile(file);
    };
  }, [uploadAndInsert, uploadAndInsertVideoFile]);

  // Close media-grid picker when clicking outside the editor toolbar.
  useEffect(() => {
    if (!showMediaGridPicker) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as Element)?.closest("[data-media-grid-picker]")) {
        setShowMediaGridPicker(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showMediaGridPicker]);

  const addImage = useCallback(async () => {
    if (!editor || !onImageUpload) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) await uploadAndInsert(file, "center");
      input.value = "";
    };
    input.click();
  }, [editor, onImageUpload, uploadAndInsert]);

  const addVideo = useCallback(async () => {
    if (!editor || !onVideoUpload) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/*";
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) await uploadAndInsertVideoFile(file);
      input.value = "";
    };
    input.click();
  }, [editor, onVideoUpload, uploadAndInsertVideoFile]);

  // ── Insert a rows×cols media grid ────────────────────────────────────────
  // Upload-first approach: collect all files, upload them all, THEN insert
  // a single node with the real URLs. No placeholder/replace round-trip,
  // so no stale-editor or rowid-wiping issues.
  const addMediaGrid = useCallback(
    ({ rows, cols }: { rows: number; cols: number }) => {
      if (!onImageUpload && !onVideoUpload) return;
      setShowMediaGridPicker(false);

      const totalCells = rows * cols;

      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*,video/*";
      input.multiple = totalCells > 1;

      input.onchange = async (e: Event) => {
        const files = Array.from(
          (e.target as HTMLInputElement).files ?? [],
        ).slice(0, totalCells);
        input.value = "";
        if (!files.length) return;

        setGridUploading(true);
        try {
          const uploaded = await Promise.all(
            files.map(async (file): Promise<RowItem | null> => {
              const isVideo = file.type.startsWith("video/");
              const uploader = isVideo ? onVideoUpload : onImageUpload;
              if (!uploader) return null;
              const url = await uploader(file);
              return { type: isVideo ? "video" : "image", src: url, alt: "" };
            }),
          );

          const items = uploaded.filter((it): it is RowItem => it !== null);
          if (!items.length) return;

          // Use the actual number of uploaded files for cols if fewer were picked
          const actualCols = Math.min(cols, items.length);
          const actualRows = Math.ceil(items.length / actualCols);

          const ed = editorRef.current;
          if (!ed) return;

          insertBlockNode(ed, "imageRow", {
            cols: actualCols,
            rows: actualRows,
            items,
            widths: equalWidths(actualCols),
            rowHeights: equalHeights(actualRows),
            rowid: null,
          });
        } catch (err) {
          console.error("Grid upload failed:", err);
        } finally {
          setGridUploading(false);
        }
      };

      input.click();
    },
    [onImageUpload, onVideoUpload],
  );

  // ── Insert a video / embed from a pasted URL (YouTube, Vimeo, direct file) ─
  const insertVideoFromUrl = useCallback(() => {
    if (!editor || !videoUrlValue) return;
    const embed = toEmbedUrl(videoUrlValue);
    if (embed) {
      insertBlockNode(editor, "embedBlock", { src: embed, align: "center" });
    } else {
      insertBlockNode(editor, "videoBlock", {
        src: videoUrlValue,
        align: "center",
      });
    }
    setVideoUrlValue("");
    setShowVideoUrlInput(false);
  }, [editor, videoUrlValue]);

  const openVideoUrlInput = useCallback(() => {
    setShowLinkInput(false);
    setShowVideoUrlInput((v) => !v);
  }, []);

  const addCodeEmbed = useCallback(() => {
    if (!editor) return;
    insertBlockNode(editor, "codeEmbed", {});
  }, [editor]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") addLink();
      else if (e.key === "Escape") setShowLinkInput(false);
    },
    [addLink],
  );

  const handleVideoUrlKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") insertVideoFromUrl();
      else if (e.key === "Escape") setShowVideoUrlInput(false);
    },
    [insertVideoFromUrl],
  );

  if (!mounted) {
    return (
      <div
        className={cn("border rounded-lg overflow-hidden", className)}
        style={{ minHeight }}
      >
        <div className="bg-muted/50 border-b p-2 h-[52px]" />
        <div className="bg-gray-50 animate-pulse" style={{ minHeight }} />
      </div>
    );
  }

  if (!editor) {
    return (
      <div
        className="border rounded-lg p-4 text-center text-gray-500"
        style={{ minHeight }}
      >
        Failed to initialize editor
      </div>
    );
  }

  return (
    <div
      className={cn(
        "border rounded-lg overflow-hidden bg-background flex flex-col",
        isFullscreen && "fixed inset-0 z-[100] rounded-none",
        className,
      )}
    >
      {/* Toolbar */}
      {editable && (
        <div className="bg-muted/50 border-b p-2 flex flex-wrap items-center gap-1">
          {/* Mode toggle */}
          <div className="flex items-center gap-1 pr-2">
            <Button
              variant={mode === "wysiwyg" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setMode("wysiwyg")}
              type="button"
              title="Visual editor"
            >
              Visual
            </Button>
            <Button
              variant={mode === "source" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setMode("source")}
              type="button"
              title="Raw HTML / script source"
              className="gap-1"
            >
              <Code2 className="h-4 w-4" /> HTML
            </Button>
            {mode === "source" && (
              <Badge
                variant="outline"
                className="text-[10px] uppercase tracking-wider ml-1"
              >
                &lt;script&gt; supported
              </Badge>
            )}
          </div>

          {mode === "wysiwyg" && (
            <>
              <Separator orientation="vertical" className="h-6" />

              {/* Headings */}
              <div className="flex items-center gap-1 pr-2">
                {([1, 2, 3] as const).map((level) => {
                  const Icon =
                    level === 1 ? Heading1 : level === 2 ? Heading2 : Heading3;
                  return (
                    <Button
                      key={level}
                      variant={
                        editor.isActive("heading", { level })
                          ? "secondary"
                          : "ghost"
                      }
                      size="sm"
                      onClick={() =>
                        editor.chain().focus().toggleHeading({ level }).run()
                      }
                      type="button"
                      title={`Heading ${level}`}
                    >
                      <Icon className="h-4 w-4" />
                    </Button>
                  );
                })}
              </div>

              <Separator orientation="vertical" className="h-6" />

              {/* Formatting */}
              <div className="flex items-center gap-1 pr-2">
                <Button
                  variant={editor.isActive("bold") ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  type="button"
                  title="Bold"
                >
                  <Bold className="h-4 w-4" />
                </Button>
                <Button
                  variant={editor.isActive("italic") ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  type="button"
                  title="Italic"
                >
                  <Italic className="h-4 w-4" />
                </Button>
                <Button
                  variant={editor.isActive("underline") ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => editor.chain().focus().toggleUnderline().run()}
                  type="button"
                  title="Underline"
                >
                  <UnderlineIcon className="h-4 w-4" />
                </Button>
                <Button
                  variant={editor.isActive("strike") ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => editor.chain().focus().toggleStrike().run()}
                  type="button"
                  title="Strikethrough"
                >
                  <Strikethrough className="h-4 w-4" />
                </Button>
                <Button
                  variant={editor.isActive("code") ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => editor.chain().focus().toggleCode().run()}
                  type="button"
                  title="Inline Code"
                >
                  <Code className="h-4 w-4" />
                </Button>
              </div>

              <Separator orientation="vertical" className="h-6" />

              {/* Text color & Highlight */}
              <div className="flex items-center gap-1 pr-2">
                <div className="relative group" title="Text color">
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    className="relative px-2"
                    onClick={() => {
                      const input = document.getElementById(
                        "rte-text-color",
                      ) as HTMLInputElement;
                      input?.click();
                    }}
                  >
                    <Baseline className="h-4 w-4" />
                    <span
                      className="absolute bottom-[4px] left-1/2 -translate-x-1/2 h-[3px] w-4 rounded-sm pointer-events-none"
                      style={{
                        background:
                          editor.getAttributes("textStyle").color ?? "#000000",
                      }}
                    />
                  </Button>
                  <input
                    id="rte-text-color"
                    type="color"
                    className="sr-only"
                    defaultValue="#000000"
                    onChange={(e) =>
                      editor.chain().focus().setColor(e.target.value).run()
                    }
                  />
                </div>

                {editor.isActive("textStyle", { color: /^#/ }) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    title="Remove text color"
                    className="px-1"
                    onClick={() => editor.chain().focus().unsetColor().run()}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}

                <div className="relative" title="Highlight color">
                  <Button
                    variant={
                      editor.isActive("highlight") ? "secondary" : "ghost"
                    }
                    size="sm"
                    type="button"
                    className="relative px-2"
                    onClick={() => {
                      const input = document.getElementById(
                        "rte-highlight-color",
                      ) as HTMLInputElement;
                      input?.click();
                    }}
                  >
                    <Highlighter className="h-4 w-4" />
                    <span
                      className="absolute bottom-[4px] left-1/2 -translate-x-1/2 h-[3px] w-4 rounded-sm pointer-events-none"
                      style={{
                        background:
                          editor.getAttributes("highlight").color ?? "#fef08a",
                      }}
                    />
                  </Button>
                  <input
                    id="rte-highlight-color"
                    type="color"
                    className="sr-only"
                    defaultValue="#fef08a"
                    onChange={(e) =>
                      editor
                        .chain()
                        .focus()
                        .setHighlight({ color: e.target.value })
                        .run()
                    }
                  />
                </div>

                {editor.isActive("highlight") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    title="Remove highlight"
                    className="px-1"
                    onClick={() =>
                      editor.chain().focus().unsetHighlight().run()
                    }
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>

              <Separator orientation="vertical" className="h-6" />

              {/* Lists */}
              <div className="flex items-center gap-1 pr-2">
                <Button
                  variant={
                    editor.isActive("bulletList") ? "secondary" : "ghost"
                  }
                  size="sm"
                  onClick={() =>
                    editor.chain().focus().toggleBulletList().run()
                  }
                  type="button"
                  title="Bullet List"
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={
                    editor.isActive("orderedList") ? "secondary" : "ghost"
                  }
                  size="sm"
                  onClick={() =>
                    editor.chain().focus().toggleOrderedList().run()
                  }
                  type="button"
                  title="Numbered List"
                >
                  <ListOrdered className="h-4 w-4" />
                </Button>
                <Button
                  variant={
                    editor.isActive("blockquote") ? "secondary" : "ghost"
                  }
                  size="sm"
                  onClick={() =>
                    editor.chain().focus().toggleBlockquote().run()
                  }
                  type="button"
                  title="Blockquote"
                >
                  <Quote className="h-4 w-4" />
                </Button>
                <Button
                  variant={editor.isActive("codeBlock") ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                  type="button"
                  title="Code Block"
                >
                  <Code className="h-4 w-4 mr-1" /> Block
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    editor.chain().focus().setHorizontalRule().run()
                  }
                  type="button"
                  title="Horizontal Rule"
                >
                  <Minus className="h-4 w-4" />
                </Button>
              </div>

              <Separator orientation="vertical" className="h-6" />

              {/* Alignment */}
              <div className="flex items-center gap-1 pr-2">
                <Button
                  variant={
                    editor.isActive({ textAlign: "left" })
                      ? "secondary"
                      : "ghost"
                  }
                  size="sm"
                  onClick={() =>
                    editor.chain().focus().setTextAlign("left").run()
                  }
                  type="button"
                  title="Align Left"
                >
                  <AlignLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant={
                    editor.isActive({ textAlign: "center" })
                      ? "secondary"
                      : "ghost"
                  }
                  size="sm"
                  onClick={() =>
                    editor.chain().focus().setTextAlign("center").run()
                  }
                  type="button"
                  title="Align Center"
                >
                  <AlignCenter className="h-4 w-4" />
                </Button>
                <Button
                  variant={
                    editor.isActive({ textAlign: "right" })
                      ? "secondary"
                      : "ghost"
                  }
                  size="sm"
                  onClick={() =>
                    editor.chain().focus().setTextAlign("right").run()
                  }
                  type="button"
                  title="Align Right"
                >
                  <AlignRight className="h-4 w-4" />
                </Button>
              </div>

              <Separator orientation="vertical" className="h-6" />

              {/* Media */}
              <div className="flex items-center gap-1 pr-2">
                <Button
                  variant={editor.isActive("link") ? "secondary" : "ghost"}
                  size="sm"
                  onClick={openLinkInput}
                  type="button"
                  title="Insert Link"
                >
                  <LinkIcon className="h-4 w-4" />
                </Button>
                {editor.isActive("link") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={removeLink}
                    type="button"
                    title="Remove Link"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
                {onImageUpload && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={addImage}
                    type="button"
                    title="Insert Image"
                  >
                    <ImageIcon className="h-4 w-4" />
                  </Button>
                )}
                {onVideoUpload && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={addVideo}
                    type="button"
                    title="Upload Video"
                  >
                    <Video className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={openVideoUrlInput}
                  type="button"
                  title="Embed video from URL (YouTube, Vimeo, direct link)"
                >
                  <Globe className="h-4 w-4" />
                </Button>
                {(onImageUpload || onVideoUpload) && (
                  <div className="relative" data-media-grid-picker="">
                    <Button
                      variant={showMediaGridPicker ? "secondary" : "ghost"}
                      size="sm"
                      type="button"
                      title="Insert media grid (rows × columns)"
                      className="gap-1 text-xs"
                      disabled={gridUploading}
                      onClick={() => setShowMediaGridPicker((v) => !v)}
                    >
                      {gridUploading ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      ) : (
                        <Columns2 className="h-4 w-4" />
                      )}
                      {gridUploading ? "Uploading…" : "Grid"}
                    </Button>
                    {showMediaGridPicker && !gridUploading && (
                      <div className="absolute top-full left-0 mt-1 z-50 bg-primary dark:bg-zinc-900 border rounded-lg shadow-lg p-3 min-w-[200px]">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide pb-2">
                          Rows × Columns
                        </p>
                        {/* 2-D grid selector: hover to preview, click to insert */}
                        <MediaGridPicker
                          onSelect={(r, c) =>
                            addMediaGrid({ rows: r, cols: c })
                          }
                        />
                      </div>
                    )}
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={addCodeEmbed}
                  type="button"
                  title="Insert HTML / CSS / JS embed"
                >
                  <FileCode2 className="h-4 w-4" />
                </Button>
              </div>

              <Separator orientation="vertical" className="h-6" />

              {/* History */}
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().undo().run()}
                  disabled={!editor.can().undo()}
                  type="button"
                  title="Undo"
                >
                  <Undo className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().redo().run()}
                  disabled={!editor.can().redo()}
                  type="button"
                  title="Redo"
                >
                  <Redo className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}

          {/* Fullscreen toggle — always available, pushed to the end */}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            type="button"
            onClick={() => setIsFullscreen((v) => !v)}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      )}

      {/* Link input */}
      {mode === "wysiwyg" && showLinkInput && (
        <div className="bg-muted/30 p-3 border-b flex items-center gap-2">
          <Input
            type="url"
            placeholder="https://example.com"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-9"
            autoFocus
          />
          <Button size="sm" onClick={addLink} type="button">
            Apply
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowLinkInput(false)}
            type="button"
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Video URL / embed input */}
      {mode === "wysiwyg" && showVideoUrlInput && (
        <div className="bg-muted/30 p-3 border-b flex items-center gap-2">
          <Input
            type="url"
            placeholder="YouTube, Vimeo, or a direct .mp4 link"
            value={videoUrlValue}
            onChange={(e) => setVideoUrlValue(e.target.value)}
            onKeyDown={handleVideoUrlKeyDown}
            className="h-9"
            autoFocus
          />
          <Button size="sm" onClick={insertVideoFromUrl} type="button">
            Embed
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowVideoUrlInput(false)}
            type="button"
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Source textarea */}
      {mode === "source" && (
        <Textarea
          value={sourceHtml}
          onChange={(e) => {
            setSourceHtml(e.target.value);
            onChange(e.target.value);
          }}
          className="font-mono text-sm resize-y border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 w-full"
          style={{ minHeight }}
          placeholder={
            "<div>\n  Paste raw HTML. <script> tags run on the product page.\n</div>"
          }
          spellCheck={false}
        />
      )}

      {/* Editor — extra left padding so drag handle has room */}
      {mode === "wysiwyg" && (
        <div
          className={cn(
            "relative pl-8",
            isFullscreen && "flex-1 overflow-auto",
          )}
        >
          <EditorContent editor={editor} />
        </div>
      )}

      {/* Status bar */}
      {mode === "wysiwyg" && (
        <div className="flex items-center justify-between px-4 py-1.5 border-t bg-muted/30 text-[11px] text-muted-foreground">
          <span>
            {counts.words} words · {counts.chars} characters
          </span>
          {editable && (
            <span className="hidden sm:inline">
              Drag, paste, or drop images and videos directly into the editor
            </span>
          )}
        </div>
      )}
    </div>
  );
}
