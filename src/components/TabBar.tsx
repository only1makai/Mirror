"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Home", glyph: "◎" },
  { href: "/capture", label: "Capture", glyph: "◉" },
  { href: "/compare", label: "Compare", glyph: "▤" },
  { href: "/log", label: "Log", glyph: "✎" },
  { href: "/stack", label: "Stack", glyph: "≡" },
];

export default function TabBar() {
  const path = usePathname();
  return (
    <nav className="tabbar">
      {TABS.map((t) => {
        const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className={active ? "active" : ""}>
            <span className="glyph">{t.glyph}</span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
