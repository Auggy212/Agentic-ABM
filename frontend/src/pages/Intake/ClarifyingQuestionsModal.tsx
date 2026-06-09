import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import type { ClarifyingQuestion } from "@/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  questions: ClarifyingQuestion[];
  onSubmit: (answers: Record<string, string>) => void;
  isSubmitting: boolean;
}

/**
 * Shown when the backend returns status=needs_clarification.
 * Each question gets an inline textarea. The user fills in answers,
 * which are merged back into the form and re-submitted.
 */
export default function ClarifyingQuestionsModal({
  open,
  onClose,
  questions,
  onSubmit,
  isSubmitting,
}: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(questions.map((q) => [q.field, ""]))
  );

  // Reset when questions change (new clarification round)
  const [lastQuestions, setLastQuestions] = useState(questions);
  if (questions !== lastQuestions) {
    setLastQuestions(questions);
    setAnswers(Object.fromEntries(questions.map((q) => [q.field, ""])));
  }

  const allAnswered = questions.every((q) => (answers[q.field] ?? "").trim().length > 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allAnswered) return;
    onSubmit(answers);
  }

  // Format field path for display: "company.value_prop" → "Company › Value Prop"
  function formatField(field: string): string {
    return field
      .split(".")
      .map((part) =>
        part
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
      )
      .join(" › ");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="A few more details needed"
      size="lg"
      footer={
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Answer all {questions.length} question{questions.length !== 1 ? "s" : ""} to continue.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Back to form
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={!allAnswered}
              loading={isSubmitting}
            >
              Submit answers
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-1 mb-5">
        <p className="text-sm text-gray-600">
          The system identified fields that need more detail to build a high-quality account list.
          Please expand your answers below.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {questions.map((q, i) => (
          <div key={q.field} className="space-y-2">
            <div className="flex items-start gap-2">
              <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                  {formatField(q.field)}
                </p>
                <p className="text-sm font-medium text-gray-800 leading-snug">
                  {q.question}
                </p>
              </div>
            </div>
            <textarea
              className="form-textarea mt-2 ml-7"
              rows={3}
              value={answers[q.field] ?? ""}
              onChange={(e) =>
                setAnswers((prev) => ({ ...prev, [q.field]: e.target.value }))
              }
              placeholder="Your clarified answer…"
              aria-label={`Answer for: ${q.question}`}
            />
            {(answers[q.field] ?? "").trim().length === 0 && (
              <p className="form-error ml-7">This answer is required</p>
            )}
          </div>
        ))}
      </form>
    </Modal>
  );
}
