export type DocumentHeader = {
  company: {
    name: string;
    legalName?: string | null;
    phone?: string | null;
    email?: string | null;
    registrationNumber?: string | null;
    taxRegistrationNumber?: string | null;
  };
  location: {
    code: string;
    name: string;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
  };
};

export type DocumentUser = {
  username: string;
  firstName?: string | null;
  lastName?: string | null;
};

export type DocumentField = { label: string; value: string };
export type DocumentColumn = { label: string; weight: number; numeric?: boolean };
export type DocumentSection = {
  title: string;
  columns: DocumentColumn[];
  rows: string[][];
  totals?: DocumentField[];
};
export type TransactionDocument = {
  company: DocumentHeader["company"];
  title: string;
  number: string;
  date: string;
  location: string;
  status: string;
  fields: DocumentField[];
  sections: DocumentSection[];
  notes: DocumentField[];
  audit: DocumentField[];
  timeZone: string;
};
