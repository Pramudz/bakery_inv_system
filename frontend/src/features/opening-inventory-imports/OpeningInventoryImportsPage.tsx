import { useEffect, useRef, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { useAuth } from '../auth/AuthContext';
import { OpeningHistoryPage, OpeningPreview, openingInventoryImportsApi as api } from './openingInventoryImportsApi';
import '../reference-imports/reference-imports.css';

const saveBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const message = (error: unknown) => error instanceof Error ? error.message : 'Request failed.';
const initialHistory: OpeningHistoryPage = { items: [], page: 1, limit: 20, totalCount: 0, totalPages: 1 };

export function OpeningInventoryImportsPage() {
  const { permissions, tenant, tenantUser } = useAuth();
  const canPreview = permissions.includes('INVENTORY_ADJUSTMENT_VIEW') && permissions.includes('INVENTORY_ADJUSTMENT_CREATE');
  const canConfirm = canPreview && permissions.includes('INVENTORY_ADJUSTMENT_POST') && permissions.includes('INVENTORY_OPENING_POST');
  const [datasetId, setDatasetId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<OpeningPreview | null>(null);
  const [history, setHistory] = useState<OpeningHistoryPage>(initialHistory);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<20 | 50 | 100>(20);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [dialog, setDialog] = useState<'confirm' | 'clear' | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const revision = useRef(0);
  const storageKey = `opening-inventory-import:${tenant?.tenantId ?? 'none'}:${tenantUser?.userId ?? 'none'}`;

  const clearFile = () => { if (input.current) input.current.value = ''; setFile(null); };
  const reset = () => {
    if (lock.current) return;
    revision.current++; clearFile(); setFileName(''); setDatasetId(''); setPreview(null);
    setError(''); setNotice(''); setUncertain(false); setDialog(null); sessionStorage.removeItem(storageKey);
  };
  const run = async (label: string, task: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(label); setError('');
    try { await task(); } catch (problem) { setError(message(problem)); }
    finally { lock.current = false; setBusy(''); }
  };
  useEffect(() => {
    const stored = sessionStorage.getItem(storageKey);
    if (!stored) return;
    let saved: { batchId: number; datasetId: string; fileName: string };
    try { saved = JSON.parse(stored); } catch { sessionStorage.removeItem(storageKey); return; }
    if (!Number.isSafeInteger(saved.batchId) || saved.batchId <= 0) return;
    const current = ++revision.current; lock.current = true; setBusy('Checking batch status');
    setDatasetId(saved.datasetId); setFileName(saved.fileName);
    api.get(saved.batchId).then(result => {
      if (revision.current !== current) return;
      setPreview(result); setNotice(result.status === 'COMPLETED' ? 'Completed results restored.' : 'Preview restored; stock has not been posted.');
    }).catch(problem => { if (revision.current === current) setError(message(problem)); })
      .finally(() => { if (revision.current === current) { lock.current = false; setBusy(''); } });
  }, [storageKey]);
  useEffect(() => {
    let active = true;
    api.history(page, limit).then(result => { if (active) { setHistory(result); if (page > result.totalPages) setPage(result.totalPages); } })
      .catch(problem => { if (active) setError(message(problem)); });
    return () => { active = false; };
  }, [page, limit, preview?.status]);

  const downloadTemplate = (sample: boolean) => run('Downloading template', async () =>
    saveBlob(await api.template(sample), `Opening_Inventory_${sample ? 'Sample' : 'Template'}.xlsx`));
  const validate = () => {
    if (!file || !file.name.toLowerCase().endsWith('.xlsx') || file.size > 5 * 1024 * 1024) { setError('Choose an .xlsx file up to 5 MB.'); return; }
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(datasetId)) { setError('Enter a Dataset ID of 1–100 letters, numbers, dots, underscores or hyphens.'); return; }
    const current = revision.current;
    run('Validating workbook', async () => {
      const result = await api.preview(datasetId, file);
      if (revision.current !== current) return;
      setPreview(result); setUncertain(false);
      sessionStorage.setItem(storageKey, JSON.stringify({ batchId: result.batchId, datasetId, fileName: file.name }));
      if (result.status === 'COMPLETED') { clearFile(); setNotice('This exact workbook was already posted. No duplicate stock movement was created.'); }
      else setNotice('Validation preview only. No inventory has changed.');
    });
  };
  const checkStatus = async (batch: OpeningPreview, failedMessage = '') => {
    try {
      const result = await api.get(batch.batchId); setPreview(result); setUncertain(false);
      setError(result.status === 'PREVIEW' ? failedMessage : '');
      setNotice(result.status === 'COMPLETED' ? 'Import completed. Results are available.' : 'The batch remains a preview; review it before confirming again.');
      if (result.status === 'COMPLETED') clearFile();
    } catch (problem) {
      setUncertain(true); setError(`Could not verify batch status: ${message(problem)} Check status before retrying.`);
    }
  };
  const confirm = () => {
    if (!preview || preview.status !== 'PREVIEW' || preview.summary.errorRows || !preview.summary.readyRows || lock.current || uncertain || !canConfirm) return;
    const batch = preview; setDialog(null); lock.current = true; setBusy('Posting opening inventory'); setError(''); setNotice('');
    api.confirm(batch.batchId).then(result => { setPreview(result); setUncertain(false); clearFile(); setNotice('Opening inventory posted atomically. Download the results.'); })
      .catch(async problem => {
        if (problem && typeof problem === 'object' && 'status' in problem && typeof problem.status === 'number') { setError(`Import was not confirmed: ${message(problem)}`); return; }
        const interrupted = `Confirmation response was interrupted: ${message(problem)} Check batch status before retrying.`;
        setError(interrupted); await checkStatus(batch, interrupted);
      }).finally(() => { lock.current = false; setBusy(''); });
  };
  const downloadValidation = () => preview && run('Downloading validation report', async () =>
    saveBlob(await api.validationReport(preview.batchId), `Opening_Inventory_Validation_${preview.batchId}.xlsx`));
  const downloadResults = () => preview && run('Downloading results', async () =>
    saveBlob(await api.results(preview.batchId), `Opening_Inventory_Results_${preview.batchId}.xlsx`));
  const stage = preview?.status === 'COMPLETED' ? 4 : busy.startsWith('Posting') || dialog === 'confirm' ? 3 : preview ? 2 : 1;

  return <div className="reference-imports-page">
    <div className="page-head"><div><h1>Opening Inventory Bulk Import</h1><p>Post existing stock products once per product and location using the current tenant business date.</p></div></div>
    <ol className="reference-imports-stages" aria-label="Import stages">{['Upload', 'Validate & Preview', 'Confirm', 'Results'].map((label, index) => <li key={label} className={stage >= index + 1 ? 'active' : ''}>{index + 1}. {label}</li>)}</ol>
    <div className="card reference-imports-workspace">
      <div className="reference-imports-top"><h2>Upload</h2><button className="btn btn-secondary" type="button" disabled={!!busy} onClick={() => preview?.status === 'COMPLETED' ? setDialog('clear') : reset()}>Clear All</button></div>
      <label className="reference-imports-label" htmlFor="opening-dataset">Dataset ID</label>
      <input id="opening-dataset" className="control" value={datasetId} disabled={!!busy || !!preview} onChange={event => setDatasetId(event.target.value)} placeholder="e.g. store-opening-2026" />
      <p className="reference-imports-help">Use a stable ID to trace the workbook. Existing stock history blocks a second opening even with a different ID.</p>
      <div className="reference-imports-actions"><button className="btn btn-secondary" type="button" disabled={!!busy} onClick={() => downloadTemplate(false)}>Download Blank Template</button><button className="btn btn-secondary" type="button" disabled={!!busy} onClick={() => downloadTemplate(true)}>Download Sample Excel</button></div>
      <label className="reference-imports-label" htmlFor="opening-file">Upload Excel (.xlsx, up to 5 MB)</label>
      <input ref={input} id="opening-file" className="control" type="file" accept=".xlsx" disabled={!canPreview || !!busy} onChange={event => { revision.current++; const next = event.target.files?.[0] ?? null; setFile(next); setFileName(next?.name ?? ''); setPreview(null); setError(''); setNotice(''); setUncertain(false); sessionStorage.removeItem(storageKey); }} />
      {file && <div className="reference-imports-file"><span><strong>{file.name}</strong> · {(file.size / 1024).toFixed(1)} KB</span><button className="btn btn-secondary" type="button" disabled={!!busy} onClick={clearFile}>Remove file</button></div>}
      {!canPreview && <p className="error-text">Inventory adjustment view and create permissions are required to preview.</p>}
      <div className="reference-imports-actions"><button className="btn btn-primary" type="button" disabled={!canPreview || !file || !!busy} onClick={validate}>Validate and Preview</button></div>
      {busy && <p className="reference-imports-status" role="status"><span className="reference-imports-spinner" aria-hidden="true" />{busy}</p>}
      {error && <div className="error-box" role="alert">{error}</div>}
      {notice && <div className="reference-imports-notice" role="status">{notice}</div>}
      {uncertain && preview && <button className="btn btn-secondary" type="button" disabled={!!busy} onClick={() => run('Checking batch status', () => checkStatus(preview))}>Check Batch Status</button>}
    </div>
    {preview && <div className="card reference-imports-preview">
      <div className="reference-imports-top"><div><h2>{preview.status === 'COMPLETED' ? 'Import Completed' : 'Validation Preview'}</h2><p>{preview.status === 'PREVIEW' ? 'No inventory has changed. All rows must be ready before confirmation.' : 'The complete workbook was posted in one transaction.'}</p></div><div className="reference-imports-actions"><button className="btn btn-secondary" type="button" onClick={() => historyRef.current?.scrollIntoView({ behavior: 'smooth' })}>Return to History</button><button className="btn btn-secondary" type="button" disabled={!!busy} onClick={preview.status === 'COMPLETED' ? downloadResults : downloadValidation}>{preview.status === 'COMPLETED' ? 'Download Results' : 'Download Validation Report'}</button></div></div>
      <div className="reference-imports-counts" role="status"><span><strong>{preview.summary.totalRows}</strong> Rows</span><span><strong>{preview.summary.readyRows}</strong> Ready</span><span><strong>{preview.summary.errorRows}</strong> Errors</span><span><strong>{preview.summary.postedRows}</strong> Posted</span><span><strong>{preview.summary.locationsAffected}</strong> Locations</span><span><strong>{preview.summary.totalOpeningValue}</strong> Value</span></div>
      <p>Base quantities by unit: {Object.entries(preview.summary.baseQuantitiesByUnit).map(([unit, quantity]) => `${quantity} ${unit}`).join(' · ') || '—'}</p>
      {preview.status === 'PREVIEW' && <div className="reference-imports-confirm"><p>{preview.summary.errorRows ? 'Correct every error and upload a new workbook.' : 'Confirmation rechecks current stock and posts every row atomically.'}</p><button className="btn btn-primary" type="button" disabled={!canConfirm || !preview.summary.readyRows || !!preview.summary.errorRows || !!busy || uncertain} onClick={() => setDialog('confirm')}>Review and Confirm Import</button>{!canConfirm && <p className="error-text">Adjustment create, post and opening-post permissions are required to confirm.</p>}</div>}
      <div className="table-wrap"><table className="table"><thead><tr><th>Row / Ref</th><th>Location / SKU</th><th>Product</th><th>Unit / Qty</th><th>Factor / Base Qty</th><th>Base Cost / Value</th><th>Existing Qty / WAVG</th><th>History / Claim</th><th>Status / Reason</th><th>Posting</th></tr></thead><tbody>{preview.rows.map(row => <tr key={row.rowNumber}><td>{row.rowNumber}<small>{row.values.RowReference}</small></td><td>{row.values.LocationCode}<small>{row.values.SKU}</small></td><td>{row.productName || '—'}</td><td>{row.values.UnitCode} / {row.values.Quantity}</td><td>{row.conversionFactor || '—'} / {row.baseQuantity || '—'} {row.baseUnitCode}</td><td>{row.values.BaseUnitCost} / {row.openingValue || '—'}</td><td>{row.existingQuantity || '—'} / {row.existingWavg || '—'}</td><td>{row.historicalMovement ? 'Movement' : 'None'} / {row.openingClaim ? 'Claim' : 'None'}</td><td>{row.status}<small>{row.details}</small></td><td>{row.adjustmentNumber || '—'}<small>{row.postingDate || ''}{row.ledgerId ? ` · Ledger ${row.ledgerId}` : ''}</small></td></tr>)}</tbody></table></div>
    </div>}
    <div ref={historyRef} className="card reference-imports-preview"><div className="reference-imports-top"><h2>Import History</h2><p>{history.totalCount} batches</p></div><label className="reference-imports-label" htmlFor="opening-history-size">Records per page</label><select id="opening-history-size" className="control" value={limit} onChange={event => { setLimit(Number(event.target.value) as 20 | 50 | 100); setPage(1); }}>{[20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}</select><div className="table-wrap"><table className="table"><thead><tr><th>Batch</th><th>Dataset</th><th>Created</th><th>Status</th><th>Actions</th></tr></thead><tbody>{history.items.map(item => <tr key={item.batchId}><td>{item.batchId}</td><td>{item.datasetId}</td><td>{new Date(item.createdAt).toLocaleString()}</td><td>{item.status}</td><td><button className="btn btn-secondary" type="button" disabled={!!busy} onClick={() => run('Loading batch', async () => { const result = await api.get(item.batchId); setPreview(result); setDatasetId(result.datasetId); clearFile(); sessionStorage.setItem(storageKey, JSON.stringify({ batchId: result.batchId, datasetId: result.datasetId, fileName: '' })); })}>View</button></td></tr>)}</tbody></table></div><div className="reference-imports-actions"><button className="btn btn-secondary" type="button" disabled={page <= 1 || !!busy} onClick={() => setPage(value => value - 1)}>Previous</button><span role="status">Page {history.page} of {history.totalPages} · {history.totalCount} total batches</span><button className="btn btn-secondary" type="button" disabled={page >= history.totalPages || !!busy} onClick={() => setPage(value => value + 1)}>Next</button></div></div>
    <Modal open={dialog === 'confirm'} title="Confirm opening inventory?" onClose={() => !busy && setDialog(null)}><div className="reference-imports-dialog"><p><strong>Dataset:</strong> {datasetId}</p><p><strong>File:</strong> {fileName || 'Saved preview'}</p><p><strong>Rows:</strong> {preview?.summary.readyRows ?? 0} · <strong>Errors:</strong> {preview?.summary.errorRows ?? 0}</p><p>This posts stock at the current tenant business date. Each product/location can be opened only once. All rows commit together.</p><div className="reference-imports-actions"><button className="btn btn-secondary" type="button" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-primary" type="button" disabled={!!busy} onClick={confirm}>Confirm Import</button></div></div></Modal>
    <Modal open={dialog === 'clear'} title="Clear this import view?" onClose={() => setDialog(null)}><div className="reference-imports-dialog"><p>Posted results remain in Import History.</p><div className="reference-imports-actions"><button className="btn btn-secondary" type="button" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-primary" type="button" onClick={reset}>Clear All</button></div></div></Modal>
  </div>;
}
