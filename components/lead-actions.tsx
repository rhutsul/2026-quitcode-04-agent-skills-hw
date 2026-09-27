"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { deleteLead, updateLeadStatus } from "@/app/actions";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/types";
import { STATUS_LABELS } from "./status-badge";

const FORBIDDEN_MESSAGE = "Не вдалося: лід не знайдено або він належить іншому робочому простору.";
const FAILED_MESSAGE = "Не вдалося зберегти зміну. Перевірте з'єднання й спробуйте ще раз.";

export function LeadActions({ leadId, status }: { leadId: string; status: LeadStatus }) {
  const router = useRouter();
  const [current, setCurrent] = useState<LeadStatus>(status);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function changeStatus(next: LeadStatus) {
    const previous = current;
    setCurrent(next);
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateLeadStatus(leadId, next);
        if (result.status !== "ok") {
          setCurrent(previous); // the server refused: show the real status again
          setError(FORBIDDEN_MESSAGE);
          return;
        }
        router.refresh();
      } catch (error) {
        // A redirect (e.g. to /login when the session expired) rejects the call too: let Next.js handle it.
        unstable_rethrow(error);
        setCurrent(previous); // the call itself failed (network, server error)
        setError(FAILED_MESSAGE);
      }
    });
  }

  function remove() {
    if (!window.confirm("Видалити лід назавжди?")) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteLead(leadId);
        if (result.status !== "ok") {
          setError(FORBIDDEN_MESSAGE);
          return;
        }
        router.push("/dashboard");
      } catch (error) {
        unstable_rethrow(error); // redirects stay redirects
        setError(FAILED_MESSAGE);
      }
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <label className="text-sm font-medium">
          Статус
          <select
            value={current}
            disabled={pending}
            onChange={(event) => changeStatus(event.target.value as LeadStatus)}
            className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {LEAD_STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
        >
          Видалити лід
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
