"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  CheckCircle2,
  Check,
  Circle,
  Clock,
  Home,
  Lightbulb,
  Lock,
  Menu,
  Route,
  Sparkles,
  X,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MentorDrawer } from "@/components/shell/mentor-drawer";
import { useDemoRole } from "@/lib/demo-role";
import {
  PARTS_UPDATE_EVENT,
  readPartsProgress,
  type PartsUpdateDetail,
} from "@/lib/learn/parts-progress";

export interface Module {
  id: string;
  title: string;
  status: "completed" | "active" | "upcoming";
  number: number;
}

export interface LessonPart {
  /** DOM id (matches `<section id>` so anchor jumps work). */
  id: string;
  /** Visible label, e.g. "1. The core distinction". */
  label: string;
  /** Concept tag — used to determine pass state from sessionStorage. */
  concept: string;
}

export interface LessonPartsContext {
  /** Lesson identifier — must match the moduleId used as the
      sessionStorage key by the LessonReader. */
  lessonId: string;
  parts: LessonPart[];
}

export interface ShellContext {
  courseId?: string;
  courseTitle: string;
  currentModuleId?: string;
  currentModuleTitle?: string;
  modules: Module[];
  deadline?: string;
  /** When provided AND we're on the lesson page, the active module
      expands with a per-Part sub-list driven by sessionStorage state
      written by the LessonReader. */
  lessonParts?: LessonPartsContext;
}

interface LmsShellProps {
  context: ShellContext;
  children: React.ReactNode;
  hideDrawer?: boolean;
}

export function LmsShell({ context, children, hideDrawer = false }: LmsShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(false);
        setDrawerOpen(true);
      }
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Journey deep-link: `/learn/<module>?focus=<concept_tag>` forces the
  // mentor drawer open and dispatches `nx:focus` so the drawer can frame
  // a fresh scenario around that concept. We strip the param from the URL
  // after consumption so a refresh does not re-fire, and we guard the
  // MentorDrawer mount race by waiting one animation frame (the drawer
  // needs to subscribe to the event before we dispatch).
  useEffect(() => {
    const focus = searchParams?.get("focus");
    if (!focus || hideDrawer) return;
    setDrawerOpen(true);
    const raf = requestAnimationFrame(() => {
      window.dispatchEvent(
        new CustomEvent("nx:focus", { detail: { concept: focus } }),
      );
      // Remove the query param without pushing a new history entry.
      const url = new URL(window.location.href);
      url.searchParams.delete("focus");
      window.history.replaceState(
        {},
        "",
        url.pathname + (url.search || "") + url.hash,
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [searchParams, hideDrawer]);

  // nx:explain — fired by paragraph "Explain this" button. Force the
  // drawer open BEFORE the drawer's own listener handles the framing.
  // Same shell-level treatment as nx:focus: shell controls drawer
  // visibility, the drawer controls the message itself.
  useEffect(() => {
    if (hideDrawer) return;
    const listener = () => {
      setDrawerOpen(true);
    };
    window.addEventListener("nx:explain", listener);
    return () => window.removeEventListener("nx:explain", listener);
  }, [hideDrawer]);

  return (
    <div className="flex h-screen flex-col bg-white">
      <TopBar
        context={context}
        onMenuClick={() => setSidebarOpen((s) => !s)}
        onMentorClick={() => setDrawerOpen((s) => !s)}
        drawerOpen={drawerOpen}
      />

      <div className="flex flex-1 overflow-hidden">
        <ModuleSidebar
          context={context}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <div className="mx-auto w-full max-w-4xl flex-1 px-6 py-8 sm:px-10 sm:py-12">
            {children}
          </div>
        </main>

        {!hideDrawer && (
          <AnimatePresence initial={false}>
            {drawerOpen && (
              <motion.aside
                key="mentor-drawer"
                initial={{ x: 420, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 420, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 32 }}
                className="hidden w-[420px] shrink-0 border-l border-[#e5e7eb] bg-white lg:flex lg:flex-col"
              >
                <MentorDrawer
                  currentModuleId={context.currentModuleId}
                  currentModuleTitle={context.currentModuleTitle}
                  deadline={context.deadline}
                  courseId={context.courseId}
                  onClose={() => setDrawerOpen(false)}
                />
              </motion.aside>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

function TopBar({
  context,
  onMenuClick,
  onMentorClick,
  drawerOpen,
}: {
  context: ShellContext;
  onMenuClick: () => void;
  onMentorClick: () => void;
  drawerOpen: boolean;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#e5e7eb] bg-white px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="rounded-md p-2 text-[#6b7280] hover:bg-[#f3f4f6] lg:hidden"
          aria-label="Open module menu"
        >
          <Menu className="h-4 w-4" />
        </button>

        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#0f0f0f]">
            <span className="text-xs font-bold text-[#ffb300]">N</span>
          </div>
          <span className="hidden text-sm font-semibold text-[#0f0f0f] sm:inline">
            Nexford
          </span>
        </Link>

        <span className="text-[#e5e7eb]">/</span>

        <span className="truncate text-sm text-[#6b7280]">
          {context.courseTitle}
        </span>

        {context.currentModuleTitle && (
          <>
            <span className="hidden text-[#e5e7eb] sm:inline">/</span>
            <span className="hidden truncate text-sm font-medium text-[#0f0f0f] sm:inline">
              {context.currentModuleTitle}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        {context.deadline && (
          <Badge variant="outline" className="gap-1.5">
            <Clock className="h-3 w-3" />
            {context.deadline}
          </Badge>
        )}
        <button
          onClick={onMentorClick}
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition",
            drawerOpen
              ? "bg-[#0f0f0f] text-white"
              : "border border-[#e5e7eb] text-[#0f0f0f] hover:bg-[#f9fafb]",
          )}
          aria-label="Toggle mentor"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Mentor
        </button>
      </div>
    </header>
  );
}

function ModuleSidebar({
  context,
  open,
  onClose,
}: {
  context: ShellContext;
  open: boolean;
  onClose: () => void;
}) {
  const [role] = useDemoRole();
  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <button
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          aria-label="Close sidebar"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-14 left-0 z-40 w-64 shrink-0 border-r border-[#e5e7eb] bg-white transition-transform duration-200",
          "lg:static lg:inset-auto lg:z-auto lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-[#e5e7eb] px-4 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#6b7280]">
              Course
            </span>
            <button
              onClick={onClose}
              className="rounded p-1 text-[#6b7280] hover:bg-[#f3f4f6] lg:hidden"
              aria-label="Close sidebar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto p-3">
            <div className="mb-3 px-2">
              <p className="text-sm font-semibold text-[#0f0f0f]">
                {context.courseTitle}
              </p>
            </div>

            <div className="space-y-0.5">
              {context.modules.map((m) => {
                const isActive = context.currentModuleId === m.id;
                const showParts =
                  isActive &&
                  context.lessonParts?.lessonId === m.id &&
                  context.lessonParts.parts.length > 0;
                return (
                  <div key={m.id}>
                    <ModuleItem module={m} isActive={isActive} />
                    {showParts && context.lessonParts && (
                      <PartsList
                        lessonId={context.lessonParts.lessonId}
                        parts={context.lessonParts.parts}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="my-4 h-px bg-[#e5e7eb]" />

            <div className="space-y-0.5">
              <SidebarLink href="/" icon={Home} label="Portal" />
              <SidebarLink href="/plan" icon={Route} label="My Week" />
              <SidebarLink href="/journey" icon={Lightbulb} label="My Journey" />
            </div>

            {role === "teacher" && (
              <>
                <div className="my-4 h-px bg-[#e5e7eb]" />

                <div className="px-2 pb-2">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#6b7280]">
                    Faculty
                  </p>
                </div>
                <div className="space-y-0.5">
                  <SidebarLink
                    href="/teacher"
                    icon={BookOpen}
                    label="Class Intelligence"
                  />
                  <SidebarLink
                    href="/teacher/watchlist"
                    icon={BookOpen}
                    label="Student Watchlist"
                  />
                </div>
              </>
            )}
          </nav>
        </div>
      </aside>
    </>
  );
}

function ModuleItem({
  module,
  isActive,
}: {
  module: Module;
  isActive: boolean;
}) {
  const icon = {
    completed: <CheckCircle2 className="h-4 w-4 text-[#0f0f0f]" />,
    active: <Circle className="h-4 w-4 fill-[#ffb300] text-[#ffb300]" />,
    upcoming: <Circle className="h-4 w-4 text-[#e5e7eb]" />,
  }[module.status];

  return (
    <Link
      href={`/learn/${module.id}`}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
        isActive
          ? "bg-[#fefce8] text-[#0f0f0f]"
          : module.status === "completed"
            ? "text-[#6b7280] hover:bg-[#f9fafb]"
            : "text-[#0f0f0f] hover:bg-[#f9fafb]",
      )}
    >
      {icon}
      <span className="truncate">
        <span className="mr-1.5 text-[10px] font-mono text-[#6b7280]">
          {String(module.number).padStart(2, "0")}
        </span>
        {module.title}
      </span>
    </Link>
  );
}

function PartsList({
  lessonId,
  parts,
}: {
  lessonId: string;
  parts: LessonPart[];
}) {
  // Subscribe to the LessonReader's sessionStorage broadcasts so each
  // part row's locked/active/passed state stays live. Initial state is
  // hydrated in effect (not initial state) to keep SSR markup stable.
  const [unlockedParts, setUnlockedParts] = useState<number>(1);
  const [passedSet, setPassedSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    const initial = readPartsProgress(lessonId);
    setUnlockedParts(initial.unlockedParts);
    setPassedSet(new Set(initial.partsPassed));

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<PartsUpdateDetail>).detail;
      if (!detail || detail.lessonId !== lessonId) return;
      setUnlockedParts(detail.unlockedParts);
      setPassedSet(new Set(detail.partsPassed));
    };
    window.addEventListener(PARTS_UPDATE_EVENT, handler);
    return () => window.removeEventListener(PARTS_UPDATE_EVENT, handler);
  }, [lessonId]);

  return (
    <ul className="ml-6 mt-1 space-y-0.5 border-l border-[#e5e7eb] pl-2">
      {parts.map((part, idx) => {
        const partNumber = idx + 1;
        const passed = passedSet.has(part.concept);
        const unlocked = partNumber <= unlockedParts;
        const state: PartState = passed
          ? "passed"
          : unlocked
            ? "active"
            : "locked";
        return (
          <li key={part.id}>
            <PartItem part={part} partNumber={partNumber} state={state} />
          </li>
        );
      })}
    </ul>
  );
}

type PartState = "locked" | "active" | "passed";

function PartItem({
  part,
  partNumber,
  state,
}: {
  part: LessonPart;
  partNumber: number;
  state: PartState;
}) {
  const dot =
    state === "passed" ? (
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-green-500">
        <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
      </span>
    ) : state === "active" ? (
      <span
        className="h-2 w-2 shrink-0 rounded-full bg-[#ffb300]"
        aria-hidden="true"
      />
    ) : (
      <Lock className="h-3 w-3 shrink-0 text-[#d1d5db]" />
    );

  const label = (
    <>
      {dot}
      <span className="truncate">{part.label}</span>
    </>
  );

  if (state === "locked") {
    return (
      <button
        type="button"
        disabled
        title={`Pass Part ${partNumber - 1} to unlock`}
        className="flex w-full cursor-not-allowed items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] text-[#9ca3af]"
      >
        {label}
      </button>
    );
  }

  return (
    <Link
      href={`#${part.id}`}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1 text-[12px] transition-colors",
        state === "passed"
          ? "text-[#6b7280] hover:bg-[#f9fafb]"
          : "text-[#0f0f0f] hover:bg-[#f9fafb]",
      )}
    >
      {label}
    </Link>
  );
}

function SidebarLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Home;
  label: string;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
        active
          ? "bg-[#f3f4f6] text-[#0f0f0f] font-medium"
          : "text-[#6b7280] hover:bg-[#f9fafb] hover:text-[#0f0f0f]",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
