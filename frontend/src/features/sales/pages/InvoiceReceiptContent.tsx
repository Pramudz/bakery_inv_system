import { invoiceReceiptModel } from './invoiceReceiptModel';
import './invoice-receipt.css';

export function InvoiceReceiptContent({ invoice }: { invoice: Record<string, any> }) {
  const { cart, paidTotal, tenderedTotal, changeTotal, total, subtotal, discount, method, paymentStatus, saleType, selectedCustomer, completedInvoice, receiptDate, unitPrice, lineNet } = invoiceReceiptModel(invoice);
  return (<div className="receipt-preview">
              <div className="receipt-business">
                <h3>ERP CORE BAKERY</h3>
                <strong>Main Bakery Outlet · Colombo, Sri Lanka</strong>
                <small>Tel: 011 234 5678 · bakery@example.com</small>
                <small>Fresh bakery products made daily</small>
                <h4>SALES INVOICE</h4>
              </div>
              <div className="receipt-meta">
                <div>
                  <span>Bill No</span>
                  <b>{completedInvoice?.invoiceNumber}</b>
                </div>
                <div>
                  <span>Date</span>
                  <b>{receiptDate}</b>
                </div>
                <div>
                  <span>Cashier</span>
                  <b>Counter User</b>
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
                  <span>Grand Total</span>
                  <b>LKR {total.toLocaleString()}</b>
                </div>
                <div>
                  <span>Tendered</span>
                  <b>LKR {tenderedTotal.toLocaleString()}</b>
                </div>
                <div>
                  <span>Applied to invoice</span>
                  <b>LKR {paidTotal.toLocaleString()}</b>
                </div>
                <div>
                  <span>{changeTotal > 0 ? "Change given" : "Balance"}</span>
                  <b>LKR {(changeTotal > 0 ? changeTotal : Math.max(0, total - paidTotal)).toLocaleString()}</b>
                </div>
                <div>
                  <span>Payment method</span>
                  <b>{method}</b>
                </div>
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
