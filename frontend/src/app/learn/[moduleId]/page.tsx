import { notFound } from "next/navigation";
import { LmsShell, type Module } from "@/components/shell/lms-shell";
import { LessonReader } from "@/components/learn/lesson-reader";
import { mockCanvas } from "@/lib/lms/mock-canvas";
import { getLesson } from "@/lib/lessons/registry";
import { DEMO_COURSE_ID } from "@/lib/demo-identity";

interface PageProps {
  params: Promise<{ moduleId: string }>;
}

export default async function LearnPage({ params }: PageProps) {
  const { moduleId } = await params;
  const lesson = getLesson(moduleId);
  if (!lesson) notFound();

  const [course, modules] = await Promise.all([
    mockCanvas.getCurrentCourse(),
    mockCanvas.getModules(),
  ]);

  const shellModules: Module[] = modules.map((m) => ({
    id: m.id,
    number: m.number,
    title: m.title,
    status:
      m.status === "completed"
        ? "completed"
        : m.id === moduleId
          ? "active"
          : "upcoming",
  }));

  const currentModule = modules.find((m) => m.id === moduleId);

  const moduleNumber = currentModule?.number ?? 0;
  const modulePrefix = String(moduleNumber).padStart(2, "0");

  return (
    <LmsShell
      context={{
        courseId: DEMO_COURSE_ID,
        courseTitle: course.title,
        currentModuleId: moduleId,
        currentModuleTitle: lesson.title,
        modules: shellModules,
        deadline: currentModule?.deadline,
        lessonParts: {
          lessonId: lesson.moduleId,
          parts: lesson.sections.map((s, i) => ({
            id: s.id,
            label: `${modulePrefix}.${i + 1} ${s.heading}`,
            concept: s.concept,
          })),
        },
      }}
    >
      <LessonReader lesson={lesson} moduleNumber={moduleNumber} />
    </LmsShell>
  );
}
