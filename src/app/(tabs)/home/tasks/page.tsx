import { getDemoTeam, getTaskKinds, getTasks } from "@/data/api";
import { TasksScreen } from "@/features/tasks/tasks-screen";

/** 21 할 일 · 체크리스트. */
export default async function TasksPage() {
  const team = await getDemoTeam();
  const [tasks, kinds] = await Promise.all([getTasks(team.id), getTaskKinds()]);
  return <TasksScreen tasks={tasks} kinds={kinds} />;
}
