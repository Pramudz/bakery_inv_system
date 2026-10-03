import { invoiceReceiptModel } from './invoiceReceiptModel';
import './invoice-receipt.css';

export function InvoiceReceiptContent({ invoice, copy = false }: { invoice: Record<string, any>; copy?: boolean }) {
  const { cart, paidTotal, tenderedTotal, changeTotal, total, outstandingBalance, subtotal, discount, method, paymentStatus, saleType, selectedCustomer, receiptDate, unitPrice, lineNet, header, billNo, locationCode, registerCode, payments } = invoiceReceiptModel(invoice);
  return (<div className="receipt-preview">
              <div className="receipt-business">
                <h3>{header?.companyName ?? 'Sale receipt'}</h3>
                {header?.locationName && <strong>{header.locationName}</strong>}
                {(header?.locationAddress ?? []).map((line: string, index: number) => <small key={index}>{line}</small>)}
                {header?.locationPhone && <small>Tel: {header.locationPhone}</small>}
                <h4>SALE RECEIPT{copy ? ' - COPY' : ''}</h4>
                {header?.configurationWarnings?.map((warning: string) => <small className="receipt-warning" key={warning}>{warning}</small>)}
              </div>
              <div className="receipt-meta">
                <div>
                  <span>Bill No</span>
                  <b>{billNo === null ? 'Not issued (legacy)' : String(billNo).padStart(4, '0')}</b>
                </div>
                <div>
                  <span>Date</span>
                  <b>{receiptDate}</b>
                </div>
                <div>
                  <span>Location</span>
                  <b>{locationCode ?? '—'}</b>
                </div>
                <div>
                  <span>POS/Register</span>
                  <b>{registerCode ?? '—'}</b>
                </div>
                <div>
                  <span>Cashier</span>
                  <b>{header?.cashierCode ? `${header.cashierCode} · ${header.cashierName}` : '—'}</b>
                </div>
                <div>
                  <span>Customer</span>
                  <b>{selectedCustomer?.name ?? "No customer selected"}</b>
                </div>
                <div>
                  <span>Sale Type</span>
                  <b>{saleType}</b>
                </div>
                <div>
                  <span>Payment</span>
                  <b>{method}</b>
                </div>
              </div>
              <div className="receipt-two-line-head">
                <div className="receipt-identity-row">
                  <span>Code</span>
                  <span>Item Name</span>
                </div>
                <div className="receipt-values-row">
                  <span>Qty</span>
                  <span>Rate</span>
                  <span>Discount</span>
                  <span>Amount</span>
                </div>
              </div>
              {cart.map((x) => (
                <div className="receipt-two-line-item" key={x.code}>
                  <div className="receipt-identity-row">
                    <b>{x.code}</b>
                    <strong>{x.name}</strong>
                  </div>
                  <div className="receipt-values-row">
                    <b>{x.qty.toFixed(3)}</b>
                    <span>{unitPrice(x).toFixed(2)}</span>
                    <span>{x.discountRs.toFixed(2)}</span>
                    <strong>{lineNet(x).toFixed(2)}</strong>
                  </div>
                </div>
              ))}
              <div className="receipt-calculation">
                <div>
                  <span>Items count</span>
                  <b>{cart.reduce((n, x) => n + x.qty, 0)}</b>
                </div>
                <div>
                  <span>Subtotal</span>
                  <b>LKR {subtotal.toLocaleString()}</b>
                </div>
                <div>
                  <span>Total discount</span>
                  <b>- LKR {discount.toLocaleString()}</b>
                </div>
                <div className="receipt-total">
                  <span>Original Total</span>
                  <b>LKR {total.toLocaleString()}</b>
                </div>
                <div>
                  <span>Tendered</span>
                  <b>LKR {tenderedTotal.toLocaleString()}</b>
                </div>
                <div>
                  <span>Paid Amount</span>
                  <b>LKR {paidTotal.toLocaleString()}</b>
                </div>
                <div>
                  <span>Outstanding Balance</span>
                  <b>LKR {outstandingBalance.toLocaleString()}</b>
                </div>
                {changeTotal > 0 && <div><span>Change Given</span><b>LKR {changeTotal.toLocaleString()}</b></div>}
                <div>
                  <span>Payment method</span>
                  <b>{method}</b>
                </div>
                {payments.map((payment: any, index: number) => <div key={index}><span>{payment.paymentMethod?.paymentMethodName ?? 'Payment'}</span><b>LKR {Number(payment.amount).toFixed(2)}</b></div>)}
                <div>
                  <span>Payment status</span>
                  <b
                    className={`receipt-status ${paymentStatus.toLowerCase()}`}
                  >
                    {paymentStatus}
                  </b>
                </div>
              </div>
              <div className="receipt-thanks">
                <strong>Thank you for shopping with us!</strong>
                <small>
                  We appreciate your business and hope to see you again.
                </small>
              </div>
              <div className="receipt-software">
                Software By: <b>Prosinc</b> · 07111111111
              </div>
            </div>);
}
