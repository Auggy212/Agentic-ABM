import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { uploadCsv, type CsvUploadResponse } from "@/lib/api";
import { useIntakeStore } from "@/store/intakeStore";
import DataTable from "@/components/ui/DataTable";
import Badge from "@/components/ui/Badge";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

const REQUIRED_COLS = ["Company Name", "Website"];
const ACCEPTED_TYPES = [".csv", "text/csv", "application/vnd.ms-excel"];

export default function CsvUploadField() {
  const { formData, setField } = useIntakeStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<CsvUploadResponse | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const mutation = useMutation({
    mutationFn: uploadCsv,
    onSuccess: (data) => {
      setResult(data);
      if (data.valid) {
        // Store a reference token — in a real flow the backend returns a path/key
        setField("existing_account_list", `uploaded_${Date.now()}.csv`);
      }
    },
  });

  function handleFile(file: File) {
    const ext = file.name.toLowerCase();
    if (!ext.endsWith(".csv") && !ext.endsWith(".xlsx")) {
      setResult({
        valid: false,
        row_count: 0,
        warnings: [],
        errors: ["Only .csv files are accepted. Please export your list as CSV."],
        preview: [],
      });
      return;
    }
    setResult(null);
    mutation.mutate(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleRemove() {
    setResult(null);
    setField("existing_account_list", null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const detectedCols = result?.preview?.[0] ? Object.keys(result.preview[0]) : [];
  const missingCols  = REQUIRED_COLS.filter((c) => !detectedCols.includes(c));

  // Preview table columns derived from first row
  const previewColumns = detectedCols.slice(0, 5).map((k) => ({
    key: k,
    header: k,
    render: (row: Record<string, unknown>) => String(row[k] ?? ""),
  }));

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      {!formData.existing_account_list && (
        <div
          className={`relative rounded-lg border-2 border-dashed p-6 text-center transition cursor-pointer
            ${dragOver
              ? "border-brand-400 bg-brand-50"
              : "border-gray-300 hover:border-gray-400 bg-white"
            }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
          aria-label="Upload CSV file"
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            onChange={handleInputChange}
            className="sr-only"
          />
          {mutation.isPending ? (
            <LoadingSpinner label="Uploading…" />
          ) : (
            <>
              <svg className="mx-auto h-8 w-8 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-sm text-gray-600 font-medium">
                Drop your CSV here or{" "}
                <span className="text-brand-600 underline underline-offset-2">browse</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">
                .csv files only · Required columns: <em>Company Name</em>, <em>Website</em>
              </p>
            </>
          )}
        </div>
      )}

      {/* Upload result */}
      {result && (
        <div className="space-y-3">
          {/* Status banner */}
          <div className={`flex items-start gap-3 rounded-lg p-3 ${result.valid ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
            <span className="text-lg">{result.valid ? "✓" : "✗"}</span>
            <div className="flex-1 min-w-0">
              {result.valid ? (
                <p className="text-sm font-medium text-green-800">
                  File uploaded — {result.row_count} companies detected
                </p>
              ) : (
                <p className="text-sm font-medium text-red-800">Upload failed</p>
              )}
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-700 mt-0.5">{e}</p>
              ))}
              {result.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700 mt-0.5">⚠ {w}</p>
              ))}
            </div>
            <button
              type="button"
              onClick={handleRemove}
              className="text-xs text-gray-500 hover:text-gray-700 transition underline"
            >
              Remove
            </button>
          </div>

          {/* Missing required columns warning */}
          {missingCols.length > 0 && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
              <p className="text-xs font-semibold text-red-700 mb-1">Missing required columns:</p>
              <div className="flex gap-1.5 flex-wrap">
                {missingCols.map((c) => (
                  <Badge key={c} variant="danger">{c}</Badge>
                ))}
              </div>
              <p className="text-xs text-red-600 mt-1">
                Please add these columns to your CSV and re-upload.
              </p>
            </div>
          )}

          {/* Detected columns */}
          {detectedCols.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1.5">Detected columns:</p>
              <div className="flex gap-1.5 flex-wrap">
                {detectedCols.map((c) => (
                  <Badge key={c} variant={REQUIRED_COLS.includes(c) ? "success" : "default"}>
                    {c}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          {result.preview.length > 0 && previewColumns.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1.5">
                Preview (first {result.preview.length} rows):
              </p>
              <DataTable
                columns={previewColumns}
                data={result.preview as unknown as Record<string, unknown>[]}
                className="text-xs"
              />
            </div>
          )}
        </div>
      )}

      {/* Already uploaded indicator */}
      {formData.existing_account_list && !result && (
        <div className="flex items-center gap-2 text-sm text-green-700">
          <span>✓</span>
          <span>Account list already uploaded</span>
          <button
            type="button"
            onClick={handleRemove}
            className="text-xs text-gray-500 hover:text-red-500 underline transition ml-1"
          >
            Remove
          </button>
        </div>
      )}

      {mutation.isError && (
        <p className="form-error">Upload failed. Please try again.</p>
      )}
    </div>
  );
}
