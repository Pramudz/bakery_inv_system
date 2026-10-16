import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { customersApi } from '../api/customersApi';
import type { Customer, CustomerInput } from '../api/customersApi';

export function QuickCreateCustomerDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (customer: Customer) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ customerCode: '', customerName: '', nic: '', mobile: '', email: '', addressLine1: '', addressLine2: '', city: '', districtOrState: '' });
  const [error, setError] = useState('');
  useLayoutEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const create = useMutation({
    mutationFn: (data: CustomerInput) => customersApi.create(data),
    onSuccess: customer => {
      queryClient.setQueryData<Customer[]>(['customers'], current => [...(current ?? []).filter(row => row.customerId !== customer.customerId), customer]);
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      onCreated(customer);
    },
    onError: (err: Error) => setError(err.message || 'Unable to create customer. Please try again.'),
  });
  const close = () => { if (!create.isPending) onClose(); };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (create.isPending) return;
    if (!form.customerCode.trim() || !form.customerName.trim()) { setError('Customer code and name are required.'); return; }
    setError('');
    create.mutate({ ...form, customerCode: form.customerCode.trim().toUpperCase(), customerName: form.customerName.trim(),
      nic: form.nic.trim().toUpperCase(), mobile: form.mobile.trim(), email: form.email.trim(),
      addressLine1: form.addressLine1.trim(), addressLine2: form.addressLine2.trim(), city: form.city.trim(), districtOrState: form.districtOrState.trim(), isActive: true });
  };
  const fields = [
    { key: 'customerCode', label: 'Customer code', placeholder: 'Enter Customer Mobile Number', required: true, maxLength: 50, type: 'text' },
    { key: 'customerName', label: 'Customer name', placeholder: 'Enter customer name', required: true, maxLength: 200, type: 'text' },
    { key: 'nic', label: 'NIC', placeholder: 'Optional', required: false, maxLength: 20, type: 'text' },
    { key: 'mobile', label: 'Mobile', placeholder: 'Optional mobile number', required: false, maxLength: 50, type: 'tel' },
    { key: 'email', label: 'Email', placeholder: 'Optional email address', required: false, maxLength: 150, type: 'email' },
    { key: 'addressLine1', label: 'Address line 1', placeholder: 'Enter street address', required: false, maxLength: 255, type: 'text' },
    { key: 'addressLine2', label: 'Address line 2', placeholder: 'Apartment, building or area', required: false, maxLength: 255, type: 'text' },
    { key: 'city', label: 'City', placeholder: 'Enter city', required: false, maxLength: 100, type: 'text' },
    { key: 'districtOrState', label: 'District / State', placeholder: 'Enter district or state', required: false, maxLength: 100, type: 'text' },
  ] as const;
  return <dialog ref={dialog} className="billing-customer-dialog" aria-labelledby="quick-customer-title" aria-describedby="quick-customer-description"
    onCancel={event => { event.preventDefault(); close(); }}>
    <div className="billing-customer-dialog-head">
      <div><div className="eyebrow">CUSTOMER DETAILS</div><h2 id="quick-customer-title">New customer</h2><p id="quick-customer-description">Create a customer and select them for this bill.</p></div>
      <button type="button" className="icon-btn" onClick={close} disabled={create.isPending} aria-label="Close new customer">×</button>
    </div>
    <form onSubmit={submit} aria-busy={create.isPending}>
      <fieldset className="billing-customer-dialog-fields" disabled={create.isPending}>
        {fields.map(({ key, label, placeholder, required, maxLength, type }, index) => <Fragment key={key}>
          {key === 'addressLine1' && <h3 className="billing-customer-dialog-section-title">Address</h3>}
          <div className={`field${key === 'email' ? ' full' : ''}`}>
          <label htmlFor={`quick-customer-${key}`}>{label}{required ? <span className="required">*</span> : <small>Optional</small>}</label>
          <input className="control" id={`quick-customer-${key}`} value={form[key]} type={type} placeholder={placeholder} required={required}
            maxLength={maxLength} autoFocus={index === 0} onChange={event => { setForm(current => ({ ...current, [key]: event.target.value })); setError(''); }}/>
        </div></Fragment>)}
      </fieldset>
      {error && <div className="error-box" role="alert">{error}</div>}
      <div className="billing-customer-dialog-actions"><button type="button" className="btn btn-secondary" onClick={close} disabled={create.isPending}>Cancel</button>
        <button type="submit" className="btn btn-secondary billing-new-customer" disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Save customer'}</button></div>
    </form>
  </dialog>;
}
