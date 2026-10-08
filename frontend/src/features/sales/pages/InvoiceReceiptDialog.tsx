import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthContext';
import { invoicesApi } from '../api/invoicesApi';
import { posPrintStatusApi } from '../api/posPrintStatusApi';
import { InvoiceReceiptContent } from './InvoiceReceiptContent';
import { downloadInvoiceReceipt } from './invoiceReceiptPdf';
import './invoice-receipt.css';

export function InvoiceReceiptDialog({ invoiceId, onClose, onDetails }: { invoiceId: number; onClose: () => void; onDetails: () => void }) {
  const { tenant, tenantUser, role, accessScope, assignedLocations } = useAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const [reprintError, setReprintError] = useState('');
  const [printPending, setPrintPending] = useState(false);
  const printLock = useRef(false);
  const invoice = useQuery({
    queryKey: ['invoice', invoiceId, tenant?.tenantId, tenantUser?.userId, role?.roleId, accessScope, assignedLocations.map((location) => location.locationId)],
    queryFn: () => invoicesApi.get(invoiceId),
  });
  const printStatus = useQuery({
    queryKey: ['pos-print-status', 'SALE', invoiceId],
    queryFn: () => posPrintStatusApi.get('SALE', invoiceId),
    refetchInterval: (query) => ['PENDING', 'CLAIMED'].includes(query.state.data?.status ?? '') ? 3000 : false,
  });
  useEffect(() => { dialog.current?.showModal(); }, []);
  return createPortal(<dialog className="original-bill-dialog" ref={dialog} aria-labelledby="original-bill-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="modal-head"><div><h2 id="original-bill-title">Sale Receipt Copy</h2><p>{invoice.data?.billNo == null ? 'Legacy sale' : `Bill No ${String(invoice.data.billNo).padStart(4, '0')}`}</p></div><button className="icon-btn" aria-label="Close invoice receipt" onClick={onClose}>×</button></div>
    {invoice.isPending ? <p className="original-bill-message">Loading bill...</p> : invoice.isError ? <div className="error-box" role="alert">{invoice.error.message}<button className="btn btn-secondary" onClick={() => void invoice.refetch()}>Retry</button></div> : <>
      {!invoice.data.receiptSnapshot && <p className="original-bill-message">This older bill is recreated from saved invoice records. An original receipt copy was not stored.</p>}
      <InvoiceReceiptContent invoice={invoice.data} copy />
      {printStatus.data && printStatus.data.status !== 'NOT_REQUESTED' && <p className="original-bill-message" role="status">Printer: {printStatus.data.status === 'PRINTED' ? 'Sent to printer.' : printStatus.data.status === 'FAILED' ? `Print failed: ${printStatus.data.lastError ?? 'Check the printer.'}` : 'Sending to printer...'}</p>}
    </>}
    {reprintError && <div className="error-box">{reprintError}</div>}
    <div className="modal-foot receipt-actions"><button className="btn btn-secondary" onClick={onDetails}>Invoice Details</button><button className="btn btn-secondary" disabled={!invoice.data?.receiptSnapshot || invoice.isError || printPending} onClick={async () => { if (printLock.current) return; printLock.current = true; setPrintPending(true); try { await posPrintStatusApi.print('SALE', invoiceId); setReprintError(''); await printStatus.refetch(); } catch (error) { setReprintError(error instanceof Error ? error.message : 'Print request failed.'); } finally { printLock.current = false; setPrintPending(false); } }}>{printPending ? 'Sending to printer...' : 'Print'}</button><button className="btn btn-primary" disabled={!invoice.data?.receiptSnapshot || invoice.isError} onClick={async () => { try { await invoicesApi.reprint(invoiceId); setReprintError(''); downloadInvoiceReceipt(invoice.data, true); } catch (error) { setReprintError(error instanceof Error ? error.message : 'Download failed.'); } }}>Download Copy PDF</button></div>
  </dialog>, document.body);
}
