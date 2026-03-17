"use client";

import { type FormEvent, useState } from "react";
import type { Project } from "../types";

interface ProjectFormProps {
  project?: Project;
  onSubmit: (project: Partial<Project>) => void;
  onCancel: () => void;
}

const defaultProject: Partial<Project> = {
  name: "",
  path: "",
  techStack: [],
  readmePreview: "",
  url: "",
  status: "in progress",
};

export default function ProjectForm({ project, onSubmit, onCancel }: ProjectFormProps) {
  const [formData, setFormData] = useState<Partial<Project>>(project ?? defaultProject);
  const [techInput, setTechInput] = useState("");

  const fieldClassName =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors";
  const labelClassName = "mb-1.5 block text-sm font-medium text-slate-700";
  const sectionTitleClassName = "text-xs font-semibold uppercase tracking-wide text-slate-500";
  const secondaryButtonClassName =
    "inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2 transition-colors";
  const primaryButtonClassName =
    "inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors";

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleTechInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTechInput(e.target.value);
  };

  const handleAddTech = () => {
    const value = techInput.trim();
    if (value) {
      setFormData((prev) => {
        const stack = prev.techStack ?? [];
        if (stack.includes(value)) return prev;
        return { ...prev, techStack: [...stack, value] };
      });
      setTechInput("");
    }
  };

  const handleRemoveTech = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      techStack: prev.techStack?.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
      <h2 className="text-xl font-semibold tracking-tight text-slate-900">
        {project ? "Edit Project" : "Add New Project"}
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Keep details concise so you can scan and resume work quickly.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <section className="space-y-3">
          <h3 className={sectionTitleClassName}>Core details</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="name" className={labelClassName}>
                Project Name*
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className={fieldClassName}
              />
            </div>

            <div>
              <label htmlFor="status" className={labelClassName}>
                Status*
              </label>
              <select
                id="status"
                name="status"
                value={formData.status}
                onChange={handleChange}
                required
                className={fieldClassName}
              >
                <option value="in progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="path" className={labelClassName}>
              Project Path*
            </label>
            <input
              type="text"
              id="path"
              name="path"
              value={formData.path}
              onChange={handleChange}
              required
              placeholder="/Users/username/path/to/project"
              className={fieldClassName}
            />
          </div>
        </section>

        <section className="space-y-3 border-t border-slate-100 pt-5">
          <h3 className={sectionTitleClassName}>Links</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="githubUrl" className={labelClassName}>
                GitHub Repository
                <span className="ml-1 text-xs text-slate-500">(Optional)</span>
              </label>
              <input
                type="url"
                id="githubUrl"
                name="githubUrl"
                value={formData.githubUrl || ""}
                onChange={handleChange}
                placeholder="https://github.com/username/repository"
                pattern="https://github.com/.*"
                className={fieldClassName}
              />
            </div>

            <div>
              <label htmlFor="url" className={labelClassName}>
                URL (if deployed)
              </label>
              <input
                type="url"
                id="url"
                name="url"
                value={formData.url}
                onChange={handleChange}
                placeholder="https://example.com"
                className={fieldClassName}
              />
            </div>
          </div>
        </section>

        <section className="space-y-3 border-t border-slate-100 pt-5">
          <h3 className={sectionTitleClassName}>Tech stack</h3>
          <div>
            <label htmlFor="tech-stack-input" className={labelClassName}>
              Add technologies
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <input
                id="tech-stack-input"
                type="text"
                value={techInput}
                onChange={handleTechInputChange}
                placeholder="Add technology"
                className={`flex-grow ${fieldClassName}`}
              />
              <button type="button" onClick={handleAddTech} className={primaryButtonClassName}>
                Add
              </button>
            </div>
          </div>

          <div className="flex min-h-8 flex-wrap gap-2">
            {formData.techStack?.map((tech, index) => (
              <div
                key={tech}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 ring-1 ring-slate-200/60"
              >
                <span>{tech}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveTech(index)}
                  className="rounded-full p-0.5 text-slate-400 transition-colors hover:bg-red-100 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-300"
                  aria-label={`Remove ${tech}`}
                >
                  ×
                </button>
              </div>
            ))}
            {(!formData.techStack || formData.techStack.length === 0) && (
              <span className="text-sm text-slate-500">No technologies added yet.</span>
            )}
          </div>
        </section>

        <section className="space-y-3 border-t border-slate-100 pt-5">
          <h3 className={sectionTitleClassName}>Description</h3>
          <div>
            <label htmlFor="readmePreview" className={labelClassName}>
              README Preview
              <span className="ml-1 text-xs text-slate-500">
                (Optional - loads from README.md when project path is valid)
              </span>
            </label>
            <textarea
              id="readmePreview"
              name="readmePreview"
              value={formData.readmePreview}
              onChange={handleChange}
              rows={4}
              placeholder="A brief description of your project."
              className={fieldClassName}
            />
          </div>
        </section>

        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5">
          <button type="button" onClick={onCancel} className={secondaryButtonClassName}>
            Cancel
          </button>
          <button type="submit" className={primaryButtonClassName}>
            {project ? "Update Project" : "Add Project"}
          </button>
        </div>
      </form>
    </div>
  );
}
