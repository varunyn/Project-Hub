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
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4">{project ? "Edit Project" : "Add New Project"}</h2>

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Project Name*
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="path" className="block text-sm font-medium text-gray-700 mb-1">
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
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="githubUrl" className="block text-sm font-medium text-gray-700 mb-1">
            GitHub Repository
            <span className="ml-1 text-xs text-gray-500">(Optional)</span>
          </label>
          <input
            type="url"
            id="githubUrl"
            name="githubUrl"
            value={formData.githubUrl || ""}
            onChange={handleChange}
            placeholder="https://github.com/username/repository"
            pattern="https://github.com/.*"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-4">
          <label
            htmlFor="tech-stack-input"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Tech Stack
          </label>
          <div className="flex">
            <input
              id="tech-stack-input"
              type="text"
              value={techInput}
              onChange={handleTechInputChange}
              placeholder="Add technology"
              className="flex-grow px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={handleAddTech}
              className="px-4 py-2 bg-blue-600 text-white rounded-r-md hover:bg-blue-700 focus:outline-none"
            >
              Add
            </button>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {formData.techStack?.map((tech, index) => (
              <div key={tech} className="bg-gray-100 px-3 py-1 rounded-full flex items-center">
                <span className="text-sm">{tech}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveTech(index)}
                  className="ml-2 text-gray-500 hover:text-red-600"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="readmePreview" className="block text-sm font-medium text-gray-700 mb-1">
            README Preview
            <span className="ml-1 text-xs text-gray-500">
              (Optional - will load from README.md if path is valid)
            </span>
          </label>
          <textarea
            id="readmePreview"
            name="readmePreview"
            value={formData.readmePreview}
            onChange={handleChange}
            rows={3}
            placeholder="A brief description of your project. If a valid path is provided, the README.md from that path will be used instead."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-1">
            URL (if deployed)
          </label>
          <input
            type="url"
            id="url"
            name="url"
            value={formData.url}
            onChange={handleChange}
            placeholder="https://example.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-6">
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
            Status*
          </label>
          <select
            id="status"
            name="status"
            value={formData.status}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="in progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none"
          >
            {project ? "Update Project" : "Add Project"}
          </button>
        </div>
      </form>
    </div>
  );
}
