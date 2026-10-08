import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
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
  const { permissions } = useAuth();
  const available = masters.filter((item) => permissions.includes(item.view));
  const [master, setMaster] = useState<ImportMaster>(available[0]?.key ?? 'categories');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const selected = masters.find((item) => item.key === master)!;
  const canCreate = permissions.includes(selected.create);
  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(label); setError('');
    try { await work(); }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'Request failed. Please try again.'); }
    finally { setBusy(''); }
  };
  const changeMaster = (value: ImportMaster) => { setMaster(value); setFile(null); setPreview(null); setError(''); };
  const download = (sample: boolean) => run('Downloading', async () => saveBlob(await referenceImportsApi.template(master, sample), `${selected.filename}_${sample ? 'Sample' : 'Template'}.xlsx`));
  const validate = () => {
    if (!file) { setError('Choose an .xlsx file first.'); return; }
    if (!file.name.toLowerCase().endsWith('.xlsx')) { setError('Choose an .xlsx file.'); return; }
    run('Validating', async () => setPreview(await referenceImportsApi.preview(master, file)));
  };
  const confirm = () => {
    if (!preview || preview.status === 'COMPLETED') return;
    run('Importing', async () => setPreview(await referenceImportsApi.confirm(master, preview.batchId)));
  };
  const downloadResults = () => {
    if (!preview) return;
    run('Downloading', async () => saveBlob(await referenceImportsApi.results(master, preview.batchId), `${selected.filename}_Results_${preview.batchId}.xlsx`));
  };
  return <div className="reference-imports-page">
    <div className="page-head"><div><h1>Bulk Data Import</h1><p>Download a template, upload and validate your Excel file, then confirm the records to create.</p></div></div>
    <div className="card reference-imports-workspace">
      <label className="reference-imports-label" htmlFor="import-master">Reference master</label>
      <select id="import-master" className="control" value={master} disabled={!!busy} onChange={(event) => changeMaster(event.target.value as ImportMaster)}>
        {available.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}
      </select>
      <div className="reference-imports-actions">
        <button className="btn btn-secondary" type="button" disabled={!!busy} onClick={() => download(false)}>Download Blank Template</button>
        <button className="btn btn-secondary" type="button" disabled={!!busy} onClick={() => download(true)}>Download Sample Excel</button>
      </div>
      <label className="reference-imports-label" htmlFor="import-file">Upload Excel (.xlsx, up to 5 MB and 1,000 rows)</label>
      <input id="import-file" className="control" type="file" accept=".xlsx" disabled={!canCreate || !!busy} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setError(''); }} />
      {!canCreate && <p className="error-text">Create permission is required to validate and import this master.</p>}
      <div className="reference-imports-actions">
        <button className="btn btn-primary" type="button" disabled={!canCreate || !file || !!busy} onClick={validate}>Validate and Preview</button>
        {preview && <button className="btn btn-primary" type="button" disabled={!canCreate || !!busy || preview.status === 'COMPLETED'} onClick={confirm}>Confirm Import</button>}
        {preview?.status === 'COMPLETED' && <button className="btn btn-secondary" type="button" disabled={!!busy} onClick={downloadResults}>Download Results</button>}
      </div>
      {busy && <p role="status">{busy}…</p>}
      {error && <div className="error-box" role="alert">{error}</div>}
    </div>
    {preview && <div className="card reference-imports-preview">
      <h2>{preview.status === 'COMPLETED' ? 'Import results' : 'Validation preview'}</h2>
      <p role="status">{preview.counts.create} to create · {preview.counts.skip} skipped · {preview.counts.error} errors. {preview.status === 'PREVIEW' ? 'Rows with errors will not be imported.' : 'Confirmation is complete.'}</p>
      <div className="table-wrap"><table className="table"><thead><tr><th>Excel row</th><th>Action</th><th>Code</th><th>Record</th><th>Details</th></tr></thead><tbody>
        {preview.rows.map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.action}</td><td>{row.code || (row.action === 'CREATE' && master === 'suppliers' ? 'Generated on import' : '—')}</td><td>{String(row.values.categoryName ?? row.values.brandName ?? row.values.supplierName ?? row.values.name ?? '')}</td><td>{row.errors.join('; ') || '—'}</td></tr>)}
      </tbody></table></div>
    </div>}
  </div>;
}
