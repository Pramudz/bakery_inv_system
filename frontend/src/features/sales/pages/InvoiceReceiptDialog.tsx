import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthContext';
import { invoicesApi } from '../api/invoicesApi';
import { InvoiceReceiptContent } from './InvoiceReceiptContent';
import { downloadInvoiceReceipt } from './invoiceReceiptPdf';
import './invoice-receipt.css';

export function InvoiceReceiptDialog({ invoiceId, onClose, onDetails }: { invoiceId: number; onClose: () => void; onDetails: () => void }) {
  const { tenant, tenantUser, role, accessScope, assignedLocations } = useAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const invoice = useQuery({
    queryKey: ['invoice', invoiceId, tenant?.tenantId, tenantUser?.userId, role?.roleId, accessScope, assignedLocations.map((location) => location.locationId)],
    queryFn: () => invoicesApi.get(invoiceId),
  });
  useEffect(() => { dialog.current?.showModal(); }, []);
  return createPortal(<dialog className="original-bill-dialog" ref={dialog} aria-labelledby="original-bill-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="modal-head"><div><h2 id="original-bill-title">Sales Invoice</h2><p>{invoice.data?.invoiceNumber}</p></div><button className="icon-btn" aria-label="Close invoice receipt" onClick={onClose}>×</button></div>
    {invoice.isPending ? <p className="original-bill-message">Loading bill...</p> : invoice.isError ? <div className="error-box" role="alert">{invoice.error.message}<button className="btn btn-secondary" onClick={() => void invoice.refetch()}>Retry</button></div> : <>
      {!invoice.data.receiptSnapshot && <p className="original-bill-message">This older bill is recreated from saved invoice records. An original receipt copy was not stored.</p>}
      <InvoiceReceiptContent invoice={invoice.data} />
    </>}
    <div className="modal-foot receipt-actions"><button className="btn btn-secondary" onClick={onDetails}>Invoice Details</button><button className="btn btn-secondary" disabled={!invoice.data || invoice.isError} onClick={() => window.print()}>Print Receipt</button><button className="btn btn-primary" disabled={!invoice.data || invoice.isError} onClick={() => downloadInvoiceReceipt(invoice.data)}>Download PDF</button></div>
  </dialog>, document.body);
}
