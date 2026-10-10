import { useEffect, useRef, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { useAuth } from '../auth/AuthContext';
import { ProductImportPreview, ProductImportType, ProductImportHistoryPage, productImportsApi } from './productImportsApi';
import '../reference-imports/reference-imports.css';

const types: { key: ProductImportType; label: string }[] = [
  { key: 'onboarding', label: 'Complete Product Onboarding' },
  { key: 'products', label: 'Product Master' }, { key: 'product-units', label: 'Product Units' },
  { key: 'identifiers', label: 'Product Identifiers' }, { key: 'selling-prices', label: 'Selling Prices' },
  { key: 'selling-discounts', label: 'Selling Price Discounts' }, { key: 'product-suppliers', label: 'Product Suppliers' },
  { key: 'supplier-units', label: 'Supplier Purchase Units' }, { key: 'supplier-prices', label: 'Supplier Purchase Prices' },
  { key: 'product-locations', label: 'Product Locations' }, { key: 'product-attributes', label: 'Product Attributes' },
];
const saveBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export function ProductImportsPage() {
  const { permissions, tenant, tenantUser } = useAuth();
  const [type, setType] = useState<ProductImportType>('onboarding');
  const [datasetId, setDatasetId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ProductImportPreview | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLimit, setHistoryLimit] = useState<20 | 50 | 100>(20);
  const [history, setHistory] = useState<ProductImportHistoryPage>({ items: [], page: 1, limit: 20, totalCount: 0, totalPages: 1 });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [dialog, setDialog] = useState<'confirm' | 'clear' | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const revision = useRef(0);
  const storageKey = `product-import:${tenant?.tenantId ?? 'none'}:${tenantUser?.userId ?? 'none'}`;
  const canCreate = permissions.includes('PRODUCT_CREATE');
  const canUpdate = permissions.includes('PRODUCT_UPDATE');
  const canImport = type === 'onboarding' ? canCreate : type === 'products' ? canCreate && canUpdate : canUpdate;
  const eligible = preview ? preview.counts.create + preview.counts.update + preview.counts.revise + preview.counts.end : 0;
  const onboardingRows = preview?.rows.filter((row) => row.sheet === 'products') ?? [];
  const countFor = (key: string, sheet: ProductImportType) => preview?.rows.filter((row) => row.values.ProductImportKey === key && row.sheet === sheet).length ?? 0;

  const clearFile = () => { if (input.current) input.current.value = ''; setFile(null); };
  const reset = () => {
    if (lock.current) return;
    revision.current += 1; clearFile(); setFileName(''); setPreview(null); setError(''); setNotice('');
    setUncertain(false); setDialog(null); sessionStorage.removeItem(storageKey);
  };
  const run = async (label: string, task: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(label); setError('');
    try { await task(); }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'Request failed.'); }
    finally { lock.current = false; setBusy(''); }
  };
  useEffect(() => {
    const stored = sessionStorage.getItem(storageKey);
    if (!stored) return;
    let saved: { type: ProductImportType; batchId: number; fileName: string; datasetId: string };
    try { saved = JSON.parse(stored); } catch { sessionStorage.removeItem(storageKey); return; }
    if (!types.some((item) => item.key === saved.type) || !Number.isSafeInteger(saved.batchId)) return;
    const current = ++revision.current;
    lock.current = true; setBusy('Checking batch status'); setType(saved.type); setDatasetId(saved.datasetId); setFileName(saved.fileName);
    productImportsApi.get(saved.type, saved.batchId).then((result) => {
      if (revision.current !== current) return;
      setPreview(result); setNotice(result.status === 'COMPLETED' ? 'Completed results restored.' : 'Preview restored; no import has been confirmed.');
    }).catch((problem) => { if (revision.current === current) setError(problem instanceof Error ? problem.message : 'Could not restore batch.'); })
      .finally(() => { if (revision.current === current) { lock.current = false; setBusy(''); } });
  }, [storageKey]);
  useEffect(() => {
    let active = true;
    productImportsApi.history(type, historyPage, historyLimit).then((result) => {
      if (!active) return;
      setHistory(result);
      if (historyPage > result.totalPages) setHistoryPage(result.totalPages);
    }).catch((problem) => { if (active) setError(problem instanceof Error ? problem.message : 'Could not load import history.'); });
    return () => { active = false; };
  }, [type, historyPage, historyLimit, preview?.status]);
  const changeType = (next: ProductImportType) => { reset(); setHistoryPage(1); setType(next); };
  const changeFile = (next: File | null) => {
    revision.current += 1; setFile(next); setFileName(next?.name ?? ''); setPreview(null); setError(''); setNotice('');
    setUncertain(false); sessionStorage.removeItem(storageKey);
  };
  const download = (sample: boolean) => run('Downloading workbook', async () => {
    saveBlob(await productImportsApi.template(type, sample), `Product_${type}_${sample ? 'Sample' : 'Template'}.xlsx`);
  });
  const validate = () => {
    if (!file) { setError('Choose an .xlsx file first.'); return; }
    if (!file.name.toLowerCase().endsWith('.xlsx') || file.size > 5 * 1024 * 1024) { setError('Choose an .xlsx file up to 5 MB.'); return; }
    if ((type === 'onboarding' || type === 'products') && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(datasetId)) { setError('Enter a stable Dataset ID.'); return; }
    const current = revision.current;
    run('Validating workbook', async () => {
      const result = await productImportsApi.preview(type, datasetId, file);
      if (revision.current !== current) return;
      setPreview(result);
      sessionStorage.setItem(storageKey, JSON.stringify({ type, batchId: result.batchId, fileName: file.name, datasetId }));
      if (result.status === 'COMPLETED') { clearFile(); setNotice('This exact workbook was already confirmed. No duplicate records were created.'); }
      else setNotice('Preview only. No business records have changed.');
    });
  };
  const checkStatus = async (batch: ProductImportPreview, failedMessage = '') => {
    try {
      const result = await productImportsApi.get(batch.importType, batch.batchId);
      setPreview(result); setUncertain(false); setError(result.status === 'PREVIEW' ? failedMessage : '');
      if (result.status === 'COMPLETED') { clearFile(); setNotice('Import completed. Download the results below.'); }
      else setNotice('The batch is still a preview. Review it before confirming again.');
    } catch (problem) {
      setUncertain(true); setError(`Could not verify batch status: ${problem instanceof Error ? problem.message : 'Request failed'}. Check status before retrying.`);
    }
  };
  const confirm = () => {
    if (!preview || preview.status !== 'PREVIEW' || preview.counts.error || !eligible || lock.current || uncertain) return;
    const batch = preview;
    setDialog(null); lock.current = true; setBusy('Importing records'); setError(''); setNotice('');
    productImportsApi.confirm(type, batch.batchId).then((result) => {
      setPreview(result); setUncertain(false); clearFile(); setNotice('Import completed. Download results before starting a new import.');
    }).catch(async (problem) => {
      const message = problem instanceof Error ? problem.message : 'Request failed';
      if (problem && typeof problem === 'object' && 'status' in problem && typeof problem.status === 'number') {
        setError(`Import was not confirmed: ${message}`);
        return;
      }
      const interrupted = `Confirmation response was interrupted: ${message}. Check batch status before retrying.`;
      setError(interrupted);
      await checkStatus(batch, interrupted);
    }).finally(() => { lock.current = false; setBusy(''); });
  };
  const downloadResults = () => {
    if (!preview || preview.status !== 'COMPLETED') return;
    run('Downloading results', async () => saveBlob(await productImportsApi.results(type, preview.batchId), `Product_${type}_Results_${preview.batchId}.xlsx`));
  };
  const downloadValidation = () => {
    if (!preview || preview.status !== 'PREVIEW') return;
    run('Downloading validation report', async () => saveBlob(await productImportsApi.validationReport(type, preview.batchId),
      `Product_${type}_Validation_${preview.batchId}.xlsx`));
  };
  const stage = preview?.status === 'COMPLETED' ? 4 : busy.startsWith('Importing') || dialog === 'confirm' ? 3 : preview ? 2 : 1;

  return <div className="reference-imports-page">
    <div className="page-head"><div><h1>Product Bulk Import</h1><p>Onboard complete products or maintain one product relationship at a time through Excel.</p></div></div>
    <ol className="reference-imports-stages" aria-label="Import stages">{['Upload', 'Validate & Preview', 'Confirm', 'Results'].map((label, index) => <li key={label} className={stage >= index + 1 ? 'active' : ''}>{index + 1}. {label}</li>)}</ol>
    <div className="card reference-imports-workspace">
      <div className="reference-imports-top"><h2>Upload</h2><button className="btn btn-secondary" type="button" disabled={!!busy} onClick={() => preview?.status === 'COMPLETED' ? setDialog('clear') : reset()}>Clear All</button></div>
      <label className="reference-imports-label" htmlFor="product-import-type">Import option</label>
      <select id="product-import-type" className="control" disabled={!!busy} value={type} onChange={(event) => changeType(event.target.value as ProductImportType)}>
        {types.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}
      </select>
      {(type === 'onboarding' || type === 'products') && <><label className="reference-imports-label" htmlFor="product-import-dataset">Dataset ID</label><input id="product-import-dataset" className="control" value={datasetId} disabled={!!busy || !!preview} onChange={(event) => setDatasetId(event.target.value)} placeholder="e.g. opening-catalog-2026" /><p className="reference-imports-help">Reuse this ID for the same source dataset. ProductImportKey maps to a generated SKU within this scope.</p></>}
      <div className="reference-imports-actions"><button className="btn btn-secondary" type="button" disabled={!!busy} onClick={() => download(false)}>Download Blank Template</button><button className="btn btn-secondary" type="button" disabled={!!busy} onClick={() => download(true)}>Download Sample Excel</button></div>
      <label className="reference-imports-label" htmlFor="product-import-file">Upload Excel (.xlsx, up to 5 MB)</label>
      <input ref={input} id="product-import-file" className="control" type="file" accept=".xlsx" disabled={!canImport || !!busy} onChange={(event) => changeFile(event.target.files?.[0] ?? null)} />
      {file && <div className="reference-imports-file"><span><strong>{file.name}</strong> · {(file.size / 1024).toFixed(1)} KB</span><button className="btn btn-secondary" type="button" disabled={!!busy} onClick={() => { clearFile(); changeFile(null); }}>Remove file</button></div>}
      {!canImport && <p className="error-text">{type === 'products' ? 'Product Create and Update' : type === 'onboarding' ? 'Product Create' : 'Product Update'} permission is required to preview and confirm this import.</p>}
      <div className="reference-imports-actions"><button className="btn btn-primary" type="button" disabled={!canImport || !file || !!busy} onClick={validate}>Validate and Preview</button></div>
      {busy && <p className="reference-imports-status" role="status"><span className="reference-imports-spinner" aria-hidden="true" />{busy}</p>}
      {error && <div className="error-box" role="alert">{error}</div>}
      {notice && <div className="reference-imports-notice" role="status">{notice}</div>}
      {uncertain && preview && <button className="btn btn-secondary" type="button" disabled={!!busy} onClick={() => run('Checking batch status', () => checkStatus(preview))}>Check Batch Status</button>}
    </div>
    {preview && <div className="card reference-imports-preview">
      <div className="reference-imports-top"><div><h2>{preview.status === 'COMPLETED' ? 'Import Completed' : 'Validation Preview'}</h2><p>{preview.status === 'PREVIEW' ? 'No business records have changed. All rows must be valid before the batch can be confirmed.' : 'The batch was committed. Review or download every row outcome.'}</p></div>{preview.status === 'COMPLETED' ? <button className="btn btn-secondary" type="button" disabled={!!busy} onClick={downloadResults}>Download Results</button> : <button className="btn btn-secondary" type="button" disabled={!!busy} onClick={downloadValidation}>Download Validation Report</button>}</div>
      <div className="reference-imports-counts" role="status"><span><strong>{preview.counts.create}</strong> Create</span><span><strong>{preview.counts.update}</strong> Update</span><span><strong>{preview.counts.revise}</strong> Revise</span><span><strong>{preview.counts.end}</strong> End</span><span><strong>{preview.counts.skip}</strong> Skip</span><span><strong>{preview.counts.error}</strong> Errors</span></div>
      {type === 'onboarding' && <div className="table-wrap"><table className="table"><thead><tr><th>ProductImportKey</th><th>Product / SKU</th><th>Category / Brand / Base Unit</th><th>Units</th><th>Identifiers</th><th>Prices / Discounts</th><th>Suppliers / Costs</th><th>Locations / Attributes</th><th>Validation</th></tr></thead><tbody>{onboardingRows.map((row) => <tr key={row.rowNumber}><td>{row.values.ProductImportKey}</td><td>{row.values.ProductName}<small>{row.sku || 'SKU generated on confirmation'}</small></td><td>{row.values.CategoryCode || '—'} / {row.values.BrandCode || '—'} / {row.values.BaseUnitCode || '—'}</td><td>{countFor(row.values.ProductImportKey, 'product-units')}</td><td>{countFor(row.values.ProductImportKey, 'identifiers')}</td><td>{countFor(row.values.ProductImportKey, 'selling-prices')} / {countFor(row.values.ProductImportKey, 'selling-discounts')}</td><td>{countFor(row.values.ProductImportKey, 'product-suppliers')} / {countFor(row.values.ProductImportKey, 'supplier-prices')}</td><td>{countFor(row.values.ProductImportKey, 'product-locations')} / {countFor(row.values.ProductImportKey, 'product-attributes')}</td><td>{row.status === 'ERROR' ? row.details : 'Ready'}</td></tr>)}</tbody></table></div>}
      {preview.status === 'PREVIEW' && <div className="reference-imports-confirm"><p>{preview.counts.error ? 'Correct all errors and upload a new workbook. This batch cannot be confirmed.' : 'The approved operations will be revalidated against current data before one atomic confirmation.'}</p><button className="btn btn-primary" type="button" disabled={!canImport || !eligible || !!preview.counts.error || !!busy || uncertain} onClick={() => setDialog('confirm')}>Review and Confirm Import</button></div>}
      {preview.status === 'COMPLETED' && <div className="reference-imports-actions"><button className="btn btn-secondary" type="button" disabled={!!busy} onClick={() => setDialog('clear')}>Start New Import</button></div>}
      <div className="table-wrap"><table className="table"><thead><tr><th>Sheet / Row</th><th>ProductImportKey / SKU</th><th>Context</th><th>Operation</th><th>Status</th><th>Old</th><th>New</th><th>Old End</th><th>New Start</th><th>Details / Reason</th></tr></thead><tbody>
        {preview.rows.map((row) => <tr key={`${row.sheet}:${row.rowNumber}`}><td>{row.sheet} / {row.rowNumber}</td><td>{row.values.ProductImportKey || row.sku || row.values.SKU || 'Generated on confirm'}</td><td>{[row.values.PriceListCode, row.values.SupplierCode, row.values.UnitCode, row.values.CurrencyCode, row.values.MinimumQuantity ? `tier ${row.values.MinimumQuantity}` : ''].filter(Boolean).join(' · ') || '—'}</td><td>{row.action}</td><td>{row.status}</td><td>{row.oldValue || '—'}</td><td>{row.newValue || '—'}</td><td>{row.oldEnd || '—'}</td><td>{row.newStart || '—'}</td><td>{row.details}</td></tr>)}
      </tbody></table></div>
    </div>}
    <div className="card reference-imports-preview"><div className="reference-imports-top"><h2>Import History</h2><p>{history.totalCount} batches for this option</p></div><label className="reference-imports-label" htmlFor="product-import-history-size">Records per page</label><select id="product-import-history-size" className="control" value={historyLimit} onChange={(event) => { setHistoryLimit(Number(event.target.value) as 20 | 50 | 100); setHistoryPage(1); }}>{[20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select><div className="table-wrap"><table className="table"><thead><tr><th>Batch</th><th>Dataset</th><th>Created</th><th>Status</th><th>Actions</th></tr></thead><tbody>{history.items.map((row) => <tr key={row.batchId}><td>{row.batchId}</td><td>{row.datasetId}</td><td>{new Date(row.createdAt).toLocaleString()}</td><td>{row.status}</td><td><button className="btn btn-secondary" type="button" disabled={!!busy} onClick={() => run('Loading batch', async () => { const result = await productImportsApi.get(type, row.batchId); setPreview(result); setDatasetId(result.datasetId); sessionStorage.setItem(storageKey, JSON.stringify({ type, batchId: result.batchId, fileName: '', datasetId: result.datasetId })); })}>View</button></td></tr>)}</tbody></table></div><div className="reference-imports-actions"><button className="btn btn-secondary" type="button" disabled={historyPage <= 1 || !!busy} onClick={() => setHistoryPage((page) => page - 1)}>Previous</button><span role="status">Page {history.page} of {history.totalPages} · {history.totalCount} total batches</span><button className="btn btn-secondary" type="button" disabled={historyPage >= history.totalPages || !!busy} onClick={() => setHistoryPage((page) => page + 1)}>Next</button></div></div>
    <Modal open={dialog === 'confirm'} title="Confirm product import?" onClose={() => !busy && setDialog(null)}><div className="reference-imports-dialog"><p><strong>Option:</strong> {types.find((item) => item.key === type)?.label}</p><p><strong>File:</strong> {fileName}</p><p><strong>Operations:</strong> {eligible} · <strong>Errors:</strong> {preview?.counts.error ?? 0}</p><p>All approved rows commit together. A validation conflict rolls back the entire batch.</p><div className="reference-imports-actions"><button className="btn btn-secondary" type="button" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-primary" type="button" disabled={!!busy} onClick={confirm}>Confirm Import</button></div></div></Modal>
    <Modal open={dialog === 'clear'} title="Clear this import view?" onClose={() => setDialog(null)}><div className="reference-imports-dialog"><p>Completed results remain in Import History. Download a copy if needed.</p><div className="reference-imports-actions"><button className="btn btn-secondary" type="button" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-primary" type="button" onClick={reset}>Clear All</button></div></div></Modal>
  </div>;
}
