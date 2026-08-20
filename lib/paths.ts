import { join } from "node:path";

export function coursesDir(): string {
  return join(process.cwd(), "agent-mentor", "skills", "generate-course-from-topic", "lessons");
}
