import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { invoiceAdjustmentsApi } from '../api/invoiceAdjustmentsApi';
import { invoiceRefundsApi } from '../api/invoiceRefundsApi';
import { invoicesApi } from '../api/invoicesApi';
import { paymentMethodsApi } from '../api/paymentMethodsApi';
import { paymentChannelsApi } from '../api/paymentChannelsApi';
import { SalesBadge } from './SalesUi';
import './sales-history.css';

type CorrectionMode = 'ITEM' | 'DISCOUNT';
const money = (value: unknown) => Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]!);

export function RefundsPage() {
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [lookup, setLookup] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<CorrectionMode>('ITEM');
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [stockReturns, setStockReturns] = useState<Record<number, boolean>>({});
  const [selectedLineId, setSelectedLineId] = useState<number | null>(null);
  const [correctedPercentage, setCorrectedPercentage] = useState('');
  const [correctedAmount, setCorrectedAmount] = useState('');
  const [reason, setReason] = useState('Incorrect billing');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [settlementAmount, setSettlementAmount] = useState('');
  const [paymentChannelId, setPaymentChannelId] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [message, setMessage] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [historyMode, setHistoryMode] = useState<'REFUNDS' | 'ADJUSTMENTS'>('REFUNDS');

  const invoices = useQuery({ queryKey: ['invoices'], queryFn: invoicesApi.list });
  const invoice = useQuery({ queryKey: ['refundable-invoice', selectedId], queryFn: () => invoicesApi.refundable(selectedId!), enabled: selectedId !== null });
  const methods = useQuery({ queryKey: ['payment-methods'], queryFn: paymentMethodsApi.list });
  const channels = useQuery({ queryKey: ['payment-channels', 'active'], queryFn: () => paymentChannelsApi.list(true) });
  const refunds = useQuery({ queryKey: ['invoice-refunds'], queryFn: invoiceRefundsApi.list });
  const adjustments = useQuery({ queryKey: ['invoice-adjustments'], queryFn: invoiceAdjustmentsApi.list });
  const historyQuery = historyMode === 'REFUNDS' ? refunds : adjustments;
  const total = historyQuery.data?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * limit;
  const pagedRefunds = (refunds.data ?? []).slice(start, start + limit);
  const pagedAdjustments = (adjustments.data ?? []).slice(start, start + limit);
  const visiblePages = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages])]
    .filter((number) => number >= 1 && number <= totalPages)
    .sort((a, b) => a - b);


  useEffect(() => {
    const id = Number(params.get('invoiceId'));
    if (id > 0) setSelectedId(id);
  }, [params]);
  useEffect(() => {
    if (invoice.data) setLookup(invoice.data.invoiceNumber);
  }, [invoice.data]);
  useEffect(() => {
    if (!paymentMethodId) {
      const first = (methods.data ?? []).find((method) => method.isActive);
      if (first) setPaymentMethodId(String(first.paymentMethodId));
    }
  }, [methods.data, paymentMethodId]);

  const selectedLine = (invoice.data?.details ?? []).find((line: any) => line.invoiceDetailId === selectedLineId);
  const selectedMethod = (methods.data ?? []).find((method) => Number(method.paymentMethodId) === Number(paymentMethodId));
  const itemRefundTotal = useMemo(() => (invoice.data?.details ?? []).reduce((sum: number, line: any) => {
    const ratio = (quantities[line.invoiceDetailId] ?? 0) / Number(line.quantity);
    const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
    return round(sum + round(Number(line.grossTotal) * ratio) - round(Number(line.discountAmount) * ratio));
  }, 0), [invoice.data, quantities]);
  const remainingLines = (invoice.data?.details ?? []).filter((line: any) => Number(line.refundableQuantity) > 0);
  const fullRefund = mode === 'ITEM' && remainingLines.length > 0 && remainingLines.every((line: any) => quantities[line.invoiceDetailId] === Number(line.refundableQuantity));
  const selectedQuantity = Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0);
  const selectFullRefund = () => {
    if (remainingLines.some((line: any) => !Number.isInteger(Number(line.refundableQuantity)))) {
      setMessage('This invoice contains fractional quantities and cannot be fully refunded using whole-number quantities.');
      return;
    }
    resetWork();
    setMode('ITEM');
    setReason('Customer return');
    setQuantities(Object.fromEntries(remainingLines.map((line: any) => [line.invoiceDetailId, Number(line.refundableQuantity)])));
  };
  const originalDiscount = Number(selectedLine?.discountAmount ?? 0);
  const correctedDiscount = Number(correctedAmount || 0);
  const adjustmentTotal = selectedLine ? Math.abs(correctedDiscount - originalDiscount) : 0;
  const correctionTotal = mode === 'ITEM' ? itemRefundTotal : adjustmentTotal;
  const adjustmentType = correctedDiscount >= originalDiscount ? 'Customer refund' : 'Additional payment';

  const settlementLimit = mode === 'ITEM' ? Math.min(correctionTotal, Number(invoice.data?.refundablePaymentAmount ?? 0)) : correctionTotal;
  useEffect(() => setSettlementAmount(settlementLimit > 0 ? settlementLimit.toFixed(2) : '0'), [settlementLimit]);

  const resetWork = () => {
    setQuantities({}); setStockReturns({}); setSelectedLineId(null); setCorrectedPercentage(''); setCorrectedAmount(''); setMessage('');
  };
  const loadInvoice = () => {
    const value = lookup.trim().toLowerCase();
    const match = (invoices.data ?? []).find((row) => String(row.invoiceId) === value || row.invoiceNumber.toLowerCase() === value);
    if (!match) { setMessage('Invoice was not found. Enter the complete invoice number.'); return; }
    if (match.invoiceStatus === 'FULLY_REFUNDED') { setMessage('This invoice is already fully refunded.'); return; }
    setSelectedId(match.invoiceId); setMessage(''); resetWork();
  };
  const selectDiscountLine = (line: any) => {
    setSelectedLineId(line.invoiceDetailId);
    setCorrectedPercentage(String(Number(line.discountPercentage)));
    setCorrectedAmount(Number(line.discountAmount).toFixed(2));
  };
  const changeDiscountPercentage = (value: string) => {
    setCorrectedPercentage(value);
    setCorrectedAmount(selectedLine ? (Number(selectedLine.grossTotal) * Number(value || 0) / 100).toFixed(2) : '');
  };
  const changeDiscountAmount = (value: string) => {
    setCorrectedAmount(value);
    setCorrectedPercentage(selectedLine && Number(selectedLine.grossTotal) > 0 ? (Number(value || 0) / Number(selectedLine.grossTotal) * 100).toFixed(4) : '0');
  };

  const createRefund = useMutation({
    mutationFn: () => invoiceRefundsApi.create({
      invoiceId: selectedId!, reason,
      details: (invoice.data?.details ?? []).filter((line: any) => (quantities[line.invoiceDetailId] ?? 0) > 0).map((line: any) => ({ invoiceDetailId: line.invoiceDetailId, quantity: quantities[line.invoiceDetailId], returnToStock: stockReturns[line.invoiceDetailId] !== false })),
      payments: paymentMethodId && Number(settlementAmount) > 0 ? [{ paymentMethodId: Number(paymentMethodId), amount: Number(settlementAmount), paymentChannelId: paymentChannelId ? Number(paymentChannelId) : undefined, referenceNumber: paymentReference.trim() || undefined }] : [],
    }),
    onSuccess: (result) => { resetWork(); setMessage(`Refund ${result.refundNumber} completed successfully.`); refreshData(); },
  });
  const createAdjustment = useMutation({
    mutationFn: () => invoiceAdjustmentsApi.create({ invoiceId: selectedId, invoiceDetailId: selectedLineId, reason, correctedDiscountAmount: Number(correctedAmount), paymentMethodId: paymentMethodId ? Number(paymentMethodId) : undefined }),
    onSuccess: (result) => { resetWork(); setMessage(`Discount correction ${result.adjustmentNumber} saved successfully.`); refreshData(); },
  });
  const refreshData = () => {
    queryClient.invalidateQueries({ queryKey: ['invoices'] }); queryClient.invalidateQueries({ queryKey: ['refundable-invoice', selectedId] }); queryClient.invalidateQueries({ queryKey: ['invoice-refunds'] }); queryClient.invalidateQueries({ queryKey: ['invoice-adjustments'] });
  };
  const submit = () => {
    if (pending) return;
    if (mode === 'ITEM') {
      const payout = paymentMethodId ? Number(settlementAmount) : 0;
      if (!Number.isFinite(payout) || payout < 0 || payout > settlementLimit) {
        setMessage(`Settlement must be between 0 and LKR ${money(settlementLimit)}.`);
        return;
      }
      if (fullRefund && !window.confirm(`Fully refund all remaining items on ${invoice.data?.invoiceNumber}?\nItem refund total: LKR ${money(correctionTotal)}\nMoney returned now: LKR ${money(payout)}\nStock will be restored only for checked Return Stock items.`)) return;
      createRefund.mutate();
    } else createAdjustment.mutate();
  };
  const pending = createRefund.isPending || createAdjustment.isPending;
  const error = createRefund.error || createAdjustment.error;
  const receiptHtml = (documentType: 'REFUND' | 'ADJUSTMENT', record: any) => {
    const isRefund = documentType === 'REFUND';
    const number = isRefund ? record.refundNumber : record.adjustmentNumber;
    const date = isRefund ? record.refundDate : record.adjustmentDate;
    const total = isRefund ? record.refundTotal : record.adjustmentAmount;
    const rows = isRefund ? (record.details ?? []).map((detail: any) => `<div class="item"><div class="identity"><b>${escapeHtml(detail.product?.sku)}</b><strong>${escapeHtml(detail.product?.productName)}</strong></div><div class="values"><span>${escapeHtml(Number(detail.quantity).toFixed(3))}</span><span>${escapeHtml(money(detail.unitPrice))}</span><span>${escapeHtml(money(detail.discountAmount))}</span><b>${escapeHtml(money(detail.refundAmount))}</b></div></div>`).join('') : `<div class="item"><div class="identity"><b>${escapeHtml(record.invoiceDetail?.product?.sku)}</b><strong>${escapeHtml(record.invoiceDetail?.product?.productName)}</strong></div><div class="adjustment"><span>Original discount</span><b>${escapeHtml(Number(record.originalDiscountPercentage))}% / ${escapeHtml(money(record.originalDiscountAmount))}</b><span>Corrected discount</span><b>${escapeHtml(Number(record.correctedDiscountPercentage))}% / ${escapeHtml(money(record.correctedDiscountAmount))}</b></div></div>`;
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(number)}</title><style>@page{size:80mm auto;margin:4mm}*{box-sizing:border-box}html,body{width:72mm;margin:0 auto;padding:0;background:#fff;color:#17243a;font-family:Arial,sans-serif;font-size:8px}.brand{text-align:center;padding:0 0 10px;border-bottom:1px dashed #aeb8c5}.brand h1{margin:0;font-family:Georgia,serif;font-size:17px;letter-spacing:.08em}.brand strong,.brand small{display:block}.brand strong{margin-top:4px}.brand small{margin-top:2px;color:#697586;font-size:7px}.brand h2{margin:10px 0 0;font-family:Georgia,serif;font-size:12px;letter-spacing:.08em}.meta{display:grid;grid-template-columns:1fr 1fr;gap:5px 12px;padding:10px 0;border-bottom:1px dashed #aeb8c5}.meta div{display:flex;justify-content:space-between;gap:6px}.meta span{color:#7a8595}.meta b{text-align:right}.head,.values{display:grid;grid-template-columns:36px 52px 50px 58px;gap:4px;text-align:right}.head{padding:7px 0;border-bottom:2px solid #586575;color:#667386;font-size:7px;font-weight:800;text-transform:uppercase}.identity{display:grid;grid-template-columns:52px 1fr;gap:5px;padding:7px 0 3px}.identity b{font-size:7px}.identity strong{font-size:8px}.values{padding:3px 0 7px;border-bottom:1px dotted #cbd2da}.adjustment{display:grid;grid-template-columns:1fr auto;gap:5px;padding:7px 0;border-bottom:1px dotted #cbd2da}.adjustment span{color:#7a8595}.summary{margin-top:8px;padding-top:8px;border-top:1px dashed #bfc8d4}.summary div{display:flex;justify-content:space-between;padding:4px 0}.summary .total{margin:4px 0;padding:8px 0;border-top:1px dashed #bfc8d4;border-bottom:1px dashed #bfc8d4;font-size:11px}.status{text-transform:uppercase}.thanks{text-align:center;margin-top:12px;padding:11px 4px;border-top:1px dashed #aeb8c5}.thanks strong,.thanks small{display:block}.thanks small{margin-top:3px;color:#7f8998;font-size:7px}.software{text-align:center;padding-top:8px;border-top:1px solid #e3e7ec;color:#8a94a2;font-size:7px}@media print{html,body{width:72mm}}</style></head><body><div class="brand"><h1>ERP CORE BAKERY</h1><strong>Main Bakery Outlet · Colombo, Sri Lanka</strong><small>Tel: 011 234 5678 · bakery@example.com</small><small>Fresh bakery products made daily</small><h2>${isRefund ? 'REFUND RECEIPT' : 'ADJUSTMENT RECEIPT'}</h2></div><div class="meta"><div><span>${isRefund ? 'Refund No' : 'Adjustment No'}</span><b>${escapeHtml(number)}</b></div><div><span>Date</span><b>${escapeHtml(new Date(date).toLocaleDateString())}</b></div><div><span>Original Bill</span><b>${escapeHtml(record.invoice?.invoiceNumber)}</b></div><div><span>Customer</span><b>${escapeHtml(record.invoice?.customer?.customerName ?? 'Walk-in')}</b></div><div><span>Reason</span><b>${escapeHtml(record.reason)}</b></div><div><span>Status</span><b class="status">${escapeHtml(record.status)}</b></div></div>${isRefund ? '<div class="head"><span>Qty</span><span>Rate</span><span>Discount</span><span>Amount</span></div>' : ''}${rows}<div class="summary"><div><span>Original Invoice</span><b>${escapeHtml(record.invoice?.invoiceNumber)}</b></div>${!isRefund ? `<div><span>Adjustment Type</span><b>${escapeHtml(record.adjustmentType)}</b></div>` : ''}<div class="total"><span>${isRefund ? 'Refund Total' : 'Adjustment Total'}</span><b>LKR ${escapeHtml(money(total))}</b></div></div><div class="thanks"><strong>Thank you for shopping with us!</strong><small>This receipt refers to the original invoice shown above.</small></div><div class="software">Software By: <b>Prosinc</b> · 07111111111</div></body></html>`;
  };
  const outputReceipt = async (documentType: 'REFUND' | 'ADJUSTMENT', row: any, printOnly: boolean) => {
    const record = documentType === 'REFUND' ? await invoiceRefundsApi.get(row.invoiceRefundId) : row;
    const isRefund = documentType === 'REFUND';
    const number = isRefund ? record.refundNumber : record.adjustmentNumber;
    const details = isRefund ? (record.details ?? []) : [record.invoiceDetail];
    const pageWidth = 226.77, pageHeight = 430 + details.length * 28;
    let y = pageHeight - 24;
    const commands: string[] = [];
    const escapePdf = (value: unknown) => String(value ?? '').replace(/[^\x20-\x7E]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    const text = (value: unknown, x: number, size = 6, bold = false, align: 'left' | 'center' | 'right' = 'left', color = '0 0 0') => {
      const safe = escapePdf(value), width = safe.length * size * 0.6;
      const drawX = align === 'center' ? (pageWidth - width) / 2 : align === 'right' ? x - width : x;
      commands.push(`${color} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf ${drawX.toFixed(2)} ${y.toFixed(2)} Td (${safe}) Tj ET`);
    };
    const rule = (strong = false) => commands.push(`${strong ? '0.8' : '0.35'} w [${strong ? '' : '2 2'}] 0 d 14 ${y.toFixed(2)} m 212 ${y.toFixed(2)} l S [] 0 d`);
    text('ERP CORE BAKERY', 0, 13, true, 'center'); y -= 15;
    text('Main Bakery Outlet - Colombo, Sri Lanka', 0, 5.5, true, 'center'); y -= 8;
    text('Tel: 011 234 5678 - bakery@example.com', 0, 5, false, 'center'); y -= 7;
    text('Fresh bakery products made daily', 0, 5, false, 'center'); y -= 15;
    text(isRefund ? 'REFUND RECEIPT' : 'ADJUSTMENT RECEIPT', 0, 10, true, 'center'); y -= 13; rule(); y -= 12;
    text(isRefund ? 'Refund No' : 'Adjustment No', 14, 5); text(number, 105, 5.5, true, 'right');
    text('Date', 119, 5); text(new Date(isRefund ? record.refundDate : record.adjustmentDate).toLocaleDateString(), 212, 5, true, 'right'); y -= 11;
    text('Bill No', 14, 5); text(record.invoice?.invoiceNumber, 105, 5.5, true, 'right');
    text('Customer', 119, 5); text((record.invoice?.customer?.customerName ?? 'Walk-in Customer').slice(0, 18), 212, 5, true, 'right'); y -= 11;
    text('Reason', 14, 5); text(String(record.reason ?? '').slice(0, 22), 105, 5, true, 'right');
    text('Status', 119, 5); text(record.status, 212, 5, true, 'right'); y -= 11; rule(); y -= 12;
    text('CODE', 14, 6, true); text('ITEM NAME', 62, 6, true); y -= 10;
    if (isRefund) { text('QTY', 44, 6, true, 'right'); text('RATE', 104, 6, true, 'right'); text('DISCOUNT', 158, 5.5, true, 'right'); text('AMOUNT', 212, 5.5, true, 'right'); }
    y -= 8; rule(true); y -= 13;
    if (isRefund) details.forEach((detail: any) => {
      text(detail.product?.sku, 14, 6, true); text(String(detail.product?.productName ?? '').slice(0, 25), 62, 6, true); y -= 11;
      text(Number(detail.quantity).toFixed(3), 44, 6, true, 'right'); text(money(detail.unitPrice), 104, 6, false, 'right'); text(money(detail.discountAmount), 158, 6, false, 'right'); text(money(detail.refundAmount), 212, 6, true, 'right'); y -= 10; rule(); y -= 12;
    });
    else {
      const detail = record.invoiceDetail;
      text(detail?.product?.sku, 14, 6, true); text(String(detail?.product?.productName ?? '').slice(0, 25), 62, 6, true); y -= 14;
      text('Original discount', 14, 5.5); text(`${Number(record.originalDiscountPercentage)}% / LKR ${money(record.originalDiscountAmount)}`, 212, 5.5, true, 'right'); y -= 12;
      text('Corrected discount', 14, 5.5); text(`${Number(record.correctedDiscountPercentage)}% / LKR ${money(record.correctedDiscountAmount)}`, 212, 5.5, true, 'right'); y -= 12; rule(); y -= 14;
      text('Adjustment type', 14, 5.5); text(record.adjustmentType, 212, 5.5, true, 'right'); y -= 14;
    }
    rule(); y -= 14; text(isRefund ? 'Refund Total' : 'Adjustment Total', 14, 7, true); text(`LKR ${money(isRefund ? record.refundTotal : record.adjustmentAmount)}`, 212, 7, true, 'right'); y -= 13; rule(); y -= 18;
    text('Thank you for shopping with us!', 0, 7, true, 'center'); y -= 10;
    text('This receipt refers to the original invoice shown above.', 0, 4.5, false, 'center'); y -= 17; rule(); y -= 12;
    text('Software By: Prosinc - 07111111111', 0, 4.5, false, 'center', '0.45 0.5 0.58');
    const content = commands.join('\n');
    const objects = ['1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n', '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n', `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>\nendobj\n`, `4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`, '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n', '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>\nendobj\n'];
    let pdf = '%PDF-1.4\n', offsets = [0]; objects.forEach((object) => { offsets.push(pdf.length); pdf += object; });
    const xref = pdf.length; pdf += `xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map((offset) => String(offset).padStart(10, '0') + ' 00000 n ').join('\n')}\ntrailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
    if (printOnly) {
      const frame = document.createElement('iframe'); frame.style.position = 'fixed'; frame.style.width = '1px'; frame.style.height = '1px'; frame.style.opacity = '0'; frame.src = url; frame.onload = () => { frame.contentWindow?.focus(); frame.contentWindow?.print(); setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60000); }; document.body.appendChild(frame); return;
    }
    const link = document.createElement('a'); link.href = url; link.download = `${number}-receipt.pdf`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <div>
    <div className="page-head"><div><div className="eyebrow">SALES / CORRECTIONS</div><h1>Invoice Correction</h1><p>Load one invoice and correct its items, quantities or discounts.</p></div></div>
    <div className="card correction-workbench">
      <div className="correction-load"><label className="field"><span>Invoice number</span><input className="control" value={lookup} onChange={(event) => setLookup(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') loadInvoice(); }} placeholder="INV-20260820-000001" list="invoice-options"/></label><datalist id="invoice-options">{(invoices.data ?? []).filter((row) => row.invoiceStatus !== 'FULLY_REFUNDED').map((row) => <option key={row.invoiceId} value={row.invoiceNumber}>{row.customer?.customerName ?? 'Walk-in Customer'}</option>)}</datalist><button className="btn btn-primary" onClick={loadInvoice} disabled={invoices.isLoading}>Load Invoice</button><button className="btn btn-secondary" onClick={() => { setLookup(''); setSelectedId(null); resetWork(); }}>Clear</button></div>
      {message && <div className={message.includes('successfully') ? 'success-box' : 'error-box'}>{message}</div>}
      {invoice.data && <>
        <div className="correction-invoice-info"><div><span>Invoice</span><strong>{invoice.data.invoiceNumber}</strong></div><div><span>Date</span><strong>{new Date(invoice.data.invoiceDate).toLocaleString()}</strong></div><div><span>Customer</span><strong>{invoice.data.customer?.customerName ?? 'Walk-in Customer'}</strong></div><div><span>Location</span><strong>{invoice.data.location?.name}</strong></div><div><span>Status</span><SalesBadge status={invoice.data.invoiceStatus.replaceAll('_', ' ')}/></div></div>
        <div className="correction-mode"><button className={mode === 'ITEM' ? 'active' : ''} onClick={() => { setMode('ITEM'); resetWork(); }}><b>Item / Quantity</b><small>Extra items, excess quantity or returns</small></button><button className={mode === 'DISCOUNT' ? 'active' : ''} onClick={() => { setMode('DISCOUNT'); resetWork(); }}><b>Discount % / Rs</b><small>Financial correction without stock movement</small></button></div>
        <div className="sales-card-head"><button type="button" className="btn btn-danger-soft" disabled={pending || invoice.isFetching || !remainingLines.length} onClick={selectFullRefund}>Full Refund</button><span>Select all remaining items, then review and confirm below.</span></div>
        <div className="correction-body"><div className="correction-lines"><table className="table"><thead>{mode === 'ITEM' ? <tr><th>Product</th><th>Sold</th><th>Available</th><th>Refund Qty</th><th>Return Stock</th><th className="right">Refund</th></tr> : <tr><th></th><th>Product</th><th>Gross</th><th>Original %</th><th>Original Rs</th><th>Correct %</th><th>Correct Rs</th><th className="right">Difference</th></tr>}</thead><tbody>{invoice.data.details.map((line: any) => mode === 'ITEM' ? <tr key={line.invoiceDetailId}><td><strong>{line.product.productName}</strong><small className="refund-code">{line.product.sku}</small></td><td>{Number(line.quantity)}</td><td>{Number(line.refundableQuantity)}</td><td><input className="control correction-number" type="number" min="0" max={Math.floor(Number(line.refundableQuantity))} step="1" inputMode="numeric" value={quantities[line.invoiceDetailId] || ''} onChange={(event) => setQuantities((values) => ({ ...values, [line.invoiceDetailId]: Math.min(Math.floor(Number(line.refundableQuantity)), Math.max(0, Math.floor(Number(event.target.value) || 0))) }))}/></td><td><label className="check"><input type="checkbox" checked={stockReturns[line.invoiceDetailId] !== false} onChange={(event) => setStockReturns((values) => ({ ...values, [line.invoiceDetailId]: event.target.checked }))}/> Yes</label></td><td className="right"><strong>LKR {money((quantities[line.invoiceDetailId] ?? 0) * Number(line.netTotal) / Number(line.quantity))}</strong></td></tr> : <tr className={selectedLineId === line.invoiceDetailId ? 'selected-row' : ''} key={line.invoiceDetailId}><td><input type="radio" checked={selectedLineId === line.invoiceDetailId} onChange={() => selectDiscountLine(line)}/></td><td><strong>{line.product.productName}</strong><small className="refund-code">{line.product.sku}</small></td><td>{money(line.grossTotal)}</td><td>{Number(line.discountPercentage)}%</td><td>{money(line.discountAmount)}</td><td>{selectedLineId === line.invoiceDetailId ? <input className="control correction-number" type="number" min="0" max="100" step="0.01" value={correctedPercentage} onChange={(event) => changeDiscountPercentage(event.target.value)}/> : '—'}</td><td>{selectedLineId === line.invoiceDetailId ? <input className="control correction-number" type="number" min="0" max={Number(line.grossTotal)} step="0.01" value={correctedAmount} onChange={(event) => changeDiscountAmount(event.target.value)}/> : '—'}</td><td className="right"><strong>{selectedLineId === line.invoiceDetailId ? `LKR ${money(adjustmentTotal)}` : '—'}</strong></td></tr>)}</tbody></table></div>
          <aside className="correction-summary"><h3>Correction Summary</h3><div><span>Invoice total</span><b>LKR {money(invoice.data.grandTotal)}</b></div>{mode === 'ITEM' ? <><div><span>Selected quantity</span><b>{Object.values(quantities).reduce((sum, value) => sum + value, 0)}</b></div><div><span>Correction</span><b>{fullRefund ? 'Full refund' : 'Item refund'}</b></div></> : <><div><span>Original discount</span><b>LKR {money(originalDiscount)}</b></div><div><span>Corrected discount</span><b>LKR {money(correctedDiscount)}</b></div><div><span>Correction</span><b>{adjustmentType}</b></div></>}{mode === 'ITEM' && <div><span>Maximum money to return</span><b>LKR {money(settlementLimit)}</b></div>}<div className="correction-grand"><span>{mode === 'ITEM' ? 'Refund Total' : 'Adjustment Total'}</span><strong>LKR {money(correctionTotal)}</strong></div></aside></div>
        <div className="correction-settlement"><label className="field"><span>Reason <b className="required">*</b></span><select className="control" value={reason} onChange={(event) => setReason(event.target.value)}>{mode === 'ITEM' ? <><option>Incorrect billing</option><option>Extra item</option><option>Excess quantity</option><option>Wrong product</option><option>Customer return</option><option>Damaged return</option></> : <><option>Wrong discount</option><option>Incorrect discount percentage</option><option>Incorrect discount amount</option></>}</select></label><label className="field"><span>{mode === 'ITEM' || adjustmentType === 'Customer refund' ? 'Refund method' : 'Payment method'}</span><select className="control" value={paymentMethodId} onChange={(event) => { setPaymentMethodId(event.target.value); setPaymentChannelId(''); setPaymentReference(''); }}><option value="">Settle later</option>{(methods.data ?? []).filter((method) => method.isActive && method.paymentMethodType).map((method) => <option key={method.paymentMethodId} value={method.paymentMethodId}>{method.paymentMethodName} — {method.paymentMethodType}</option>)}</select></label><label className="field"><span>Settlement amount</span><input className="control" type="number" min="0" max={settlementLimit} step="0.01" value={settlementAmount} onChange={(event) => setSettlementAmount(event.target.value)}/></label>{mode === 'ITEM' && selectedMethod?.paymentMethodType === 'CARD' && <><label className="field"><span>Card channel</span><select className="control" value={paymentChannelId} onChange={(event) => setPaymentChannelId(event.target.value)}><option value="">Choose acquiring bank</option>{(channels.data ?? []).map((channel) => <option key={channel.paymentChannelId} value={channel.paymentChannelId}>{channel.name}</option>)}</select></label><label className="field"><span>Refund approval / transaction reference</span><input className="control" maxLength={100} value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} /></label></>}<button className="btn btn-primary correction-confirm" disabled={(mode === 'ITEM' ? selectedQuantity <= 0 : correctionTotal <= 0) || !reason || pending || invoice.isFetching || (mode === 'ITEM' && selectedMethod?.paymentMethodType === 'CARD' && (!paymentChannelId || !paymentReference.trim()))} onClick={submit}>{pending ? 'Processing...' : fullRefund ? 'Confirm Full Refund' : 'Confirm Correction'}</button></div>
        {error && <div className="error-box">{(error as Error).message}</div>}
      </>}
    </div>
    <div className="card correction-history"><div className="sales-card-head"><div><h2>Correction History</h2><p>Previous quantity refunds and discount adjustments.</p></div><div className="correction-tabs"><button className={historyMode === 'REFUNDS' ? 'active' : ''} onClick={() => { setHistoryMode('REFUNDS'); setPage(1); }}>Item Refunds</button><button className={historyMode === 'ADJUSTMENTS' ? 'active' : ''} onClick={() => { setHistoryMode('ADJUSTMENTS'); setPage(1); }}>Discount Corrections</button></div></div>{historyMode === 'REFUNDS' ? <table className="table"><thead><tr><th>Refund</th><th>Invoice</th><th>Customer</th><th>Reason</th><th>Date</th><th className="right">Total</th><th className="right">Receipt</th></tr></thead><tbody>{historyQuery.isLoading ? <tr><td colSpan={7}>Loading history...</td></tr> : historyQuery.isError ? <tr><td colSpan={7}>Unable to load correction history.</td></tr> : !total ? <tr><td colSpan={7}><div className="empty">No records found.</div></td></tr> : pagedRefunds.map((row) => <tr key={row.invoiceRefundId}><td><strong className="sales-id">{row.refundNumber}</strong></td><td>{row.invoice?.invoiceNumber}</td><td>{row.invoice?.customer?.customerName ?? 'Walk-in Customer'}</td><td>{row.reason}</td><td>{new Date(row.refundDate).toLocaleString()}</td><td className="right"><strong>LKR {money(row.refundTotal)}</strong></td><td className="right"><div className="sales-history-actions"><button className="btn btn-edit-soft" onClick={() => outputReceipt('REFUND', row, true)}>Print</button><button className="btn btn-secondary" onClick={() => outputReceipt('REFUND', row, false)}>Download</button></div></td></tr>)}</tbody></table> : <table className="table"><thead><tr><th>Adjustment</th><th>Invoice</th><th>Product</th><th>Type</th><th>Corrected Discount</th><th>Status</th><th className="right">Amount</th><th className="right">Receipt</th></tr></thead><tbody>{historyQuery.isLoading ? <tr><td colSpan={8}>Loading history...</td></tr> : historyQuery.isError ? <tr><td colSpan={8}>Unable to load correction history.</td></tr> : !total ? <tr><td colSpan={8}><div className="empty">No records found.</div></td></tr> : pagedAdjustments.map((row) => <tr key={row.invoiceAdjustmentId}><td><strong className="sales-id">{row.adjustmentNumber}</strong></td><td>{row.invoice?.invoiceNumber}</td><td>{row.invoiceDetail?.product?.productName}</td><td><SalesBadge status={row.adjustmentType}/></td><td>{Number(row.correctedDiscountPercentage)}% / LKR {money(row.correctedDiscountAmount)}</td><td><SalesBadge status={row.status}/></td><td className="right"><strong>LKR {money(row.adjustmentAmount)}</strong></td><td className="right"><div className="sales-history-actions"><button className="btn btn-edit-soft" onClick={() => outputReceipt('ADJUSTMENT', row, true)}>Print</button><button className="btn btn-secondary" onClick={() => outputReceipt('ADJUSTMENT', row, false)}>Download</button></div></td></tr>)}</tbody></table>}
      <div className="toolbar sales-history-pagination">
        <span aria-live="polite">{historyQuery.isLoading ? 'Loading history...' : `Showing ${total ? (currentPage - 1) * limit + 1 : 0}–${Math.min(currentPage * limit, total)} of ${total} records`}</span>
        <nav className="sales-history-page-controls" aria-label="Correction history pagination">
          <button className="btn btn-secondary" disabled={historyQuery.isLoading || currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
          {visiblePages.map((number, index) => <span className="sales-history-page-number" key={number}>
            {index > 0 && number - visiblePages[index - 1] > 1 && <span aria-hidden="true">…</span>}
            <button className={number === currentPage ? 'btn btn-primary' : 'btn btn-secondary'} aria-label={`Page ${number}`} aria-current={number === currentPage ? 'page' : undefined} disabled={historyQuery.isLoading} onClick={() => setPage(number)}>{number}</button>
          </span>)}
          <button className="btn btn-secondary" disabled={historyQuery.isLoading || currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Next</button>
          <select className="control" aria-label="Rows per page" value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }}>
            <option value={20}>20</option><option value={50}>50</option><option value={100}>100</option>
          </select>
        </nav>
      </div>
    </div>
  </div>;
}
