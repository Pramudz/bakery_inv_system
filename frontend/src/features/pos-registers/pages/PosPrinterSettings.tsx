import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { posRegistersApi } from '../api/posRegistersApi';
import { posPrintApi, PrintProfile } from '../api/posPrintApi';

const empty = (locationId: number): Omit<PrintProfile, 'posPrintProfileId'> => ({ locationId, posTerminalId: null, displayName: 'Receipt printer', transport: 'TCP', target: '', port: 9100, paperWidth: 80, encoding: 'CP437', cutEnabled: true, isActive: true });

export function PosPrinterSettings({ locationId }: { locationId: number }) {
  const client = useQueryClient();
  const [terminalId, setTerminalId] = useState<number | null>(null);
  const [form, setForm] = useState(empty(locationId));
  const [agentToken, setAgentToken] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const profiles = useQuery({ queryKey: ['pos-print-profiles', locationId], queryFn: () => posPrintApi.profiles(locationId), enabled: locationId > 0 });
  const receiptReadiness = useQuery({ queryKey: ['pos-receipt-readiness', locationId], queryFn: () => posPrintApi.receiptReadiness(locationId), enabled: locationId > 0 });
  const terminals = useQuery({ queryKey: ['pos-print-terminals', locationId], queryFn: () => posRegistersApi.terminals({ locationId, limit: 100 }), enabled: locationId > 0 });
  const jobs = useQuery({ queryKey: ['pos-print-jobs', locationId], queryFn: () => posPrintApi.jobs(locationId), enabled: locationId > 0, refetchInterval: 10000 });
  const selected = profiles.data?.find((profile) => Number(profile.posTerminalId ?? 0) === Number(terminalId ?? 0));
  useEffect(() => { setForm(selected ? { ...selected, locationId, posTerminalId: terminalId } : { ...empty(locationId), posTerminalId: terminalId }); setAgentToken(null); }, [locationId, terminalId, selected?.posPrintProfileId, profiles.dataUpdatedAt]);
  const refresh = () => { void client.invalidateQueries({ queryKey: ['pos-print-profiles', locationId] }); void client.invalidateQueries({ queryKey: ['pos-print-jobs', locationId] }); };
  const save = useMutation({ mutationFn: () => posPrintApi.configure(form), onSuccess: (result) => { setAgentToken(result.agentToken); setMessage('Printer profile saved.'); refresh(); } });
  const test = useMutation({ mutationFn: () => posPrintApi.test(selected!.posPrintProfileId), onSuccess: (job) => { setMessage(`Test print queued as job ${job.posPrintJobId}.`); refresh(); } });
  const rotate = useMutation({ mutationFn: () => posPrintApi.rotateToken(selected!.posPrintProfileId), onSuccess: (result) => { setAgentToken(result.agentToken); setMessage('Agent token rotated. Update the workstation configuration.'); } });
  const retry = useMutation({ mutationFn: (id: number) => posPrintApi.retry(id), onSuccess: refresh });
  if (!locationId) return null;
  return <section className="card"><div className="sales-card-head"><div><h2>Receipt printer</h2><p>Configure the local print agent for this location or one terminal. The cashier can still use browser print.</p></div></div>
    {receiptReadiness.data && <div className={receiptReadiness.data.warnings.length ? 'error-box' : 'success-box'}><strong>Receipt header: {receiptReadiness.data.companyName} / {receiptReadiness.data.locationName}</strong><p>{receiptReadiness.data.address.join(', ') || receiptReadiness.data.warnings.join(' ')}</p></div>}
    <div className="toolbar"><label className="field"><span>Assignment</span><select className="control" value={terminalId ?? ''} onChange={(event) => setTerminalId(event.target.value ? Number(event.target.value) : null)}><option value="">Location default</option>{(terminals.data?.items ?? []).map((terminal) => <option key={terminal.posTerminalId} value={terminal.posTerminalId}>{terminal.terminalCode} · {terminal.displayName}</option>)}</select></label>
      <label className="field"><span>Display name</span><input className="control" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })}/></label>
      <label className="field"><span>Connection</span><select className="control" value={form.transport} onChange={(event) => setForm({ ...form, transport: event.target.value as PrintProfile['transport'], target: '', port: event.target.value === 'TCP' ? 9100 : null })}><option value="TCP">Wi-Fi / Ethernet ESC/POS TCP</option><option value="WINDOWS_QUEUE">Windows USB/OS printer queue</option></select></label>
      <label className="field"><span>{form.transport === 'TCP' ? 'Private printer IP' : 'Windows queue name'}</span><input className="control" value={form.target} onChange={(event) => setForm({ ...form, target: event.target.value })} placeholder={form.transport === 'TCP' ? '192.168.1.50' : 'EPSON TM-T20'}/></label>
      {form.transport === 'TCP' && <label className="field"><span>TCP port</span><input className="control" type="number" min="1" max="65535" value={form.port ?? 9100} onChange={(event) => setForm({ ...form, port: Number(event.target.value) })}/></label>}
      <label className="field"><span>Paper width</span><select className="control" value={form.paperWidth} onChange={(event) => setForm({ ...form, paperWidth: Number(event.target.value) as 58 | 80 })}><option value="58">58 mm</option><option value="80">80 mm</option></select></label>
      <label className="field"><span>Encoding</span><select className="control" value={form.encoding} onChange={(event) => setForm({ ...form, encoding: event.target.value as PrintProfile['encoding'] })}><option value="CP437">CP437</option><option value="CP850">CP850</option><option value="UTF8">UTF-8 (supported printers only)</option></select></label>
      <label className="check"><input type="checkbox" checked={form.cutEnabled} onChange={(event) => setForm({ ...form, cutEnabled: event.target.checked })}/> Cut paper</label>
      <label className="check"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })}/> Active</label>
      <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Save printer</button>
      <button className="btn btn-secondary" disabled={!selected || test.isPending} onClick={() => test.mutate()}>Test print</button>
      <button className="btn btn-secondary" disabled={!selected || rotate.isPending} onClick={() => rotate.mutate()}>Rotate agent token</button>
    </div>
    {agentToken && <div className="success-box"><strong>One-time agent token</strong><p>Copy this into the workstation agent configuration now. It will not be shown again.</p><code style={{ overflowWrap: 'anywhere' }}>{agentToken}</code></div>}
    {message && <div className="success-box">{message}</div>}{(profiles.error || save.error || test.error || rotate.error || retry.error) && <div className="error-box">{profiles.error?.message ?? save.error?.message ?? test.error?.message ?? rotate.error?.message ?? retry.error?.message}</div>}
    <h3>Recent print jobs</h3><div className="table-scroll"><table className="table"><thead><tr><th>Job</th><th>Document</th><th>Status</th><th>Attempts</th><th>Error</th><th></th></tr></thead><tbody>{(jobs.data ?? []).map((job) => <tr key={job.posPrintJobId}><td>{job.posPrintJobId}</td><td>{job.documentType}</td><td>{job.status}{job.status === 'CLAIMED' ? ' (check printer if stalled)' : ''}</td><td>{job.attempts}</td><td>{job.lastError}</td><td><button className="btn btn-secondary" disabled={retry.isPending || job.status === 'PENDING'} onClick={() => retry.mutate(job.posPrintJobId)}>Retry / reprint</button></td></tr>)}</tbody></table></div>
  </section>;
}
