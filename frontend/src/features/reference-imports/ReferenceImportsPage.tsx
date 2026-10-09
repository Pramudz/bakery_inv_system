import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Modal } from '../../components/ui/Modal';
import { ImportMaster, ImportPreview, referenceImportsApi } from './referenceImportsApi';
import './reference-imports.css';

const masters: { key: ImportMaster; label: string; filename: string; view: string; create: string }[] = [
  { key: 'categories', label: 'Category Master', filename: 'Categories', view: 'CATEGORY_VIEW', create: 'CATEGORY_CREATE' },
  { key: 'brands', label: 'Brand Master', filename: 'Brands', view: 'BRAND_VIEW', create: 'BRAND_CREATE' },
  { key: 'units', label: 'Unit Master', filename: 'Units', view: 'UNIT_VIEW', create: 'UNIT_CREATE' },
  { key: 'suppliers', label: 'Supplier Master', filename: 'Suppliers', view: 'SUPPLIER_VIEW', create: 'SUPPLIER_CREATE' },
  { key: 'price-lists', label: 'Price List Master', filename: 'PriceLists', view: 'PRICE_LIST_VIEW', create: 'PRICE_LIST_CREATE' },
  { key: 'locations', label: 'Location Master', filename: 'Locations', view: 'LOCATION_VIEW', create: 'LOCATION_CREATE' },
];
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ReferenceImportsPage() {
  const { permissions, tenant, tenantUser } = useAuth();
  const available = masters.filter((item) => permissions.includes(item.view));
  const [master, setMaster] = useState<ImportMaster>(available[0]?.key ?? 'categories');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState<'confirm' | 'clear' | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const requestLock = useRef(false);
  const revision = useRef(0);
  const storageKey = `reference-import:${tenant?.tenantId ?? 'none'}:${tenantUser?.userId ?? 'none'}`;
  const selected = masters.find((item) => item.key === master)!;
  const canCreate = permissions.includes(selected.create);
  const clearNativeFile = () => { if (fileInput.current) fileInput.current.value = ''; setFile(null); };
  const reset = () => {
    if (requestLock.current) return;
    revision.current += 1;
    clearNativeFile(); setFileName(''); setPreview(null); setError(''); setNotice(''); setUncertain(false); setDialog(null);
    sessionStorage.removeItem(storageKey);
  };
  useEffect(() => {
    const stored = sessionStorage.getItem(storageKey);
    if (!stored) return;
    let saved: { master: ImportMaster; batchId: number; fileName: string };
    try { saved = JSON.parse(stored); } catch { sessionStorage.removeItem(storageKey); return; }
    if (!masters.some((item) => item.key === saved.master && permissions.includes(item.view)) || !Number.isSafeInteger(saved.batchId)) { sessionStorage.removeItem(storageKey); return; }
    const current = ++revision.current;
    requestLock.current = true; setBusy('Checking batch status'); setMaster(saved.master); setFileName(saved.fileName);
    referenceImportsApi.get(saved.master, saved.batchId).then((result) => {
      if (revision.current !== current) return;
      setPreview(result);
      setNotice(result.status === 'COMPLETED' ? 'Import completed. Results are ready to download.' : 'Previous preview restored. No records have been imported yet.');
    }).catch((problem) => { if (revision.current === current) setError(problem instanceof Error ? problem.message : 'Could not restore batch status.'); })
      .finally(() => { if (revision.current === current) { requestLock.current = false; setBusy(''); } });
  }, [storageKey]);
  const run = async (label: string, work: () => Promise<void>) => {
    if (requestLock.current) return;
    requestLock.current = true;
    setBusy(label); setError('');
    try { await work(); }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'Request failed. Please try again.'); }
    finally { requestLock.current = false; setBusy(''); }
  };
  const changeMaster = (value: ImportMaster) => { reset(); setMaster(value); };
  const changeFile = (next: File | null) => {
    revision.current += 1; setFile(next); setFileName(next?.name ?? ''); setPreview(null); setError(''); setNotice(''); setUncertain(false); setDialog(null);
    sessionStorage.removeItem(storageKey);
  };
  const download = (sample: boolean) => run('Downloading', async () => saveBlob(await referenceImportsApi.template(master, sample), `${selected.filename}_${sample ? 'Sample' : 'Template'}.xlsx`));
  const validate = () => {
    if (!file) { setError('Choose an .xlsx file first.'); return; }
    if (!file.name.toLowerCase().endsWith('.xlsx')) { setError('Choose an .xlsx file.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('The file exceeds the 5 MB limit.'); return; }
    const current = revision.current;
    run('Validating workbook', async () => {
      const result = await referenceImportsApi.preview(master, file);
      if (revision.current !== current) return;
      setPreview(result);
      sessionStorage.setItem(storageKey, JSON.stringify({ master, batchId: result.batchId, fileName: file.name }));
      if (result.status === 'COMPLETED') { clearNativeFile(); setNotice('This exact file was already imported. No duplicate records were created. Download the existing results below.'); }
      else setNotice('Preview only. No records have been imported yet.');
    });
  };
  const checkStatus = async (batch: ImportPreview) => {
    try {
      const result = await referenceImportsApi.get(batch.master, batch.batchId);
      setPreview(result); setUncertain(false); setError('');
      if (result.status === 'COMPLETED') { clearNativeFile(); setNotice('Import completed. Results are ready to download.'); }
      else setNotice('The batch is still a preview. You may safely confirm it again.');
    } catch (problem) {
      setUncertain(true);
      setError(`Could not verify batch status: ${problem instanceof Error ? problem.message : 'Request failed'}. Check status before retrying.`);
    }
  };
  const confirm = () => {
    if (!preview || preview.status !== 'PREVIEW' || !preview.counts.create || requestLock.current || uncertain) return;
    const batch = preview;
    setDialog(null); requestLock.current = true; setBusy('Importing records — please wait'); setError(''); setNotice('');
    referenceImportsApi.confirm(master, batch.batchId).then((result) => {
      setPreview(result); setUncertain(false);
      if (result.status === 'COMPLETED') {
        clearNativeFile(); setNotice('Import completed. Download the results to keep a copy of every row outcome.');
      } else setNotice('The batch is still a preview. Check its status before confirming again.');
    }).catch(async (problem) => {
      setError(`Confirmation response was interrupted: ${problem instanceof Error ? problem.message : 'Request failed'}. Checking batch status…`);
      await checkStatus(batch);
    }).finally(() => { requestLock.current = false; setBusy(''); });
  };
  const downloadResults = () => {
    if (!preview || preview.status !== 'COMPLETED') return;
    run('Downloading', async () => saveBlob(await referenceImportsApi.results(master, preview.batchId), `${selected.filename}_Results_${preview.batchId}.xlsx`));
  };
  const stage = preview?.status === 'COMPLETED' ? 4 : (dialog === 'confirm' || busy.startsWith('Importing')) ? 3 : preview ? 2 : 1;
  return <div className="reference-imports-page">
    <div className="page-head"><div><h1>Bulk Data Import</h1><p>Upload, validate and preview, confirm, then download the results. Existing records are skipped and never updated.</p></div></div>
    <ol className="reference-imports-stages" aria-label="Import stages">{['Upload', 'Validate & Preview', 'Confirm', 'Results'].map((label, index) => <li key={label} className={stage >= index + 1 ? 'active' : ''}>{index + 1}. {label}</li>)}</ol>
    <div className="card reference-imports-workspace">
      <div className="reference-imports-top"><h2>Upload</h2><button className="btn btn-secondary" type="button" disabled={!!busy} onClick={() => preview?.status === 'COMPLETED' ? setDialog('clear') : reset()}>Clear All</button></div>
      <label className="reference-imports-label" htmlFor="import-master">Reference master</label>
      <select id="import-master" className="control" value={master} disabled={!!busy} onChange={(event) => changeMaster(event.target.value as ImportMaster)}>
        {available.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}
      </select>
      <div className="reference-imports-actions">
        <button className="btn btn-secondary" type="button" disabled={!!busy} onClick={() => download(false)}>Download Blank Template</button>
        <button className="btn btn-secondary" type="button" disabled={!!busy} onClick={() => download(true)}>Download Sample Excel</button>
      </div>
      {master === 'suppliers' && <p className="reference-imports-help">Supplier Reference (S001, S002, S003) is a stable Excel identifier for safe retries, separate from the ERP Supplier Code. Leave SupplierCode blank to let the ERP generate it; reuse the same Supplier Reference when uploading again.</p>}
      <label className="reference-imports-label" htmlFor="import-file">Upload Excel (.xlsx, up to 5 MB and 1,000 rows)</label>
      <input ref={fileInput} id="import-file" className="control" type="file" accept=".xlsx" disabled={!canCreate || !!busy} onChange={(event) => changeFile(event.target.files?.[0] ?? null)} />
      {file && <div className="reference-imports-file"><span><strong>{file.name}</strong> · {(file.size / 1024).toFixed(1)} KB · {file.name.toLowerCase().endsWith('.xlsx') && file.size <= 5 * 1024 * 1024 ? 'Ready to validate' : 'Invalid file'}</span><button className="btn btn-secondary" type="button" disabled={!!busy} onClick={() => { clearNativeFile(); changeFile(null); }}>Remove file</button></div>}
      {!canCreate && <p className="error-text">Create permission is required to validate and import this master.</p>}
      <div className="reference-imports-actions">
        <button className="btn btn-primary" type="button" disabled={!canCreate || !file || !!busy} onClick={validate}>Validate and Preview</button>
      </div>
      {busy && <p className="reference-imports-status" role="status"><span className="reference-imports-spinner" aria-hidden="true" />{busy}</p>}
      {error && <div className="error-box" role="alert">{error}</div>}
      {notice && <div className="reference-imports-notice" role="status">{notice}</div>}
      {uncertain && preview && <button className="btn btn-secondary" type="button" disabled={!!busy} onClick={() => run('Checking batch status', () => checkStatus(preview))}>Check Batch Status</button>}
    </div>
    {preview && <div className="card reference-imports-preview">
      <div className="reference-imports-top"><div><h2>{preview.status === 'COMPLETED' ? 'Import Completed' : 'Validation Preview'}</h2><p>{preview.status === 'PREVIEW' ? 'These are planned actions. No records have been imported yet.' : 'The server confirmed this batch. Review or download its results.'}</p></div>{preview.status === 'COMPLETED' && <button className="btn btn-secondary" type="button" disabled={!!busy} onClick={downloadResults}>Download Results</button>}</div>
      <div className="reference-imports-counts" role="status"><span><strong>{preview.counts.create}</strong> {preview.status === 'COMPLETED' ? 'Created' : 'To Create'}</span><span><strong>{preview.counts.skip}</strong> {preview.status === 'COMPLETED' ? 'Skipped' : 'To Skip'}</span><span><strong>{preview.counts.error}</strong> Errors</span></div>
      {preview.status === 'PREVIEW' && <div className="reference-imports-confirm"><p>{preview.counts.create ? 'Rows with errors will not be imported. Existing records will not be updated.' : preview.counts.skip && !preview.counts.error ? 'All records already exist. No confirmation is needed.' : 'No records are eligible to create. Correct errors and validate a new file.'}</p><button className="btn btn-primary" type="button" disabled={!canCreate || !preview.counts.create || !!busy || uncertain} onClick={() => setDialog('confirm')}>Review and Confirm Import</button></div>}
      {preview.status === 'COMPLETED' && <div className="reference-imports-actions"><button className="btn btn-secondary" type="button" disabled={!!busy} onClick={() => setDialog('clear')}>Start New Import</button><p>Download the results before clearing this view.</p></div>}
      <div className="table-wrap"><table className="table"><thead><tr><th>Excel Row</th><th>Action</th><th>Record Code</th><th>Record Name</th>{master === 'suppliers' && <th>Supplier Reference</th>}<th>Details / Reason</th></tr></thead><tbody>
        {[...preview.rows].sort((a, b) => a.rowNumber - b.rowNumber).map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{preview.status === 'COMPLETED' && row.action === 'CREATE' ? 'CREATED' : row.action}</td><td>{row.code || (row.action === 'CREATE' && master === 'suppliers' ? 'Generated on import' : '—')}</td><td>{String(row.values.categoryName ?? row.values.brandName ?? row.values.supplierName ?? row.values.name ?? '')}</td>{master === 'suppliers' && <td>{String(row.values.supplierImportRef ?? '—')}</td>}<td>{row.errors.join('; ') || row.details || (preview.status === 'COMPLETED' ? 'Created successfully.' : 'Ready to create.')}</td></tr>)}
      </tbody></table></div>
    </div>}
    <Modal open={dialog === 'confirm'} title="Are you sure you want to import these records?" onClose={() => !busy && setDialog(null)}>
      <div className="reference-imports-dialog"><p><strong>Master:</strong> {selected.label}</p><p><strong>File:</strong> {fileName}</p><p><strong>To create:</strong> {preview?.counts.create ?? 0} · <strong>To skip:</strong> {preview?.counts.skip ?? 0} · <strong>Validation errors:</strong> {preview?.counts.error ?? 0}</p><p>Existing records will be skipped and will not be updated. Rows with errors will not be imported.</p><div className="reference-imports-actions"><button className="btn btn-secondary" type="button" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-primary" type="button" disabled={!!busy} onClick={confirm}>Confirm Import</button></div></div>
    </Modal>
    <Modal open={dialog === 'clear'} title="Clear this import view?" onClose={() => setDialog(null)}><div className="reference-imports-dialog"><p>Completed results will be hidden from this screen. Download them first if you need a copy. Existing ERP records and import batches remain unchanged.</p><div className="reference-imports-actions"><button className="btn btn-secondary" type="button" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-primary" type="button" onClick={reset}>Clear All</button></div></div></Modal>
  </div>;
}
