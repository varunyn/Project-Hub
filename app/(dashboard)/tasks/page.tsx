"use client";

import GlobalTaskBoard from "../../components/GlobalTaskBoard";
import { useProjects } from "../../hooks/useProjects";

export default function TasksPage() {
  const { projects } = useProjects();
  return <GlobalTaskBoard projects={projects} />;
}
