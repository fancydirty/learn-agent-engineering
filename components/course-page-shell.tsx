// Course page shell — single source for two-column layout padding
export function CoursePageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="course-page-shell mx-auto flex w-full min-w-0 max-w-[85rem] gap-6 px-4 py-8 sm:px-6 sm:py-12 xl:gap-10">
      {children}
    </div>
  );
}
