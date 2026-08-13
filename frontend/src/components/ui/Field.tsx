import type { ChangeEvent } from 'react';

type Option = { value: string | number; label: string };
type Props = { label: string; value: unknown; onChange: (value: string) => void; type?: string; required?: boolean; placeholder?: string; options?: Option[]; hint?: string; disabled?: boolean; full?: boolean };
export function Field({label,value,onChange,type='text',required,placeholder,options,hint,disabled,full}:Props){
  return <div className={full ? 'field full' : 'field'}>
    <label>{label}{required && <span className="required">*</span>}</label>
    {options ? <select className="control" value={String(value ?? '')} onChange={e=>onChange(e.target.value)} required={required} disabled={disabled}>
      <option value="">Select...</option>{options.map(o=><option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
    </select> : <input className="control" type={type} value={String(value ?? '')} onChange={(e:ChangeEvent<HTMLInputElement>)=>onChange(e.target.value)} required={required} placeholder={placeholder} disabled={disabled}/>} 
    {hint && <small className="field-hint">{hint}</small>}
  </div>
}
