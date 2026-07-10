import { useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "wouter";

interface Props {
  children: ReactNode;
}

export default function PageTransition({ children }: Props) {
  const [pathname] = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const prevPath = useRef(pathname);
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    if (prevPath.current === pathname) return;
    prevPath.current = pathname;

    const el = ref.current;
    if (!el) return;
    el.style.animation = "none";
    el.offsetHeight; // reflow
    el.style.animation = "";
  }, [pathname]);

  return (
    <div
      ref={ref}
      className="page-transition"
      style={{ willChange: "transform, opacity" }}
    >
      {children}
    </div>
  );
}
