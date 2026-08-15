import { apiClient } from '../../../services/apiClient';

export type Customer = Record<string, any>;

const withCrudId = (customer: Customer): Customer => ({
  ...customer,
  id: customer.customerId,
});

export const customersApi = {
  list:()=>apiClient.get<Customer[]>('/customers').then(customers=>customers.map(withCrudId)),
  create:(data:Record<string,unknown>)=>apiClient.post<Customer>('/customers',data).then(withCrudId),
  update:(id:number,data:Record<string,unknown>)=>apiClient.put<Customer>(`/customers/${id}`,data).then(withCrudId),
  deactivate:(id:number)=>apiClient.patch<Customer>(`/customers/${id}/deactivate`).then(withCrudId)
};
