"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDemoRole, type DemoRole } from "@/lib/demo-role";
import { NavCanvasPill } from "@/components/nav-canvas-pill";

const studentLinks = [
  { href: "/", label: "Portal" },
  { href: "/learn/module-3", label: "Learn" },
  { href: "/plan", label: "My Week" },
  { href: "/journey", label: "My Journey" },
] as const;

const teacherLinks = [
  { href: "/teacher", label: "Class Intelligence" },
  { href: "/teacher/watchlist", label: "Student Watchlist" },
  { href: "/teacher/upload", label: "Upload Material" },
] as const;

export function Nav() {
  const pathname = usePathname();
  const [role, setRole] = useDemoRole();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  const links = role === "teacher" ? teacherLinks : studentLinks;

  return (
    <header className="border-b border-[#e5e7eb] bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0f0f0f]">
            <span className="text-sm font-bold text-[#ffb300]">N</span>
          </div>
          <span className="text-sm font-semibold tracking-tight text-[#0f0f0f]">
            Nexford
          </span>
        </Link>

        <nav className="hidden items-center gap-1 sm:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive(link.href)
                  ? "bg-[#f3f4f6] text-[#0f0f0f]"
                  : "text-[#6b7280] hover:text-[#0f0f0f]"
              }`}
            >
              {link.label}
            </Link>
          ))}

          <div className="mx-2 h-4 w-px bg-[#e5e7eb]" />

          <NavCanvasPill />

          <div className="mx-2 h-4 w-px bg-[#e5e7eb]" />

          <RoleToggle role={role} onChange={setRole} />

          {role === "student" && (
            <Link
              href="/learn/module-3"
              className="ml-3 whitespace-nowrap rounded-full bg-[#ffb300] px-4 py-2 text-sm font-semibold text-[#0f0f0f] transition hover:bg-[#e6a200]"
            >
              Start Learning
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

function RoleToggle({
  role,
  onChange,
}: {
  role: DemoRole;
  onChange: (next: DemoRole) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Demo role"
      className="flex items-center gap-1 rounded-full border border-[#e5e7eb] bg-[#f9fafb] p-0.5"
    >
      <RoleButton
        active={role === "student"}
        onClick={() => onChange("student")}
        label="Student"
      />
      <RoleButton
        active={role === "teacher"}
        onClick={() => onChange("teacher")}
        label="Teacher"
      />
    </div>
  );
}

function RoleButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold transition ${
        active
          ? "bg-[#0f0f0f] text-[#ffb300]"
          : "text-[#6b7280] hover:text-[#0f0f0f]"
      }`}
    >
      {label}
    </button>
  );
}
