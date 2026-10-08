import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

const internalCostFields = new Set([
  'unitCostSnapshot', 'cogsAmount', 'originalUnitCostSnapshot', 'cogsReversalAmount',
]);

/** POS document endpoints serve cashiers; cost snapshots stay on the server. */
@Injectable()
export class PosCostVisibilityInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((value: unknown) => value == null ? value :
      JSON.parse(JSON.stringify(value, (key, field) => internalCostFields.has(key) ? undefined : field))));
  }
}
