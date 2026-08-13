import type { ReactNode } from 'react';
export function Section({title,description,children}: {title:string;description?:string;children:ReactNode}){
 return <section className="form-section"><div className="section-title"><div><h3>{title}</h3>{description&&<p>{description}</p>}</div></div>{children}</section>;
}
