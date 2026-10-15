import { Module } from '@nestjs/common';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { InvoiceController, TenantInvoiceController } from './controllers/invoice.controller';
import { RoomServiceController } from './room-services/room-service.controller';
import { RoomServiceRepository } from './room-services/room-service.repository';
import { RoomServiceService } from './room-services/room-service.service';
import {
  InvoiceAdjustmentController,
  TenantInvoiceAdjustmentController,
} from './adjustments/invoice-adjustment.controller';
import { InvoiceAdjustmentRepository } from './adjustments/invoice-adjustment.repository';
import { InvoiceAdjustmentService } from './adjustments/invoice-adjustment.service';
import {
  InvoicePaymentController,
  TenantInvoicePaymentController,
} from './payments/invoice-payment.controller';
import { InvoicePaymentRepository } from './payments/invoice-payment.repository';
import { InvoicePaymentService } from './payments/invoice-payment.service';
import { InvoiceRepository } from './repositories/invoice.repository';
import { InvoiceService } from './services/invoice.service';

@Module({
  imports: [WorkspaceModule],
  controllers: [
    InvoiceController,
    TenantInvoiceController,
    RoomServiceController,
    InvoiceAdjustmentController,
    TenantInvoiceAdjustmentController,
    InvoicePaymentController,
    TenantInvoicePaymentController,
  ],
  providers: [
    InvoiceRepository,
    InvoiceService,
    RoomServiceRepository,
    RoomServiceService,
    InvoiceAdjustmentRepository,
    InvoiceAdjustmentService,
    InvoicePaymentRepository,
    InvoicePaymentService,
  ],
})
export class InvoiceModule {}
