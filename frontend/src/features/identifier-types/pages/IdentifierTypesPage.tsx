import { CrudPage } from '../../../components/ui/CrudPage';
import { identifierTypesApi } from '../api/identifier-typesApi';

export function IdentifierTypesPage() {
  return (
    <CrudPage
      title="Identifier Types"
      subtitle="Barcode and other product identifier types."
      queryKey="identifier-types"
      api={identifierTypesApi}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'code', label: 'Code' },
        { key: 'name', label: 'Name' },
        { key: 'isActive', label: 'Status' },
      ]}
      fields={[
        { name: 'code', label: 'Code', type: 'text', required: true },
        { name: 'name', label: 'Name', type: 'text', required: true },
        {
          name: 'description',
          label: 'Description',
          type: 'text',
          required: false,
        },
      ]}
    />
  );
}