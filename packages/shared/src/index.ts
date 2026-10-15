export const API_PREFIX = 'api/v1';
export const PLATFORM_NAME = 'Rental Platform';

export type DatabaseState = 'disabled' | 'up' | 'down';

export interface HealthResponse {
  status: 'ok';
  service: 'rental-api';
  timestamp: string;
}

export interface ReadinessResponse {
  status: 'ok';
  database: Exclude<DatabaseState, 'down'>;
}

export interface ApiErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  errors?: string[];
  path: string;
  timestamp: string;
  requestId: string;
}

export const USER_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const AUTH_ERROR_CODES = [
  'VALIDATION_ERROR',
  'EMAIL_ALREADY_EXISTS',
  'INVALID_CREDENTIALS',
  'ACCESS_TOKEN_EXPIRED',
  'REFRESH_TOKEN_INVALID',
  'TOKEN_ALREADY_ROTATED',
  'TOKEN_REUSE_DETECTED',
  'ACCOUNT_DISABLED',
  'UNAUTHORIZED',
  'RATE_LIMITED',
  'AUTH_NOT_IMPLEMENTED',
  'AUTH_DISABLED',
  'CSRF_VALIDATION_FAILED',
  'PASSWORD_RESET_TOKEN_INVALID',
] as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export const WORKSPACE_ROLES = ['OWNER', 'MANAGER', 'STAFF'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const WORKSPACE_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type WorkspaceStatus = (typeof WORKSPACE_STATUSES)[number];

export const WORKSPACE_ERROR_CODES = [
  'WORKSPACE_NOT_FOUND',
  'WORKSPACE_ARCHIVED',
  'WORKSPACE_OWNER_CONFLICT',
  'WORKSPACE_ACTIVE_LIMIT_REACHED',
  'WORKSPACE_MEMBER_NOT_FOUND',
  'WORKSPACE_MEMBER_ALREADY_EXISTS',
  'WORKSPACE_OWNER_PROTECTED',
] as const;
export type WorkspaceErrorCode = (typeof WORKSPACE_ERROR_CODES)[number];

export const BUILDING_ERROR_CODES = ['BUILDING_NOT_FOUND', 'BUILDING_ARCHIVED'] as const;
export type BuildingErrorCode = (typeof BUILDING_ERROR_CODES)[number];

export const ROOM_ERROR_CODES = [
  'ROOM_NOT_FOUND',
  'ROOM_ARCHIVED',
  'ROOM_HAS_ACTIVE_CONTRACT',
  'ROOM_CODE_CONFLICT',
  'AMENITY_NOT_FOUND',
  'AMENITY_ALREADY_EXISTS',
  'ROOM_IMAGE_NOT_FOUND',
  'ROOM_IMAGE_ORDER_INVALID',
] as const;
export type RoomErrorCode = (typeof ROOM_ERROR_CODES)[number];

export const LISTING_ERROR_CODES = ['LISTING_NOT_FOUND', 'LISTING_NOT_ELIGIBLE'] as const;
export type ListingErrorCode = (typeof LISTING_ERROR_CODES)[number];

export const VIEWING_REQUEST_ERROR_CODES = [
  'VIEWING_REQUEST_NOT_FOUND',
  'VIEWING_REQUEST_NOT_ELIGIBLE',
  'VIEWING_REQUEST_INVALID_TRANSITION',
  'VIEWING_REQUEST_CONFLICT',
] as const;
export type ViewingRequestErrorCode = (typeof VIEWING_REQUEST_ERROR_CODES)[number];

export const TENANT_ERROR_CODES = [
  'TENANT_NOT_FOUND',
  'TENANT_ARCHIVED',
  'TENANT_HAS_ACTIVE_CONTRACT',
  'TENANT_LINK_REQUEST_NOT_FOUND',
  'TENANT_LINK_REQUEST_CONFLICT',
  'TENANT_LINK_REQUEST_INVALID_TRANSITION',
  'TENANT_LINK_NOT_FOUND',
] as const;
export type TenantErrorCode = (typeof TENANT_ERROR_CODES)[number];

export const CONTRACT_ERROR_CODES = [
  'CONTRACT_NOT_FOUND',
  'CONTRACT_CONFLICT',
  'CONTRACT_INVALID_TRANSITION',
  'CONTRACT_NOT_ELIGIBLE',
] as const;
export type ContractErrorCode = (typeof CONTRACT_ERROR_CODES)[number];

export const VEHICLE_ERROR_CODES = [
  'VEHICLE_NOT_FOUND',
  'VEHICLE_ALREADY_EXISTS',
  'VEHICLE_INACTIVE',
  'VEHICLE_NOT_ELIGIBLE',
] as const;
export type VehicleErrorCode = (typeof VEHICLE_ERROR_CODES)[number];

export const RATE_PLAN_ERROR_CODES = [
  'RATE_PLAN_NOT_FOUND',
  'RATE_PLAN_CONFLICT',
  'RATE_PLAN_INACTIVE',
  'RATE_PLAN_NOT_ELIGIBLE',
] as const;
export type RatePlanErrorCode = (typeof RATE_PLAN_ERROR_CODES)[number];

export const METER_READING_ERROR_CODES = [
  'METER_READING_NOT_FOUND',
  'METER_READING_DUPLICATE',
  'METER_READING_INVALID',
  'METER_READING_NOT_ELIGIBLE',
] as const;
export type MeterReadingErrorCode = (typeof METER_READING_ERROR_CODES)[number];

export const INVOICE_ERROR_CODES = [
  'INVOICE_NOT_FOUND',
  'INVOICE_DUPLICATE',
  'INVOICE_NOT_EDITABLE',
  'INVOICE_INCOMPLETE',
  'INVOICE_PERIOD_INVALID',
  'INVOICE_NOT_ELIGIBLE',
  'INVOICE_VEHICLE_BILLING_CONFLICT',
  'ROOM_SERVICE_NOT_FOUND',
  'ROOM_SERVICE_CONFLICT',
  'ROOM_SERVICE_NOT_ELIGIBLE',
  'INVOICE_ADJUSTMENT_NOT_FOUND',
  'INVOICE_ADJUSTMENT_INVALID',
  'INVOICE_ADJUSTMENT_NOT_ELIGIBLE',
  'INVOICE_ADJUSTMENT_IDEMPOTENCY_CONFLICT',
  'INVOICE_ADJUSTMENT_BELOW_PAID',
  'INVOICE_PAYMENT_NOT_FOUND',
  'INVOICE_PAYMENT_INVALID',
  'INVOICE_PAYMENT_EXCEEDS_DUE',
  'INVOICE_PAYMENT_NOT_ELIGIBLE',
  'INVOICE_PAYMENT_IDEMPOTENCY_CONFLICT',
  'DEPOSIT_ENTRY_NOT_FOUND',
  'DEPOSIT_ENTRY_INVALID',
  'DEPOSIT_INSUFFICIENT_BALANCE',
  'DEPOSIT_NOT_ELIGIBLE',
  'DEPOSIT_IDEMPOTENCY_CONFLICT',
  'DEPOSIT_ARCHIVED_OWNER_ONLY',
  'MAINTENANCE_NOT_FOUND',
  'MAINTENANCE_INVALID_TRANSITION',
  'MAINTENANCE_NOT_EDITABLE',
  'MAINTENANCE_NOT_ELIGIBLE',
  'MAINTENANCE_NOT_CANCELLABLE',
  'MAINTENANCE_ASSIGNEE_INVALID',
  'NOTIFICATION_NOT_FOUND',
] as const;
export type InvoiceErrorCode = (typeof INVOICE_ERROR_CODES)[number];

export const ADMIN_ERROR_CODES = [
  'PLATFORM_ADMIN_REQUIRED',
  'ADMIN_USER_NOT_FOUND',
  'ADMIN_TARGET_PROTECTED',
  'ADMIN_STATE_UNCHANGED',
] as const;
export type AdminErrorCode = (typeof ADMIN_ERROR_CODES)[number];

export const ONBOARDING_ERROR_CODES = [
  'LANDLORD_APPLICATION_PENDING',
  'LANDLORD_APPLICATION_NOT_FOUND',
  'LANDLORD_APPLICATION_INVALID_TRANSITION',
  'LANDLORD_APPLICATION_COOLDOWN',
  'LANDLORD_APPLICATION_REQUIRED',
  'TENANT_INVITATION_INVALID',
  'TENANT_INVITATION_CONFLICT',
] as const;
export type OnboardingErrorCode = (typeof ONBOARDING_ERROR_CODES)[number];

export const APPLICATION_ERROR_CODES = [
  ...AUTH_ERROR_CODES,
  ...WORKSPACE_ERROR_CODES,
  ...BUILDING_ERROR_CODES,
  ...ROOM_ERROR_CODES,
  ...LISTING_ERROR_CODES,
  ...VIEWING_REQUEST_ERROR_CODES,
  ...TENANT_ERROR_CODES,
  ...CONTRACT_ERROR_CODES,
  ...VEHICLE_ERROR_CODES,
  ...RATE_PLAN_ERROR_CODES,
  ...METER_READING_ERROR_CODES,
  ...INVOICE_ERROR_CODES,
  ...ADMIN_ERROR_CODES,
  ...ONBOARDING_ERROR_CODES,
] as const;
export type ApplicationErrorCode = (typeof APPLICATION_ERROR_CODES)[number];

export interface RegisterRequest {
  email: string;
  password: string;
  displayName?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthUserResponse {
  id: string;
  email: string;
  displayName: string | null;
  status: UserStatus;
  createdAt: string;
}

export interface AuthTokenResponse {
  accessToken: string;
  expiresIn: 600;
  user: AuthUserResponse;
}

export interface CreateWorkspaceRequest {
  name: string;
}

export const MANAGEABLE_WORKSPACE_ROLES = ['MANAGER', 'STAFF'] as const;
export type ManageableWorkspaceRole = (typeof MANAGEABLE_WORKSPACE_ROLES)[number];

export interface AddWorkspaceMemberRequest {
  email: string;
  role: ManageableWorkspaceRole;
}

export interface UpdateWorkspaceMemberRequest {
  role: ManageableWorkspaceRole;
}

export interface TransferWorkspaceOwnershipRequest {
  targetMembershipId: string;
}

export interface WorkspaceMemberResponse {
  id: string;
  role: WorkspaceRole;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    displayName: string | null;
  };
}

export interface WorkspaceResponse {
  id: string;
  name: string;
  status: WorkspaceStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  currentMembership: {
    role: WorkspaceRole;
  };
}

export const LANDLORD_APPLICATION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type LandlordApplicationStatus = (typeof LANDLORD_APPLICATION_STATUSES)[number];
export interface LandlordApplicationRequest {
  reason: string;
}
export interface LandlordApplicationDecisionRequest {
  note?: string;
}
export interface LandlordApplicationResponse {
  id: string;
  status: LandlordApplicationStatus;
  reason: string;
  decisionNote: string | null;
  decidedByUserId: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface UserCapabilitiesResponse {
  workspaces: Array<{ id: string; name: string; status: WorkspaceStatus; role: WorkspaceRole }>;
  tenantLinks: Array<{
    tenantId: string;
    workspaceId: string;
    tenantName: string;
    workspaceName: string;
  }>;
  isPlatformAdmin: boolean;
  landlordApplication: LandlordApplicationResponse | null;
}
export interface TenantInvitationResponse {
  id: string;
  tenantId: string;
  workspaceId: string;
  token?: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export const BUILDING_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type BuildingStatus = (typeof BUILDING_STATUSES)[number];

export interface CreateBuildingRequest {
  name: string;
  description?: string;
  addressLine1: string;
  addressLine2?: string;
  ward?: string;
  district?: string;
  city: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
}

export interface UpdateBuildingRequest {
  name?: string;
  description?: string;
  addressLine1?: string;
  addressLine2?: string;
  ward?: string;
  district?: string;
  city?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
}

export interface BuildingResponse {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  status: BuildingStatus;
  archivedAt: string | null;
  addressLine1: string;
  addressLine2: string | null;
  ward: string | null;
  district: string | null;
  city: string;
  postalCode: string | null;
  countryCode: 'VN';
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  updatedAt: string;
}

export const ROOM_STATUSES = ['VACANT', 'OCCUPIED', 'UNAVAILABLE', 'ARCHIVED'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];
export const MANAGEABLE_ROOM_STATUSES = ['VACANT', 'UNAVAILABLE'] as const;
export type ManageableRoomStatus = (typeof MANAGEABLE_ROOM_STATUSES)[number];

export interface CreateRoomRequest {
  code: string;
  areaSqm: string;
  monthlyRent: string;
  maxOccupants?: number;
  description?: string;
  status?: ManageableRoomStatus;
}

export interface UpdateRoomRequest {
  code?: string;
  areaSqm?: string;
  monthlyRent?: string;
  maxOccupants?: number;
  description?: string;
  status?: ManageableRoomStatus;
}

export interface CreateAmenityRequest {
  name: string;
  description?: string;
}

export interface AmenityResponse {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoomResponse {
  id: string;
  workspaceId: string;
  buildingId: string;
  code: string;
  areaSqm: string;
  monthlyRent: string;
  maxOccupants: number;
  description: string | null;
  status: RoomStatus;
  archivedAt: string | null;
  amenities: AmenityResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface AddRoomImageRequest {
  url: string;
  altText?: string;
}

export interface ReorderRoomImagesRequest {
  imageIds: string[];
}

export interface RoomImageResponse {
  id: string;
  workspaceId: string;
  roomId: string;
  url: string;
  altText: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SetListingPublicationRequest {
  published: boolean;
}

export interface ListingManagementResponse {
  id: string;
  roomId: string;
  published: boolean;
  publishedAt: string | null;
  unpublishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicListingImageResponse {
  id: string;
  url: string;
  altText: string | null;
  sortOrder: number;
}

export interface PublicListingResponse {
  id: string;
  publishedAt: string;
  room: {
    id: string;
    code: string;
    areaSqm: string;
    monthlyRent: string;
    maxOccupants: number;
    description: string | null;
    amenities: Array<{ id: string; name: string }>;
    images: PublicListingImageResponse[];
  };
  building: {
    id: string;
    name: string;
    addressLine1: string;
    addressLine2: string | null;
    ward: string | null;
    district: string | null;
    city: string;
    postalCode: string | null;
    countryCode: 'VN';
  };
}

export interface PublicListingPageResponse {
  items: PublicListingResponse[];
  page: number;
  limit: number;
  total: number;
}

export const VIEWING_REQUEST_STATUSES = ['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED'] as const;
export type ViewingRequestStatus = (typeof VIEWING_REQUEST_STATUSES)[number];

export interface CreateViewingRequestRequest {
  scheduledAt: string;
  message?: string;
}

export interface DecideViewingRequestRequest {
  note?: string;
}

export interface ViewingRequestResponse {
  id: string;
  listingId: string;
  scheduledAt: string;
  message: string | null;
  status: ViewingRequestStatus;
  decisionNote: string | null;
  decidedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  requester: {
    id: string;
    email: string;
    displayName: string | null;
  };
  room: {
    id: string;
    code: string;
    buildingName: string;
  };
}

export interface ViewingRequestPageResponse {
  items: ViewingRequestResponse[];
  page: number;
  limit: number;
  total: number;
}

export const TENANT_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export interface CreateTenantRequest {
  fullName: string;
  phone?: string;
  email?: string;
  dateOfBirth?: string;
  address?: string;
  notes?: string;
}

export interface UpdateTenantRequest {
  fullName?: string;
  phone?: string | null;
  email?: string | null;
  dateOfBirth?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface TenantResponse {
  id: string;
  workspaceId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  dateOfBirth: string | null;
  address: string | null;
  notes: string | null;
  status: TenantStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenantPageResponse {
  items: TenantResponse[];
  page: number;
  limit: number;
  total: number;
}

export const TENANT_LINK_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type TenantLinkRequestStatus = (typeof TENANT_LINK_REQUEST_STATUSES)[number];

export interface CreateTenantLinkRequest {
  message?: string;
}

export interface DecideTenantLinkRequest {
  note?: string;
}

export interface RevokeTenantLinkRequest {
  reason?: string;
}

export interface TenantLinkRequestResponse {
  id: string;
  workspaceId: string;
  tenantId: string;
  requesterUserId: string;
  status: TenantLinkRequestStatus;
  message: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tenant: { id: string; fullName: string };
  requester: { id: string; email: string; displayName: string | null };
}

export interface TenantUserLinkResponse {
  id: string;
  workspaceId: string;
  tenantId: string;
  userId: string;
  linkedAt: string;
  revokedAt: string | null;
}

/** ACTIVE account link of a tenant profile, as seen by the workspace OWNER (carries the id needed to revoke it). */
export interface TenantAccountLinkResponse extends TenantUserLinkResponse {
  user: { id: string; email: string; displayName: string | null };
}

export type TenantSelfResponse = Omit<TenantResponse, 'notes'>;

export interface TenantLinkRequestPageResponse {
  items: TenantLinkRequestResponse[];
  page: number;
  limit: number;
  total: number;
}

export const CONTRACT_STATUSES = ['ACTIVE', 'ENDED'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

/** Business calendar of every contract date (V1): Vietnam time, UTC+7, no DST. */
export const BUSINESS_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/**
 * Derived, never stored. Stored lifecycle stays ACTIVE/ENDED; the phase comes from the dates:
 * UPCOMING = ACTIVE before startDate; IN_EFFECT = ACTIVE within [startDate, endDate];
 * OVERDUE = ACTIVE after endDate (the OWNER has not ended it yet, nothing closes it automatically);
 * ENDED = ended on/after startDate; CANCELLED = ended before its startDate (never took effect).
 */
export const CONTRACT_PHASES = ['UPCOMING', 'IN_EFFECT', 'OVERDUE', 'ENDED', 'CANCELLED'] as const;
export type ContractPhase = (typeof CONTRACT_PHASES)[number];

/** Calendar date (YYYY-MM-DD) of an instant in the business time zone. */
export function businessDateOf(instant: Date | number | string = Date.now()): string {
  const ms = instant instanceof Date ? instant.getTime() : new Date(instant).getTime();
  return new Date(ms + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** True when the contract was ended before its startDate, i.e. it never took effect. */
export function isCancelledBeforeStart(contract: {
  status: ContractStatus;
  startDate: string;
  endedAt: string | Date | null;
}): boolean {
  return (
    contract.status === 'ENDED' &&
    contract.endedAt != null &&
    businessDateOf(contract.endedAt) < contract.startDate
  );
}

/** `today` is a business date (YYYY-MM-DD); ISO dates compare correctly as strings. */
export function contractPhase(
  contract: {
    status: ContractStatus;
    startDate: string;
    endDate: string;
    endedAt: string | Date | null;
  },
  today: string,
): ContractPhase {
  if (contract.status === 'ENDED') return isCancelledBeforeStart(contract) ? 'CANCELLED' : 'ENDED';
  if (today < contract.startDate) return 'UPCOMING';
  if (today > contract.endDate) return 'OVERDUE';
  return 'IN_EFFECT';
}

export interface CreateContractRequest {
  roomId: string;
  tenantId: string;
  startDate: string;
  endDate: string;
  monthlyRent: string;
  notes?: string;
}

export interface UpdateContractRequest {
  startDate?: string;
  endDate?: string;
  monthlyRent?: string;
  notes?: string | null;
}

export interface EndContractRequest {
  /**
   * Required to end a contract that has started (between startDate and today). Must be omitted
   * to cancel a contract that has not started yet: its registered period is kept unchanged.
   */
  endDate?: string;
}

export interface ContractResponse {
  id: string;
  workspaceId: string;
  roomId: string;
  tenantId: string;
  startDate: string;
  endDate: string;
  monthlyRent: string;
  status: ContractStatus;
  /** Derived from the dates in the business time zone; see {@link CONTRACT_PHASES}. */
  phase: ContractPhase;
  notes: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  room: { id: string; code: string; buildingId: string };
  tenant: { id: string; fullName: string };
}

export interface ContractPageResponse {
  items: ContractResponse[];
  page: number;
  limit: number;
  total: number;
}
export type MyContractPageResponse = ContractPageResponse;

export const VEHICLE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export interface CreateVehicleRequest {
  tenantId: string;
  licensePlate: string;
  vehicleType: string;
  brand?: string;
  model?: string;
  color?: string;
  notes?: string;
}

export interface UpdateVehicleRequest {
  licensePlate?: string;
  vehicleType?: string;
  brand?: string | null;
  model?: string | null;
  color?: string | null;
  notes?: string | null;
}

export interface StopVehicleRequest {
  reason?: string;
}

export interface VehicleResponse {
  id: string;
  workspaceId: string;
  tenantId: string;
  licensePlate: string;
  vehicleType: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  notes: string | null;
  status: VehicleStatus;
  inactiveAt: string | null;
  inactiveReason: string | null;
  createdAt: string;
  updatedAt: string;
  tenant: { id: string; fullName: string };
}

export interface VehiclePageResponse {
  items: VehicleResponse[];
  page: number;
  limit: number;
  total: number;
}

export const RATE_SERVICE_TYPES = [
  'ELECTRICITY',
  'WATER',
  'WIFI',
  'TRASH',
  'PARKING',
  'OTHER',
] as const;
export type RateServiceType = (typeof RATE_SERVICE_TYPES)[number];
export const RATE_BILLING_UNITS = [
  'KWH',
  'CUBIC_METER',
  'ROOM',
  'PERSON',
  'VEHICLE',
  'FIXED',
] as const;
export type RateBillingUnit = (typeof RATE_BILLING_UNITS)[number];
export const RATE_PLAN_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type RatePlanStatus = (typeof RATE_PLAN_STATUSES)[number];

export interface CreateRatePlanRequest {
  code: string;
  name: string;
  serviceType: RateServiceType;
  billingUnit: RateBillingUnit;
  unitPrice: string;
  effectiveFrom: string;
}
export interface UpdateRatePlanRequest {
  name?: string;
  serviceType?: RateServiceType;
  billingUnit?: RateBillingUnit;
  unitPrice: string;
  effectiveFrom: string;
}
export interface StopRatePlanRequest {
  effectiveTo: string;
}
export interface RatePlanResponse {
  id: string;
  workspaceId: string;
  buildingId: string;
  code: string;
  name: string;
  serviceType: RateServiceType;
  billingUnit: RateBillingUnit;
  unitPrice: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: RatePlanStatus;
  createdAt: string;
  updatedAt: string;
}
export interface RatePlanPageResponse {
  items: RatePlanResponse[];
  page: number;
  limit: number;
  total: number;
}

export const METER_TYPES = ['ELECTRICITY', 'WATER'] as const;
export type MeterType = (typeof METER_TYPES)[number];

export interface CreateMeterReadingRequest {
  meterType: MeterType;
  /** Billing period as YYYY-MM. */
  period: string;
  /** Required for the first reading of a room/meter; must match the previous period otherwise. */
  previousReading?: string;
  currentReading: string;
}
export interface AdjustMeterReadingRequest {
  currentReading: string;
  /** Only accepted while no earlier period exists for the room/meter. */
  previousReading?: string;
  reason: string;
}
export interface MeterReadingAdjustmentResponse {
  id: string;
  revision: number;
  oldPreviousReading: string;
  oldCurrentReading: string;
  newPreviousReading: string;
  newCurrentReading: string;
  reason: string;
  adjustedBy: string;
  createdAt: string;
}
export interface MeterReadingResponse {
  id: string;
  workspaceId: string;
  buildingId: string;
  roomId: string;
  meterType: MeterType;
  period: string;
  previousReading: string;
  currentReading: string;
  consumption: string;
  revision: number;
  recordedBy: string;
  adjustments: MeterReadingAdjustmentResponse[];
  createdAt: string;
  updatedAt: string;
}
export interface MeterReadingPageResponse {
  items: MeterReadingResponse[];
  page: number;
  limit: number;
  total: number;
}

export const INVOICE_STATUSES = ['DRAFT', 'ISSUED'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const INVOICE_ITEM_TYPES = ['RENT', 'ELECTRICITY', 'WATER', 'SERVICE', 'VEHICLE'] as const;
export type InvoiceItemType = (typeof INVOICE_ITEM_TYPES)[number];
export const INVOICE_MISSING_REASONS = [
  'METER_READING_MISSING',
  'OCCUPANT_COUNT_MISSING',
  'RATE_PERIOD_MISMATCH',
  'WATER_METHOD_CONFLICT',
  'RATE_UNIT_UNSUPPORTED',
  'RATE_MISSING',
  'RATE_SEGMENT_CONSUMPTION_UNKNOWN',
  'RATE_CHANGE_NOT_SPLITTABLE',
  'VEHICLE_BILLING_AMBIGUOUS',
] as const;
export type InvoiceMissingReason = (typeof INVOICE_MISSING_REASONS)[number];

export interface InvoiceMissingItem {
  code: string;
  reason: InvoiceMissingReason;
  detail?: string;
}
export interface CreateInvoiceRequest {
  contractId: string;
  /** Billing month as YYYY-MM (Asia/Ho_Chi_Minh calendar month). */
  period: string;
  /** Manager-confirmed headcount for the period; needed only for PERSON-based rates. */
  occupantCount?: number;
  /** Required only when the tenant has several contracts in the period: true bills the tenant vehicles on this invoice. */
  billVehicles?: boolean;
  dueDate?: string;
  notes?: string;
}
export interface UpdateInvoiceRequest {
  occupantCount?: number;
  billVehicles?: boolean;
  dueDate?: string;
  notes?: string;
}
export interface InvoiceItemResponse {
  id: string;
  sortOrder: number;
  itemType: InvoiceItemType;
  code: string;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  prorationNumerator: number | null;
  prorationDenominator: number | null;
  amount: string;
  ratePlanId: string | null;
  meterReadingId: string | null;
  meterRevision: number | null;
  details: Record<string, unknown>;
}
export interface InvoiceResponse {
  id: string;
  workspaceId: string;
  buildingId: string;
  roomId: string;
  contractId: string;
  period: string;
  status: InvoiceStatus;
  tenantId: string;
  occupantCount: number | null;
  occupantCountConfirmedBy: string | null;
  occupantCountConfirmedAt: string | null;
  /** null = not yet decided (tenant has several contracts in the period). */
  billsVehicles: boolean | null;
  dueDate: string | null;
  notes: string | null;
  missingItems: InvoiceMissingItem[];
  isComplete: boolean;
  /** Final total; only set once ISSUED. */
  totalAmount: string | null;
  /** Sum of the items computed so far on a DRAFT; never a final amount. */
  provisionalAmount: string | null;
  roundingRule: string;
  /** Sum of adjustments; only for ISSUED invoices. */
  adjustmentsTotal: string | null;
  /** totalAmount + adjustmentsTotal; only for ISSUED invoices. */
  adjustedTotal: string | null;
  /** Confirmed payments minus reversals; ISSUED only. */
  paidTotal: string | null;
  /** adjustedTotal - paidTotal, never negative; ISSUED only. */
  outstanding: string | null;
  paymentStatus: PaymentStatus | null;
  items: InvoiceItemResponse[];
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface InvoicePageResponse {
  items: InvoiceResponse[];
  page: number;
  limit: number;
  total: number;
}

export interface CreateRoomServiceRequest {
  /** Building Rate code that applies to the room. */
  rateCode: string;
  effectiveFrom: string;
}
export interface StopRoomServiceRequest {
  /** Exclusive end date. */
  effectiveTo: string;
}
export interface RoomServiceResponse {
  id: string;
  workspaceId: string;
  buildingId: string;
  roomId: string;
  rateCode: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdBy: string;
  endedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvoiceAdjustmentRequest {
  /** Signed VND amount (up to 4 decimals, rounded ROUND_HALF_UP to 1 VND); positive charges more, negative credits. Never 0. */
  amount: string;
  reason: string;
  /** Client-generated key; retrying with the same key and payload returns the original adjustment. */
  idempotencyKey: string;
  /** Earlier adjustment of the same invoice that this one corrects. */
  referenceAdjustmentId?: string;
}
export interface InvoiceAdjustmentResponse {
  id: string;
  workspaceId: string;
  invoiceId: string;
  amount: string;
  requestedAmount: string;
  reason: string;
  referenceAdjustmentId: string | null;
  createdBy: string;
  createdAt: string;
}
export interface InvoiceAdjustmentPageResponse {
  items: InvoiceAdjustmentResponse[];
  page: number;
  limit: number;
  total: number;
  originalTotal: string;
  adjustmentsTotal: string;
  adjustedTotal: string;
}

export const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_ENTRY_KINDS = ['PAYMENT', 'REVERSAL'] as const;
export type PaymentEntryKind = (typeof PAYMENT_ENTRY_KINDS)[number];
export const PAYMENT_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'PAID'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface CreateInvoicePaymentRequest {
  /** Whole VND, > 0. */
  amount: string;
  method: PaymentMethod;
  /** When the money was received (ISO 8601, not in the future). */
  receivedAt: string;
  note?: string;
  /** Client-generated retry key. */
  idempotencyKey: string;
}
export interface ReverseInvoicePaymentRequest {
  /** Why the confirmation is being undone (required, kept in the audit trail). */
  reason: string;
  idempotencyKey: string;
}
export interface InvoicePaymentResponse {
  id: string;
  workspaceId: string;
  invoiceId: string;
  kind: PaymentEntryKind;
  amount: string;
  method: PaymentMethod;
  receivedAt: string;
  note: string | null;
  /** For a REVERSAL: the payment it undoes. */
  reversesPaymentId: string | null;
  /** For a PAYMENT: the reversal entry that undid it, if any. */
  reversedByPaymentId: string | null;
  confirmedBy: string;
  createdAt: string;
}
export interface InvoicePaymentPageResponse {
  items: InvoicePaymentResponse[];
  page: number;
  limit: number;
  total: number;
  amountDue: string;
  paidTotal: string;
  outstanding: string;
  paymentStatus: PaymentStatus;
}

export const DEPOSIT_ENTRY_KINDS = ['COLLECTION', 'DEDUCTION', 'REFUND', 'REVERSAL'] as const;
export type DepositEntryKind = (typeof DEPOSIT_ENTRY_KINDS)[number];
export const DEPOSIT_RECORDABLE_KINDS = ['COLLECTION', 'DEDUCTION', 'REFUND'] as const;
export type DepositRecordableKind = (typeof DEPOSIT_RECORDABLE_KINDS)[number];

export interface CreateDepositEntryRequest {
  /** COLLECTION = deposit received, DEDUCTION = amount withheld, REFUND = money actually handed back. */
  kind: DepositRecordableKind;
  /** Whole VND, > 0. */
  amount: string;
  /** Required for COLLECTION and REFUND; not allowed for DEDUCTION. */
  method?: PaymentMethod;
  /** When it happened (ISO 8601, not in the future). */
  occurredAt: string;
  /** Required for DEDUCTION and REFUND. */
  reason?: string;
  /** Required for DEDUCTION (what it refers to, e.g. a damage report) and REFUND (transfer code or cash receipt number); optional for COLLECTION. */
  reference?: string;
  note?: string;
  idempotencyKey: string;
}
export interface ReverseDepositEntryRequest {
  reason: string;
  idempotencyKey: string;
}
export interface DepositEntryResponse {
  id: string;
  workspaceId: string;
  contractId: string;
  kind: DepositEntryKind;
  amount: string;
  method: PaymentMethod | null;
  occurredAt: string;
  reason: string | null;
  reference: string | null;
  note: string | null;
  reversesEntryId: string | null;
  reversedByEntryId: string | null;
  createdBy: string;
  createdAt: string;
}
export interface DepositSummaryResponse {
  contractId: string;
  /** Net of reversals. */
  collectedTotal: string;
  deductedTotal: string;
  refundedTotal: string;
  /** collected - deducted - refunded; never negative. */
  balance: string;
}
export interface DepositPageResponse extends DepositSummaryResponse {
  items: DepositEntryResponse[];
  page: number;
  limit: number;
  total: number;
}

export const MAINTENANCE_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'CANCELLED',
] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];
export const MAINTENANCE_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type MaintenancePriority = (typeof MAINTENANCE_PRIORITIES)[number];
/** Forward-only lifecycle; no skipping, no reopening. */
export const MAINTENANCE_TRANSITIONS: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  OPEN: ['IN_PROGRESS'],
  IN_PROGRESS: ['RESOLVED'],
  RESOLVED: ['CLOSED'],
  CLOSED: [],
  /** Terminal; reached only through the tenant cancel endpoint, never a manager transition. */
  CANCELLED: [],
};

export interface CreateMaintenanceRequestRequest {
  roomId: string;
  title: string;
  description: string;
  priority?: MaintenancePriority;
}
export interface CreateTenantMaintenanceRequest {
  /** The tenant's own ACTIVE contract; the room is taken from it. */
  contractId: string;
  title: string;
  description: string;
  priority?: MaintenancePriority;
}
export interface UpdateMaintenanceRequestRequest {
  title?: string;
  description?: string;
  priority?: MaintenancePriority;
  note?: string;
}
export interface TransitionMaintenanceRequest {
  toStatus: MaintenanceStatus;
  /** Required for RESOLVED (becomes the resolution note); optional otherwise. */
  note?: string;
}
export interface MaintenanceHistoryResponse {
  id: string;
  fromStatus: MaintenanceStatus | null;
  toStatus: MaintenanceStatus;
  priority: MaintenancePriority;
  /** Hidden from tenants. */
  assigneeUserId: string | null;
  note: string | null;
  /** Hidden from tenants. */
  changedBy: string | null;
  createdAt: string;
}
export interface MaintenanceRequestResponse {
  id: string;
  workspaceId: string;
  buildingId: string;
  roomId: string;
  contractId: string | null;
  tenantId: string | null;
  requestedBy: string | null;
  title: string;
  description: string;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  /** Hidden from tenants. */
  assigneeUserId: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  history?: MaintenanceHistoryResponse[];
}
export interface MaintenanceRequestPageResponse {
  items: MaintenanceRequestResponse[];
  page: number;
  limit: number;
  total: number;
}

export const NOTIFICATION_TYPES = [
  'VIEWING_REQUESTED',
  'VIEWING_CONFIRMED',
  'VIEWING_REJECTED',
  'VIEWING_CANCELLED',
  'MAINTENANCE_CREATED',
  'MAINTENANCE_STATUS_CHANGED',
  'INVOICE_ISSUED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export interface NotificationResponse {
  id: string;
  workspaceId: string;
  type: NotificationType;
  entityType: string;
  entityId: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
}
export interface NotificationPageResponse {
  items: NotificationResponse[];
  page: number;
  limit: number;
  total: number;
}
export interface UnreadCountResponse {
  unread: number;
}
export interface MarkAllReadResponse {
  updated: number;
}

/** Money amounts are whole-VND decimal strings. */
export interface DashboardResponse {
  workspaceId: string;
  buildingId: string | null;
  /** YYYY-MM, Asia/Ho_Chi_Minh. Drives `invoices.issuedInPeriod` and `revenue.collected`. */
  period: string;
  rooms: { total: number; vacant: number; occupied: number; unavailable: number };
  contracts: {
    /** Lifecycle ACTIVE (includes upcoming and overdue). */
    active: number;
    ended: number;
    expiringWithin30Days: number;
    /** ACTIVE and today within [startDate, endDate]. */
    inEffect: number;
    /** ACTIVE and not started yet. */
    upcoming: number;
    /** ACTIVE and past endDate, not yet ended by the OWNER. */
    overdue: number;
  };
  invoices: {
    draft: number;
    issued: number;
    issuedInPeriod: number;
    /** Sum of ISSUED invoice totals plus adjustments for the period. */
    billedInPeriod: string;
    unpaid: number;
    partiallyPaid: number;
    paid: number;
  };
  revenue: {
    /** Payments minus reversals received in the period; deposits are never included. */
    collected: string;
  };
  receivables: {
    /** Amount due minus net paid over every ISSUED invoice that still owes money. */
    outstanding: string;
    overdueInvoices: number;
    overdueOutstanding: string;
  };
  maintenance: {
    open: number;
    inProgress: number;
    resolved: number;
    closed: number;
    cancelled: number;
  };
}

export interface AdminReasonRequest {
  reason: string;
}
export interface AdminUserResponse {
  id: string;
  email: string;
  displayName: string | null;
  status: 'ACTIVE' | 'DISABLED';
  isPlatformAdmin: boolean;
  disabledAt: string | null;
  createdAt: string;
}
export interface AdminUserDetailResponse extends AdminUserResponse {
  workspaceMembershipCount: number;
  activeSessionCount: number;
  /** Most recent LOCK/UNLOCK reason recorded in the audit log. */
  lastModerationReason: string | null;
}
export interface AdminUserPageResponse {
  items: AdminUserResponse[];
  page: number;
  limit: number;
  total: number;
}
export interface AdminListingResponse {
  id: string;
  workspaceId: string;
  roomId: string;
  roomCode: string;
  buildingName: string;
  city: string;
  monthlyRent: string;
  isPublished: boolean;
  isHidden: boolean;
  moderationReason: string | null;
  moderatedAt: string | null;
}
export interface AdminListingPageResponse {
  items: AdminListingResponse[];
  page: number;
  limit: number;
  total: number;
}
export interface AdminAuditLogResponse {
  id: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
}
export interface AdminAuditLogPageResponse {
  items: AdminAuditLogResponse[];
  page: number;
  limit: number;
  total: number;
}

export interface CancelMaintenanceRequest {
  reason?: string;
}

export interface ForgotPasswordRequest {
  email: string;
}
export interface ForgotPasswordResponse {
  /** Always true: the response is identical whether or not the account exists. */
  accepted: true;
}
export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}
