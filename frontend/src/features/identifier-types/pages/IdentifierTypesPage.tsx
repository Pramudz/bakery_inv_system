import { CrudPage } from '../../../components/ui/CrudPage';
import { platformIdentifierTypesApi } from '../api/identifier-typesApi';

export function IdentifierTypesPage() {
  return (
    <CrudPage
      title="Identifier Types"
      subtitle="Barcode and other product identifier types."
      queryKey="platform-identifier-types"
      api={platformIdentifierTypesApi}
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
