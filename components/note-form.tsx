"use client";

import { useActionState } from "react";
import { addLeadNote } from "@/app/dashboard/leads/[id]/actions";
import { NOTE_MAX_LENGTH, type NoteFormState } from "@/lib/note-form";

const initialState: NoteFormState = { status: "idle" };

export function NoteForm({ leadId }: { leadId: string }) {
  const [state, formAction, pending] = useActionState(addLeadNote, initialState);
  const errors = state.status === "invalid" ? state.errors : {};
  const values = state.status === "invalid" || state.status === "forbidden" ? state.values : {};

  return (
    <form action={formAction} key={JSON.stringify(values)} className="space-y-2" noValidate>
      {state.status === "invalid" && (
        <p role="alert" className="text-sm text-red-700">
          Перевірте 1 поле
        </p>
      )}
      {state.status === "forbidden" && (
        <p role="alert" className="text-sm text-red-700">
          Лід не знайдено або він належить іншому робочому простору.
        </p>
      )}
      {state.status === "ok" && (
        <p role="status" className="text-sm text-emerald-700">
          Нотатку додано.
        </p>
      )}

      <input type="hidden" name="leadId" value={leadId} />
      <label htmlFor="note" className="block font-medium">
        Додати нотатку
      </label>
      <textarea
        id="note"
        name="note"
        rows={3}
        required
        maxLength={NOTE_MAX_LENGTH}
        defaultValue={values.note}
        aria-invalid={!!errors.note}
        aria-describedby="note-hint note-error"
        className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <p id="note-hint" className="text-xs text-slate-500">
        До {NOTE_MAX_LENGTH} символів. Нотатку бачать лише учасники робочого простору.
      </p>
      <p id="note-error" className="text-xs text-red-600">
        {errors.note}
      </p>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {pending ? "Зберігаємо…" : "Додати нотатку"}
      </button>
    </form>
  );
}
