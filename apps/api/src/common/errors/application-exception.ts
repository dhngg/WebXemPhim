import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApplicationErrorCode } from '@rental/shared';

export interface ApplicationErrorDefinition {
  status: HttpStatus;
  message: string;
}

export const APPLICATION_ERROR_DEFINITIONS: Readonly<
  Record<ApplicationErrorCode, ApplicationErrorDefinition>
> = {
  VALIDATION_ERROR: { status: HttpStatus.BAD_REQUEST, message: 'Validation failed' },
  EMAIL_ALREADY_EXISTS: { status: HttpStatus.CONFLICT, message: 'Email already exists' },
  INVALID_CREDENTIALS: { status: HttpStatus.UNAUTHORIZED, message: 'Invalid credentials' },
  ACCESS_TOKEN_EXPIRED: { status: HttpStatus.UNAUTHORIZED, message: 'Access token expired' },
  REFRESH_TOKEN_INVALID: { status: HttpStatus.UNAUTHORIZED, message: 'Refresh token invalid' },
  TOKEN_ALREADY_ROTATED: {
    status: HttpStatus.CONFLICT,
    message: 'Refresh token was already rotated',
  },
  TOKEN_REUSE_DETECTED: {
    status: HttpStatus.UNAUTHORIZED,
    message: 'Refresh token reuse detected',
  },
  ACCOUNT_DISABLED: { status: HttpStatus.FORBIDDEN, message: 'Account disabled' },
  UNAUTHORIZED: { status: HttpStatus.UNAUTHORIZED, message: 'Unauthorized' },
  RATE_LIMITED: { status: HttpStatus.TOO_MANY_REQUESTS, message: 'Too many requests' },
  AUTH_NOT_IMPLEMENTED: {
    status: HttpStatus.NOT_IMPLEMENTED,
    message: 'Authentication operation is not implemented',
  },
  AUTH_DISABLED: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: 'Authentication is unavailable',
  },
  CSRF_VALIDATION_FAILED: {
    status: HttpStatus.FORBIDDEN,
    message: 'Request origin validation failed',
  },
  WORKSPACE_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Workspace not found' },
  WORKSPACE_ARCHIVED: { status: HttpStatus.CONFLICT, message: 'Workspace is archived' },
  WORKSPACE_OWNER_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'Workspace owner could not be changed',
  },
  WORKSPACE_ACTIVE_LIMIT_REACHED: {
    status: HttpStatus.CONFLICT,
    message: 'User already owns an active workspace',
  },
  WORKSPACE_MEMBER_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Workspace member not found',
  },
  WORKSPACE_MEMBER_ALREADY_EXISTS: {
    status: HttpStatus.CONFLICT,
    message: 'Workspace membership already exists',
  },
  WORKSPACE_OWNER_PROTECTED: {
    status: HttpStatus.CONFLICT,
    message: 'Workspace owner must be changed through ownership transfer',
  },
  BUILDING_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Building not found' },
  BUILDING_ARCHIVED: { status: HttpStatus.CONFLICT, message: 'Building is archived' },
  ROOM_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Room not found' },
  ROOM_ARCHIVED: { status: HttpStatus.CONFLICT, message: 'Room is archived' },
  ROOM_HAS_ACTIVE_CONTRACT: {
    status: HttpStatus.CONFLICT,
    message: 'Room status is controlled by its active contract',
  },
  ROOM_CODE_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'Room code already exists in this building',
  },
  AMENITY_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Amenity not found' },
  AMENITY_ALREADY_EXISTS: {
    status: HttpStatus.CONFLICT,
    message: 'Amenity already exists in this workspace',
  },
  ROOM_IMAGE_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Room image not found' },
  ROOM_IMAGE_ORDER_INVALID: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Room image order must contain every current image exactly once',
  },
  LISTING_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Listing not found' },
  LISTING_NOT_ELIGIBLE: {
    status: HttpStatus.CONFLICT,
    message: 'Room is not eligible for public listing',
  },
  VIEWING_REQUEST_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Viewing request not found',
  },
  VIEWING_REQUEST_NOT_ELIGIBLE: {
    status: HttpStatus.CONFLICT,
    message: 'Listing is not eligible for a viewing request',
  },
  VIEWING_REQUEST_INVALID_TRANSITION: {
    status: HttpStatus.CONFLICT,
    message: 'Viewing request status transition is not allowed',
  },
  VIEWING_REQUEST_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'An active viewing request already exists for this schedule',
  },
  TENANT_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Tenant not found' },
  TENANT_ARCHIVED: { status: HttpStatus.CONFLICT, message: 'Tenant profile is archived' },
  TENANT_HAS_ACTIVE_CONTRACT: {
    status: HttpStatus.CONFLICT,
    message: 'Tenant still has an active contract',
  },
  TENANT_LINK_REQUEST_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Tenant link request not found',
  },
  TENANT_LINK_REQUEST_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'An active tenant link request or link already exists',
  },
  TENANT_LINK_REQUEST_INVALID_TRANSITION: {
    status: HttpStatus.CONFLICT,
    message: 'Tenant link request status transition is not allowed',
  },
  TENANT_LINK_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Tenant link not found' },
  CONTRACT_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Contract not found' },
  CONTRACT_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'An active contract overlaps this room rental period',
  },
  CONTRACT_INVALID_TRANSITION: {
    status: HttpStatus.CONFLICT,
    message: 'Contract status transition is not allowed',
  },
  CONTRACT_NOT_ELIGIBLE: {
    status: HttpStatus.CONFLICT,
    message: 'Room or tenant is not eligible for this contract',
  },
  VEHICLE_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Vehicle not found' },
  VEHICLE_ALREADY_EXISTS: {
    status: HttpStatus.CONFLICT,
    message: 'License plate already exists in this workspace',
  },
  VEHICLE_INACTIVE: { status: HttpStatus.CONFLICT, message: 'Vehicle is inactive' },
  VEHICLE_NOT_ELIGIBLE: {
    status: HttpStatus.CONFLICT,
    message: 'Tenant is not eligible for vehicle management',
  },
  RATE_PLAN_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Rate plan not found' },
  RATE_PLAN_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'Rate plan effective period overlaps another version',
  },
  RATE_PLAN_INACTIVE: { status: HttpStatus.CONFLICT, message: 'Rate plan is inactive' },
  RATE_PLAN_NOT_ELIGIBLE: {
    status: HttpStatus.CONFLICT,
    message: 'Building is not eligible for rate management',
  },
  METER_READING_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Meter reading not found' },
  METER_READING_DUPLICATE: {
    status: HttpStatus.CONFLICT,
    message: 'Meter reading already exists for this room, meter and period',
  },
  METER_READING_INVALID: {
    status: HttpStatus.CONFLICT,
    message: 'Meter reading is lower than the previous reading or out of period order',
  },
  METER_READING_NOT_ELIGIBLE: {
    status: HttpStatus.CONFLICT,
    message: 'Room is not eligible for meter reading changes',
  },
  INVOICE_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Invoice not found' },
  INVOICE_DUPLICATE: {
    status: HttpStatus.CONFLICT,
    message: 'An invoice already exists for this contract and period',
  },
  INVOICE_NOT_EDITABLE: { status: HttpStatus.CONFLICT, message: 'Only DRAFT invoices can change' },
  INVOICE_INCOMPLETE: {
    status: HttpStatus.CONFLICT,
    message: 'Invoice is missing rates, meter readings or quantities and cannot be issued',
  },
  INVOICE_PERIOD_INVALID: {
    status: HttpStatus.CONFLICT,
    message: 'Contract is not in effect during the invoice period',
  },
  INVOICE_NOT_ELIGIBLE: {
    status: HttpStatus.CONFLICT,
    message: 'Building is not eligible for invoice changes',
  },
  INVOICE_VEHICLE_BILLING_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'Another invoice already bills this tenant vehicles for the period',
  },
  ROOM_SERVICE_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Room service not found' },
  ROOM_SERVICE_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'Room service period overlaps another assignment of the same rate code',
  },
  ROOM_SERVICE_NOT_ELIGIBLE: {
    status: HttpStatus.CONFLICT,
    message: 'Room or building is not eligible for service changes',
  },
  INVOICE_ADJUSTMENT_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Invoice adjustment not found',
  },
  INVOICE_ADJUSTMENT_INVALID: {
    status: HttpStatus.CONFLICT,
    message:
      'Adjustment is zero, would make the invoice total negative, or has an invalid reference',
  },
  INVOICE_ADJUSTMENT_NOT_ELIGIBLE: {
    status: HttpStatus.CONFLICT,
    message: 'Only ISSUED invoices of an active building can be adjusted',
  },
  INVOICE_ADJUSTMENT_IDEMPOTENCY_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'Idempotency key was already used with a different adjustment',
  },
  INVOICE_ADJUSTMENT_BELOW_PAID: {
    status: HttpStatus.CONFLICT,
    message:
      'Adjustment would lower the amount due below money already received; reverse or refund payments first',
  },
  INVOICE_PAYMENT_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Invoice payment not found' },
  INVOICE_PAYMENT_INVALID: {
    status: HttpStatus.CONFLICT,
    message: 'Payment is invalid, not reversible, or already reversed',
  },
  INVOICE_PAYMENT_EXCEEDS_DUE: {
    status: HttpStatus.CONFLICT,
    message: 'Payments cannot exceed the amount due of the invoice',
  },
  INVOICE_PAYMENT_NOT_ELIGIBLE: {
    status: HttpStatus.CONFLICT,
    message: 'Only ISSUED invoices of an active building take payments',
  },
  INVOICE_PAYMENT_IDEMPOTENCY_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'Idempotency key was already used with a different payment entry',
  },
  DEPOSIT_ENTRY_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Deposit entry not found' },
  DEPOSIT_ENTRY_INVALID: {
    status: HttpStatus.CONFLICT,
    message: 'Deposit entry is invalid, not reversible, or already reversed',
  },
  DEPOSIT_INSUFFICIENT_BALANCE: {
    status: HttpStatus.CONFLICT,
    message: 'Deposit balance is too low for this entry',
  },
  DEPOSIT_NOT_ELIGIBLE: {
    status: HttpStatus.CONFLICT,
    message: 'Only a refund of the remaining deposit is allowed for an archived building',
  },
  DEPOSIT_IDEMPOTENCY_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'Idempotency key was already used with a different deposit entry',
  },
  DEPOSIT_ARCHIVED_OWNER_ONLY: {
    status: HttpStatus.FORBIDDEN,
    message:
      'Only the workspace owner can record a deposit refund while the workspace or building is archived',
  },
  MAINTENANCE_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Maintenance request not found' },
  MAINTENANCE_INVALID_TRANSITION: {
    status: HttpStatus.CONFLICT,
    message: 'Maintenance status can only move OPEN, IN_PROGRESS, RESOLVED, CLOSED in order',
  },
  MAINTENANCE_NOT_EDITABLE: {
    status: HttpStatus.CONFLICT,
    message: 'Closed maintenance requests cannot change',
  },
  MAINTENANCE_NOT_CANCELLABLE: {
    status: HttpStatus.CONFLICT,
    message: 'Only an OPEN, unassigned request can be cancelled',
  },
  MAINTENANCE_NOT_ELIGIBLE: {
    status: HttpStatus.CONFLICT,
    message: 'The room, building or contract does not accept maintenance requests',
  },
  MAINTENANCE_ASSIGNEE_INVALID: {
    status: HttpStatus.CONFLICT,
    message: 'An assignee who is a workspace member is required for this step',
  },
  PASSWORD_RESET_TOKEN_INVALID: {
    status: HttpStatus.BAD_REQUEST,
    message: 'The reset link is invalid or has expired',
  },
  NOTIFICATION_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'Notification not found' },
  PLATFORM_ADMIN_REQUIRED: { status: HttpStatus.FORBIDDEN, message: 'Platform admin required' },
  ADMIN_USER_NOT_FOUND: { status: HttpStatus.NOT_FOUND, message: 'User not found' },
  ADMIN_TARGET_PROTECTED: {
    status: HttpStatus.CONFLICT,
    message: 'This account cannot be locked through the admin API',
  },
  ADMIN_STATE_UNCHANGED: { status: HttpStatus.CONFLICT, message: 'Nothing to change' },
  LANDLORD_APPLICATION_PENDING: {
    status: HttpStatus.CONFLICT,
    message: 'A landlord application is already pending',
  },
  LANDLORD_APPLICATION_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Landlord application not found',
  },
  LANDLORD_APPLICATION_INVALID_TRANSITION: {
    status: HttpStatus.CONFLICT,
    message: 'Landlord application cannot be decided in its current state',
  },
  LANDLORD_APPLICATION_COOLDOWN: {
    status: HttpStatus.CONFLICT,
    message: 'A landlord application cannot be submitted yet',
  },
  LANDLORD_APPLICATION_REQUIRED: {
    status: HttpStatus.FORBIDDEN,
    message: 'An approved landlord application is required',
  },
  TENANT_INVITATION_INVALID: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Tenant invitation is invalid or expired',
  },
  TENANT_INVITATION_CONFLICT: {
    status: HttpStatus.CONFLICT,
    message: 'Tenant invitation cannot be accepted because a link already exists',
  },
};

export class ApplicationException extends HttpException {
  constructor(readonly code: ApplicationErrorCode) {
    const definition = APPLICATION_ERROR_DEFINITIONS[code];
    super(definition.message, definition.status);
  }
}

export function getApplicationError(
  exception: unknown,
): { code: ApplicationErrorCode; definition: ApplicationErrorDefinition } | undefined {
  if (!(exception instanceof ApplicationException)) return undefined;
  return { code: exception.code, definition: APPLICATION_ERROR_DEFINITIONS[exception.code] };
}
