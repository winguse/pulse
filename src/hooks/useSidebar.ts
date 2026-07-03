import { useState, useEffect, useRef } from "react";

export function useSidebar(initialWidth = 320) {
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("pulse_sidebar_width");
    return saved ? parseInt(saved, 10) : initialWidth;
  });
  const isResizingRef = useRef(false);

  useEffect(() => {
    localStorage.setItem("pulse_sidebar_width", sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
    const handleMouseMove = (e: PointerEvent) => {
      if (!isResizingRef.current) return;
      setSidebarWidth(Math.max(260, Math.min(500, e.clientX)));
    };
    const handleMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    window.addEventListener("pointermove", handleMouseMove);
    window.addEventListener("pointerup", handleMouseUp);
    return () => {
      window.removeEventListener("pointermove", handleMouseMove);
      window.removeEventListener("pointerup", handleMouseUp);
    };
  }, []);

  const handleResizeMouseDown = (e: React.PointerEvent) => {
    isResizingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  };

  return {
    sidebarVisible,
    setSidebarVisible,
    sidebarWidth,
    handleResizeMouseDown,
  };
}
