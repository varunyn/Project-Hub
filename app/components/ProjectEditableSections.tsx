import type { KeyboardEvent, RefObject } from "react";
import type { Project } from "../types";

interface ProjectEditableSectionsProps {
  project: Project;
  cardClass: string;
  sectionTitleClass: string;
  inputClass: string;
  btnPrimary: string;
  btnSecondary: string;
  btnDanger: string;
  tagInput: string;
  tagDropdownOpen: boolean;
  tagDropdownRef: RefObject<HTMLDivElement | null>;
  tagSuggestions: { existing: string[]; canCreateNew: boolean; newTag: string };
  tagOptionCount: number;
  effectiveHighlightIndex: number;
  hasTagInput: boolean;
  noteInput: string;
  isEditingNote: boolean;
  hasNoteInput: boolean;
  goalInput: string;
  hasGoalInput: boolean;
  onTagInputChange: (value: string) => void;
  onTagFocus: () => void;
  onTagKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onAddTag: (tag?: string) => void;
  onRemoveTag: (tag: string) => void;
  onNoteInputChange: (value: string) => void;
  onAddNote: () => void;
  onStartNoteEdit: () => void;
  onCancelNoteEdit: () => void;
  onSaveNote: () => void;
  onDeleteNote: () => void;
  onGoalInputChange: (value: string) => void;
  onGoalKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onAddGoal: () => void;
  onRemoveGoal: (goal: string) => void;
}

export function ProjectEditableSections({
  project,
  cardClass,
  sectionTitleClass,
  inputClass,
  btnPrimary,
  btnSecondary,
  btnDanger,
  tagInput,
  tagDropdownOpen,
  tagDropdownRef,
  tagSuggestions,
  tagOptionCount,
  effectiveHighlightIndex,
  hasTagInput,
  noteInput,
  isEditingNote,
  hasNoteInput,
  goalInput,
  hasGoalInput,
  onTagInputChange,
  onTagFocus,
  onTagKeyDown,
  onAddTag,
  onRemoveTag,
  onNoteInputChange,
  onAddNote,
  onStartNoteEdit,
  onCancelNoteEdit,
  onSaveNote,
  onDeleteNote,
  onGoalInputChange,
  onGoalKeyDown,
  onAddGoal,
  onRemoveGoal,
}: ProjectEditableSectionsProps) {
  return (
    <>
      <section className={cardClass}>
        <h2 className={sectionTitleClass}>Tags</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          {project.tags?.map((tag) => (
            <span
              key={tag}
              className="inline-flex min-h-7 items-center gap-1 rounded-md bg-[oklch(96%_0.03_230)] px-2 py-0.5 text-sm font-medium text-[oklch(34%_0.08_245)]"
            >
              {tag}
              <button
                type="button"
                onClick={() => onRemoveTag(tag)}
                className="inline-flex size-5 items-center justify-center rounded-full"
                aria-label={`Remove ${tag}`}
              >
                ×
              </button>
            </span>
          ))}
          {!project.tags?.length && (
            <span className="text-sm font-medium text-slate-500">No tags yet.</span>
          )}
        </div>
        <div className="relative flex flex-col gap-2 sm:flex-row" ref={tagDropdownRef}>
          <div className="relative flex-1">
            <input
              value={tagInput}
              onChange={(event) => onTagInputChange(event.target.value)}
              onFocus={onTagFocus}
              onKeyDown={onTagKeyDown}
              className={inputClass}
              placeholder="Add tag"
              autoComplete="off"
              role="combobox"
              aria-expanded={tagDropdownOpen}
              aria-controls="project-tag-listbox"
            />
            {tagDropdownOpen && tagOptionCount > 0 && (
              <div
                id="project-tag-listbox"
                role="listbox"
                className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
              >
                {tagSuggestions.existing.map((tag, index) => (
                  <button
                    key={tag}
                    type="button"
                    role="option"
                    aria-selected={effectiveHighlightIndex === index}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onAddTag(tag);
                    }}
                  >
                    {tag}
                  </button>
                ))}
                {tagSuggestions.canCreateNew && (
                  <button
                    type="button"
                    role="option"
                    aria-selected={effectiveHighlightIndex === tagSuggestions.existing.length}
                    className="block w-full border-t border-slate-100 px-3 py-2 text-left text-sm"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onAddTag(tagSuggestions.newTag);
                    }}
                  >
                    Create tag: {tagSuggestions.newTag}
                  </button>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onAddTag()}
            disabled={!hasTagInput}
            className={btnPrimary}
          >
            Add
          </button>
        </div>
      </section>

      <section className={cardClass}>
        <h2 className={sectionTitleClass}>Notes</h2>
        {isEditingNote ? (
          <div className="space-y-3">
            <textarea
              value={noteInput}
              onChange={(event) => onNoteInputChange(event.target.value)}
              className={`min-h-20 ${inputClass}`}
              aria-label="Edit note"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onSaveNote}
                disabled={!hasNoteInput}
                className={btnPrimary}
              >
                Save note
              </button>
              <button type="button" onClick={onCancelNoteEdit} className={btnSecondary}>
                Cancel
              </button>
              <button type="button" onClick={onDeleteNote} className={btnDanger}>
                Delete note
              </button>
            </div>
          </div>
        ) : project.notes ? (
          <div className="space-y-3">
            <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{project.notes}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={onStartNoteEdit} className={btnPrimary}>
                Edit note
              </button>
              <button type="button" onClick={onDeleteNote} className={btnDanger}>
                Delete note
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-500">No notes yet.</p>
            <textarea
              value={noteInput}
              onChange={(event) => onNoteInputChange(event.target.value)}
              className={`min-h-20 ${inputClass}`}
              aria-label="Add note"
            />
            <button
              type="button"
              onClick={onAddNote}
              disabled={!hasNoteInput}
              className={btnPrimary}
            >
              Add note
            </button>
          </div>
        )}
      </section>

      <section className={cardClass}>
        <h2 className={sectionTitleClass}>Goals</h2>
        <ul className="mb-3 space-y-1.5 text-sm text-slate-700">
          {project.goals?.map((goal) => (
            <li
              key={goal}
              className="flex items-start gap-3 rounded-lg border border-[oklch(88%_0.065_140)] bg-[oklch(97%_0.045_140)] px-3 py-1.5"
            >
              <span className="min-w-0 flex-1 font-medium leading-6">{goal}</span>
              <button
                type="button"
                onClick={() => onRemoveGoal(goal)}
                aria-label={`Remove goal ${goal}`}
              >
                ×
              </button>
            </li>
          ))}
          {!project.goals?.length && <li className="font-medium text-slate-500">No goals yet.</li>}
        </ul>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={goalInput}
            onChange={(event) => onGoalInputChange(event.target.value)}
            onKeyDown={onGoalKeyDown}
            className={inputClass}
            placeholder="Add a goal"
          />
          <button type="button" onClick={onAddGoal} disabled={!hasGoalInput} className={btnPrimary}>
            Add goal
          </button>
        </div>
      </section>
    </>
  );
}
