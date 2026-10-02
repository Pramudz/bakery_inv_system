import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { PaymentChannel } from '../payment-channels/payment-channel.entity';
import { PaymentMethod, PaymentMethodType } from './payment-methods.entity';

export interface PaymentRequest {
  paymentMethodId: number;
  amount: number;
  paymentChannelId?: number;
  referenceNumber?: string;
}

export interface PreparedPayment {
  method: PaymentMethod;
  channel: PaymentChannel | null;
  tendered: number;
  applied: number;
  change: number;
  referenceNumber: string | null;
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

@Injectable()
export class PaymentProcessingService {
  async prepare(manager: EntityManager, tenantId: number, requests: PaymentRequest[], amountDue: number): Promise<PreparedPayment[]> {
    let remaining = money(amountDue);
    const prepared: PreparedPayment[] = [];
    for (const request of requests) {
      if (!Number.isFinite(request.amount) || request.amount <= 0 || money(request.amount) !== request.amount) {
        throw new BadRequestException('Payment amounts must be positive with at most two decimal places.');
      }
      if (remaining <= 0) throw new BadRequestException('A payment row cannot be added after the invoice is fully covered.');
      const { method, channel, referenceNumber } = await this.configuration(manager, tenantId, request);
      const tendered = money(request.amount);
      if (method.paymentMethodType !== PaymentMethodType.CASH && tendered > remaining) {
        throw new BadRequestException(`${method.paymentMethodName} cannot exceed the remaining amount of ${remaining.toFixed(2)}. Only cash may be over-tendered.`);
      }
      const applied = money(Math.min(tendered, remaining));
      const change = method.paymentMethodType === PaymentMethodType.CASH ? money(tendered - applied) : 0;
      prepared.push({ method, channel, tendered, applied, change, referenceNumber });
      remaining = money(remaining - applied);
    }
    return prepared;
  }

  async configuration(manager: EntityManager, tenantId: number, request: Pick<PaymentRequest, 'paymentMethodId' | 'paymentChannelId' | 'referenceNumber'>) {
    const method = await manager.getRepository(PaymentMethod).findOneBy({ paymentMethodId: request.paymentMethodId, tenantId, isActive: true });
    if (!method) throw new NotFoundException('Active payment method not found.');
    if (!method.paymentMethodType) throw new BadRequestException(`Payment method “${method.paymentMethodName}” has not been classified. Configure its type before accepting payments.`);
    const referenceNumber = request.referenceNumber?.trim() || null;
    let channel: PaymentChannel | null = null;
    if (method.paymentMethodType === PaymentMethodType.CARD) {
      if (!request.paymentChannelId) throw new BadRequestException('Select the card channel used for this card payment.');
      if (!referenceNumber) throw new BadRequestException('Enter the external card-machine approval or transaction reference.');
      channel = await manager.getRepository(PaymentChannel).findOneBy({ paymentChannelId: request.paymentChannelId, tenantId, isActive: true });
      if (!channel) throw new BadRequestException('The selected card channel is inactive or does not belong to this tenant.');
    } else if (request.paymentChannelId) {
      throw new BadRequestException('A card channel can only be recorded for a CARD payment method.');
    }
    return { method, channel, referenceNumber };
  }
}
