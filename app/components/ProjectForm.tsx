"use client";

import { useState } from "react";
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

  const techInputValue = techInput.trim();
  const canAddTech = techInputValue.length > 0;
  const formName = (formData.name ?? "").trim();
  const formPath = (formData.path ?? "").trim();
  const canSubmit = formName.length > 0 && formPath.length > 0;

  const fieldClassName =
    "w-full min-h-10 rounded-lg border border-[oklch(88%_0.035_255)] bg-[oklch(99%_0.006_245)] px-3 py-2 text-sm text-[oklch(24%_0.045_260)] placeholder:text-[oklch(62%_0.055_255)] transition-colors focus:border-[oklch(67%_0.14_230)] focus:outline-none focus:ring-2 focus:ring-[oklch(74%_0.12_230_/_0.28)]";
  const labelClassName = "mb-1.5 block text-sm font-bold text-[oklch(34%_0.07_260)]";
  const sectionTitleClassName =
    "text-xs font-extrabold uppercase tracking-wide text-[oklch(45%_0.13_205)]";
  const secondaryButtonClassName =
    "inline-flex min-h-10 items-center justify-center rounded-lg border border-[oklch(88%_0.035_255)] bg-[oklch(99%_0.006_245)] px-4 py-2 text-sm font-bold text-[oklch(34%_0.07_255)] shadow-sm transition-colors hover:bg-[oklch(97%_0.025_245)] focus:outline-none focus:ring-2 focus:ring-[oklch(78%_0.1_230)] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";
  const primaryButtonClassName =
    "inline-flex min-h-10 items-center justify-center rounded-lg bg-[oklch(28%_0.08_265)] px-4 py-2 text-sm font-bold text-[oklch(98%_0.006_250)] shadow-sm transition-colors hover:bg-[oklch(34%_0.1_265)] focus:outline-none focus:ring-2 focus:ring-[oklch(72%_0.14_250)] focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[oklch(91%_0.025_255)] disabled:text-[oklch(62%_0.05_255)] disabled:shadow-none";

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleTechInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTechInput(e.target.value);
  };

  const handleAddTech = () => {
    const value = techInputValue;
    if (value) {
      setFormData((prev) => {
        const stack = prev.techStack ?? [];
        if (stack.some((tech) => tech.toLowerCase() === value.toLowerCase())) return prev;
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

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-[oklch(85%_0.04_250)] bg-[linear-gradient(135deg,oklch(98%_0.028_230),oklch(99%_0.006_245)_48%,oklch(98%_0.03_80))] p-4 shadow-[0_1px_2px_oklch(25%_0.04_260_/_0.08)] ring-1 ring-[oklch(97%_0.035_250)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-[oklch(45%_0.13_205)]">
            {project ? "Edit quest" : "New quest"}
          </p>
          <h2 className="mt-1 text-xl font-extrabold tracking-tight text-[oklch(24%_0.08_265)]">
            {project ? "Quest setup" : "Add quest"}
          </h2>
        </div>
        <p className="max-w-sm text-sm font-semibold text-[oklch(39%_0.06_260)]">
          Keep the core metadata accurate. Tags, notes, and goals can stay lightweight below.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-5">
        <section className="space-y-3">
          <h3 className={sectionTitleClassName}>Core details</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="name" className={labelClassName}>
                Quest name*
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
              Quest path*
            </label>
            <input
              type="text"
              id="path"
              name="path"
              value={formData.path}
              onChange={handleChange}
              required
              placeholder="~/projects/my-app"
              className={fieldClassName}
            />
          </div>
        </section>

        <section className="space-y-3 border-t border-[oklch(89%_0.035_255)] pt-4">
          <h3 className={sectionTitleClassName}>Links</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="githubUrl" className={labelClassName}>
                GitHub repo
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
                Live URL
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

        <section className="space-y-3 border-t border-[oklch(89%_0.035_255)] pt-4">
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTech();
                  }
                }}
                placeholder="Add technology"
                className={`flex-grow ${fieldClassName}`}
              />
              <button
                type="button"
                onClick={handleAddTech}
                disabled={!canAddTech}
                className={primaryButtonClassName}
              >
                Add
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-start gap-2">
            {formData.techStack?.map((tech, index) => (
              <div
                key={tech}
                className="inline-flex items-center gap-1 rounded-lg bg-[oklch(95%_0.07_310)] px-3 py-1 text-sm font-bold text-[oklch(38%_0.12_310)] ring-1 ring-[oklch(83%_0.09_310)]"
              >
                <span>{tech}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveTech(index)}
                  className="rounded-full p-0.5 text-[oklch(44%_0.1_310)] transition-colors hover:bg-[oklch(95%_0.06_25)] hover:text-[oklch(50%_0.16_25)] focus:outline-none focus:ring-2 focus:ring-[oklch(78%_0.13_25)]"
                  aria-label={`Remove ${tech}`}
                >
                  ×
                </button>
              </div>
            ))}
            {(!formData.techStack || formData.techStack.length === 0) && (
              <span className="text-sm font-medium text-[oklch(50%_0.07_260)]">
                No technologies added yet.
              </span>
            )}
          </div>
        </section>

        <section className="space-y-3 border-t border-[oklch(89%_0.035_255)] pt-4">
          <h3 className={sectionTitleClassName}>Description</h3>
          <div>
            <label htmlFor="readmePreview" className={labelClassName}>
              Quest summary
              <span className="ml-1 text-xs text-slate-500">
                (Optional, loads from README.md when the quest path is valid)
              </span>
            </label>
            <textarea
              id="readmePreview"
              name="readmePreview"
              value={formData.readmePreview}
              onChange={handleChange}
              rows={5}
              placeholder="A short summary for this quest."
              className={`min-h-24 ${fieldClassName}`}
            />
          </div>
        </section>

        <div className="flex flex-wrap justify-end gap-3 border-t border-[oklch(89%_0.035_255)] pt-4 max-sm:flex-col-reverse max-sm:items-stretch">
          <button type="button" onClick={onCancel} className={secondaryButtonClassName}>
            Cancel
          </button>
          <button type="submit" disabled={!canSubmit} className={primaryButtonClassName}>
            {project ? "Save quest" : "Add quest"}
          </button>
        </div>
      </form>
    </div>
  );
}
