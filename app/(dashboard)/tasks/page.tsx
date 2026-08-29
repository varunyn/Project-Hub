"use client";

import TaskBoard from "../../components/TaskBoard";
import { useAllTasks } from "../../hooks/useAllTasks";
import { useProjects } from "../../hooks/useProjects";

export default function TasksPage() {
  const { projects } = useProjects();
  const { tasks, loading, error, updateTask, deleteTask, moveTask } = useAllTasks();

  return (
    <TaskBoard
      tasks={tasks}
      projects={projects}
      title={
        <>
          <span className="block">All tasks</span>
          <span className="mt-1 block text-sm font-normal text-slate-500">
            One board for every project, with each card linked to its project context.
          </span>
        </>
      }
      loading={loading}
      error={error}
      onUpdateTask={updateTask}
      onDeleteTask={deleteTask}
      onMoveTask={moveTask}
    />
  );
}
