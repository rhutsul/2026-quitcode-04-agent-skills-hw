export const NOTE_MAX_LENGTH = 500;

export type NoteFormField = "note";

export type NoteFormState =
  | { status: "idle" }
  | {
      status: "invalid";
      errors: Partial<Record<NoteFormField, string>>;
      values: Partial<Record<NoteFormField, string>>;
    }
  | { status: "ok" }
  | { status: "forbidden"; values: Partial<Record<NoteFormField, string>> };

export type NoteParseResult =
  | { ok: true; data: { note: string } }
  | {
      ok: false;
      errors: Partial<Record<NoteFormField, string>>;
      values: Partial<Record<NoteFormField, string>>;
    };

export function parseNoteForm(formData: FormData): NoteParseResult {
  const raw = formData.get("note");
  // Browsers submit textarea line breaks as CRLF but count them as one
  // character for maxLength, so normalise before measuring.
  const note = typeof raw === "string" ? raw.replace(/\r\n?/g, "\n").trim() : "";

  if (!note) {
    return { ok: false, errors: { note: "Напишіть текст нотатки" }, values: { note } };
  }
  if (note.length > NOTE_MAX_LENGTH) {
    return {
      ok: false,
      errors: { note: `Нотатка задовга: ${note.length} із ${NOTE_MAX_LENGTH} символів` },
      values: { note },
    };
  }

  return { ok: true, data: { note } };
}
