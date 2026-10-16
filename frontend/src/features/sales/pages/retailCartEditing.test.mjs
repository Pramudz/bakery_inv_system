import assert from 'node:assert/strict';
import test from 'node:test';
import { linkedRetailDiscount, cartFocusTarget } from './retailCartEditing.ts';

test('retail discounts synchronize both fields and preserve the last-edited basis on quantity changes', () => {
  assert.deepEqual(linkedRetailDiscount(1000, { type: 'PERCENTAGE', value: 10 }), { discountPct: 10, discountRs: 100, retailDiscount: { type: 'PERCENTAGE', value: 10 } });
  assert.equal(linkedRetailDiscount(1000, { type: 'AMOUNT', value: 125 }).discountPct, 12.5);
  assert.equal(linkedRetailDiscount(2000, { type: 'AMOUNT', value: 125 }).discountRs, 125);
  assert.equal(linkedRetailDiscount(2000, { type: 'PERCENTAGE', value: 10 }).discountRs, 200);
  assert.equal(linkedRetailDiscount(100, { type: 'AMOUNT', value: 200 }).discountRs, 100);
  assert.equal(linkedRetailDiscount(0, { type: 'AMOUNT', value: 20 }).discountPct, 0);
});
test('arrow navigation skips disabled columns, moves between rows and stays inside the cart', () => {
  const cells = [{row:0,column:0},{row:0,column:3},{row:1,column:0},{row:1,column:3}];
  assert.deepEqual(cartFocusTarget(cells, cells[0], 'ArrowRight'), cells[1]);
  assert.deepEqual(cartFocusTarget(cells, cells[1], 'ArrowRight'), cells[2]);
  assert.deepEqual(cartFocusTarget(cells, cells[2], 'ArrowLeft'), cells[1]);
  assert.deepEqual(cartFocusTarget(cells, cells[1], 'ArrowDown'), cells[3]);
  assert.deepEqual(cartFocusTarget(cells, cells[3], 'ArrowUp'), cells[1]);
  assert.deepEqual(cartFocusTarget(cells, cells[3], 'ArrowRight'), cells[3]);
});

test('cart uses authoritative gross and full price precision across quantity changes', async () => {
  const { cartLineGross } = await import('./retailCartEditing.ts');
  const quote = {quantity:3,unitPrice:100.33,pricingUnitPrice:100.3333,grossTotal:301};
  assert.equal(cartLineGross(3,100.33,quote),301);
  assert.equal(linkedRetailDiscount(cartLineGross(3,100.33,quote),{type:'PERCENTAGE',value:10}).discountRs,30.1);
  assert.equal(cartLineGross(6,100.33,quote),602);
  assert.equal(cartLineGross(2,100.33,quote),200.67);
});
