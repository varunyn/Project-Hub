import { NextResponse } from "next/server";
import { getAllTasks } from "../../utils/taskUtils";

export function GET() {
  return NextResponse.json(getAllTasks());
}
