import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PaymentChannelsService } from './payment-channels.service';

const locationScopedUser = { tenantId: 4, userId: 2, accessScope: 'LOCATION', assignedLocationIds: [99] } as any;

test('tenant card channels are listed without a location predicate', async () => {
  let options: any;
  const repo: any = { find: async (value: any) => { options = value; return []; } };
  await new PaymentChannelsService(repo).findAll(locationScopedUser, true);
  assert.deepEqual(options.where, { tenantId: 4, isActive: true });
  assert.deepEqual(options.order, { name: 'ASC', paymentChannelId: 'ASC' });
});

test('channel creation stores only tenant-wide channel data', async () => {
  let saved: any;
  const repo: any = {
    findOneBy: async () => null,
    create: (value: any) => value,
    save: async (value: any) => { saved = value; return value; },
  };
  await new PaymentChannelsService(repo).create({ code: ' commercial ', name: ' Commercial ' }, locationScopedUser);
  assert.deepEqual(saved, { tenantId: 4, code: 'COMMERCIAL', name: 'Commercial', isActive: true });
  assert.ok(!('locationId' in saved));
  assert.ok(!('machineIdentifier' in saved));
});
