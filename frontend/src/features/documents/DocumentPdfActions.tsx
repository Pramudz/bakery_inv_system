import { useState } from "react";
import { downloadFile } from "../../pages/reportExport";
import type { TransactionDocument } from "./documentTypes";
import { documentFilename } from "./transactionDocuments";
import { transactionDocumentPdf } from "./transactionDocumentPdf";

export function DocumentPdfActions({ document: build }: { document: () => TransactionDocument }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (mode: "view" | "download" | "print") => {
    if (busy) return;
    setError("");
    const popup = mode === "download" ? null : window.open("", "_blank");
    if (mode !== "download" && !popup) {
      setError("Allow this site to open a PDF window, then try again.");
      return;
    }
    setBusy(true);
    try {
      const doc = build();
      const blob = await transactionDocumentPdf(doc);
      if (mode === "download") downloadFile(blob, documentFilename(doc));
      else if (popup) {
        const url = URL.createObjectURL(blob);
        if (mode === "print") popup.addEventListener("load", () => popup.print(), { once: true });
        popup.location.href = url;
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (failure) {
      popup?.close();
      setError(failure instanceof Error ? failure.message : "Unable to generate this PDF. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="document-pdf-actions">
      <div className="document-pdf-buttons">
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void run("view")}>View PDF</button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void run("download")}>Download PDF</button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void run("print")}>Print</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
