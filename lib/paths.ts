import { join } from "node:path";

// Course content lives at the repository root. It is deliberately NOT nested
// under an authoring-skill directory: this repository open-sources the courses
// and the reader, not the course-authoring methodology.
export function coursesDir(): string {
  return join(process.cwd(), "courses");
}
