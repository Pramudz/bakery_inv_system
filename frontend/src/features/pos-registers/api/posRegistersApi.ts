import {
  apiClient,
  POS_TERMINAL_CREDENTIAL_KEY,
} from "../../../services/apiClient";

export type RegisterMode = "TERMINAL_REGISTER" | "MASTER_REGISTER";
export type PosPage<T> = { items: T[]; page: number; limit: number; total: number };
export type PosVerificationType = "ALL" | "TERMINAL_CASH_COUNT" | "MASTER_CASH_BATCH" | "MASTER_REGISTER_COUNT";
export type PosVerificationRow = { verificationType: Exclude<PosVerificationType, "ALL">; sourceId: number; locationId: number; locationName: string; locationCode: string; terminalCode: string | null; terminalName: string | null; cashierName: string; registerName: string; attemptNumber: number; submittedAt: string; expectedCash: number; countedCash: number | null; status: "PENDING_VERIFICATION" | "APPROVED" | "REJECTED" };
export type PosListParams = { page?: number; limit?: 20 | 50 | 100; search?: string; locationId?: number; status?: string; mode?: string; type?: PosVerificationType; dateFrom?: string; dateTo?: string };
const queryString = (params: PosListParams & { kind?: string } = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== "") query.set(key, String(value)); });
  return query.toString();
};
export type PosLocationSetup = {
  location: {
    locationId: number;
    code: string;
    name: string;
    isActive: boolean;
  };
  config: {
    posLocationConfigId: number;
    locationId: number;
    registerMode: RegisterMode;
    createdAt: string;
    updatedAt: string | null;
  } | null;
};
export type PosTerminal = {
  posTerminalId: number;
  locationId: number;
  terminalCode: string;
  displayName: string;
  isActive: boolean;
  activePairingCount: number;
  location?: {
    locationId: number;
    code: string;
    name: string;
    isActive: boolean;
  };
};
export type PosPairing = {
  posTerminalPairingId: number;
  posTerminalId: number;
  pairedAt: string;
  pairedByUserId: number;
  pairedByUsername?: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  revokedByUsername?: string;
  revocationReason: string | null;
};
export type CurrentPairing =
  | { paired: false }
  | { paired: true; terminal: PosTerminal; pairing: PosPairing };

export type PosSessionContext = {
  location: {
    locationId: number;
    code: string;
    name: string;
    isActive: boolean;
  };
  config: { posLocationConfigId: number; registerMode: RegisterMode } | null;
  pairingValid: boolean;
  terminal: PosTerminal | null;
  register: {
    posCashRegisterId: number;
    locationId: number;
    posTerminalId: number | null;
    registerMode: RegisterMode;
    displayName: string;
    isActive: boolean;
  } | null;
  registerSession: {
    posRegisterSessionId: number;
    businessDate: string;
    openingBalance: string;
    openedAt: string;
    status: "OPEN" | "PENDING_VERIFICATION" | "RECOUNT_REQUIRED" | "CLOSED";
  } | null;
  cashierSession: {
    posCashierSessionId: number;
    cashierUserId: number;
    posTerminalId: number;
    startedAt: string;
    status: "ACTIVE" | "PENDING_VERIFICATION" | "RECOUNT_REQUIRED" | "ENDED";
  } | null;
  canBill: boolean;
  action:
    | "CONFIGURE_LOCATION"
    | "PAIR_TERMINAL"
    | "OPEN_TERMINAL_REGISTER"
    | "OPEN_MASTER_REGISTER"
    | "START_CASHIER_SESSION"
    | "RECOUNT_CASH"
    | null;
  blockedReason: string | null;
};

export type CashSummary = {
  posRegisterSessionId: number;
  posCashierSessionId: number;
  registerMode: RegisterMode;
  businessDate: string;
  openingBalance: number;
  cash: {
    sales: { tendered: number; applied: number; change: number; net: number };
    collections: { tendered: number; applied: number; change: number; net: number };
    received: { tendered: number; applied: number; change: number; net: number };
    movementIn: number;
    paidOut: number;
  };
  cardsByChannel: { channel: string; amount: number }[];
  chequeTotal: number;
  reversedPayments: { count: number; amount: number };
  creditSales: { count: number; originalTotal: number; originalCreditExtended: number; outstanding: number };
  refunds: { count: number; total: number; paid: number };
  receiptReferences?: { sales: { businessDate: string; locationCode: string; registerCode: string; billNo: number }[]; refunds: { businessDate: string; locationCode: string; refundNo: number }[] };
  expectedNetContribution: number;
  unconfirmedMasterCash: number | null;
  expectedCash: number;
  formula: string;
};

export type CashReconciliation = {
  posCashReconciliationId: number;
  reconciliationType: "TERMINAL_CASH_COUNT" | "MASTER_CASH_BATCH";
  locationId: number;
  location?: { locationId: number; code: string; name: string };
  registerSession?: { posRegisterSessionId: number; businessDate: string; openingBalance: string; status: string; register?: { displayName: string; registerMode: RegisterMode } };
  cashierSession?: { posCashierSessionId: number; cashierUserId: number; cashierName?: string; terminal?: { terminalCode: string; displayName: string }; status: string };
  attemptNumber: number;
  openingBalance: number;
  cashReceived: number;
  cashPaidOut: number;
  expectedCash: number;
  countedCash: number | null;
  cashierVariance: number | null;
  summary: CashSummary;
  submittedAt: string;
  status: "PENDING_VERIFICATION" | "APPROVED" | "REJECTED";
  verifiedCountedCash: number | null;
  verifiedVariance: number | null;
  confirmedNetCash: number | null;
  confirmationVariance: number | null;
  physicalRecipientIdentity: string | null;
  verificationReason: string | null;
  rejectionReason: string | null;
};

export type MasterClosingSummary = {
  locationId: number;
  posRegisterSessionId: number;
  businessDate: string;
  registerStatus: "OPEN" | "PENDING_VERIFICATION" | "RECOUNT_REQUIRED";
  openingBalance: number;
  cashReceipts: { tendered: number; applied: number; change: number; net: number };
  movements: { in: number; out: number; directMasterIn: number; directMasterOut: number; rows: Array<{ id: number; fundingSource: "CASHIER_SESSION" | "MASTER_REGISTER"; cashierSessionId: number | null; type: string; direction: "IN" | "OUT"; amount: number; sourceType: string; sourceId: number; reason: string; physicalPayerIdentity: string | null; occurredAt: string }> };
  approvedBatches: Array<{ posCashReconciliationId: number; posCashierSessionId: number; expectedContribution: number; confirmedContribution: number; confirmationDifference: number; recipientIdentity: string; verifiedAt: string }>;
  confirmedBatchContributions: number;
  batchConfirmationDifference: number;
  systemExpectedMasterCash: number;
  confirmedBatchCashBasis: number;
  systemVsConfirmedBasis: number;
  blockers: Array<{ code: string; message: string; ids: number[] }>;
  canSubmitCount: boolean;
};

export type MasterReconciliation = {
  posMasterReconciliationId: number;
  locationId: number;
  location?: { locationId: number; code: string; name: string };
  posRegisterSessionId: number;
  businessDate?: string;
  registerStatus?: string;
  attemptNumber: number;
  openingBalance: number;
  systemExpectedMasterCash: number;
  confirmedBatchCashBasis: number;
  batchConfirmationDifference: number;
  countedCash: number;
  countVsConfirmedBasis: number;
  countVsSystemExpected: number;
  summary: MasterClosingSummary;
  masterCashierIdentity: string;
  submittedByUsername?: string;
  submittedAt: string;
  status: "PENDING_VERIFICATION" | "APPROVED" | "REJECTED";
  verifiedCountedCash: number | null;
  verifiedVsConfirmedBasis: number | null;
  verifiedVsSystemExpected: number | null;
  rejectionReason: string | null;
};

export type PosManagementLocation = {
  locationId: number;
  code: string;
  name: string;
  registerMode: RegisterMode | null;
};

export type PosManagementOverview = {
  context: PosSessionContext;
  registers: Array<{
    posCashRegisterId: number;
    displayName: string;
    registerMode: RegisterMode;
    isActive: boolean;
    terminal: PosTerminal | null;
    session: null | { posRegisterSessionId: number; businessDate: string; openingBalance: number; openedAt: string; status: string; closedAt: string | null };
    nextAction: string;
  }>;
  cashierSessions: Array<{
    posCashierSessionId: number;
    posRegisterSessionId: number;
    cashierUserId: number;
    cashierName: string;
    terminal: PosTerminal;
    registerName?: string;
    registerMode: RegisterMode;
    startedAt: string;
    endedAt: string | null;
    status: "ACTIVE" | "PENDING_VERIFICATION" | "RECOUNT_REQUIRED" | "ENDED";
    reconciliation: null | { id: number; type: "TERMINAL_CASH_COUNT" | "MASTER_CASH_BATCH"; status: "PENDING_VERIFICATION" | "APPROVED" | "REJECTED"; attemptNumber: number };
    nextAction: string;
    isCurrentUser: boolean;
    isCurrentDevice: boolean;
  }>;
  terminals: Array<PosTerminal & { isCurrentDevice: boolean; available: boolean }>;
  sessionSummary: { currentCashiers: number; activeTerminals: number; availableTerminals: number };
  masterReadiness: MasterClosingSummary | null;
  verificationSummary: { cashierReconciliations: number; masterReconciliations: number; total: number };
};

export type PosManagementHistory = {
  page: number;
  limit: number;
  total: number;
  items: Array<Record<string, any>>;
};

export const posRegistersApi = {
  managementLocations: () => apiClient.get<PosManagementLocation[]>("/pos-register-management/locations"),
  managementOverview: (locationId: number) => apiClient.get<PosManagementOverview>(`/pos-register-management/overview?locationId=${locationId}`),
  managementHistory: (locationId: number, kind: string, params: PosListParams = {}) => apiClient.get<PosManagementHistory>(`/pos-register-management/history?${queryString({ ...params, locationId, kind })}`),
  cashierSessions: (locationId: number, params: PosListParams = {}) => apiClient.get<PosManagementHistory>(`/pos-register-management/cashier-sessions?${queryString({ ...params, locationId })}`),
  locationConfigs: (params: PosListParams = {}) =>
    apiClient.get<PosPage<PosLocationSetup>>(`/pos-registers/location-configs?${queryString(params)}`),
  configureLocation: (locationId: number, registerMode: RegisterMode) =>
    apiClient.put(`/pos-registers/locations/${locationId}/config`, {
      registerMode,
    }),
  terminals: (params: PosListParams = {}) => apiClient.get<PosPage<PosTerminal>>(`/pos-registers/terminals?${queryString(params)}`),
  createTerminal: (data: {
    locationId: number;
    terminalCode: string;
    displayName: string;
    isActive: boolean;
  }) => apiClient.post<PosTerminal>("/pos-registers/terminals", data),
  updateTerminal: (id: number, terminalCode: string, displayName: string) =>
    apiClient.put<PosTerminal>(`/pos-registers/terminals/${id}`, {
      terminalCode,
      displayName,
    }),
  setTerminalActive: (id: number, active: boolean) =>
    apiClient.patch<PosTerminal>(
      `/pos-registers/terminals/${id}/${active ? "activate" : "deactivate"}`,
    ),
  reassignTerminal: (id: number, locationId: number) =>
    apiClient.post<PosTerminal>(
      `/pos-registers/terminals/${id}/reassign-location`,
      { locationId },
    ),
  issueActivation: (id: number) =>
    apiClient.post<{
      posTerminalActivationId: number;
      posTerminalId: number;
      activationCode: string;
      expiresAt: string;
    }>(`/pos-registers/terminals/${id}/activation-codes`, {}),
  pairings: (id: number, params: PosListParams = {}) =>
    apiClient.get<PosPage<PosPairing>>(`/pos-registers/terminals/${id}/pairings?${queryString(params)}`),
  revokePairing: (terminalId: number, pairingId: number, reason?: string) =>
    apiClient.post<PosPairing>(
      `/pos-registers/terminals/${terminalId}/pairings/${pairingId}/revoke`,
      { reason },
    ),
  currentPairing: () =>
    apiClient.get<CurrentPairing>("/pos-terminal-pairing/current"),
  activateBrowser: async (activationCode: string) => {
    const result = await apiClient.post<{
      pairingCredential: string;
      terminal: PosTerminal;
      pairing: PosPairing;
    }>("/pos-terminal-pairing/activate", { activationCode });
    localStorage.setItem(POS_TERMINAL_CREDENTIAL_KEY, result.pairingCredential);
    return { terminal: result.terminal, pairing: result.pairing };
  },
  clearLocalPairing: () => localStorage.removeItem(POS_TERMINAL_CREDENTIAL_KEY),
  sessionContext: (locationId: number) =>
    apiClient.get<PosSessionContext>(
      `/pos-register-sessions/context?locationId=${locationId}`,
    ),
  openTerminalRegister: (openingBalance: number) =>
    apiClient.post("/pos-register-sessions/terminal/open", { openingBalance }),
  openMasterRegister: (locationId: number, openingBalance: number) =>
    apiClient.post("/pos-register-sessions/master/open", {
      locationId,
      openingBalance,
    }),
  startCashierSession: (locationId: number) =>
    apiClient.post("/pos-register-sessions/cashier/start", { locationId }),
  currentCashSummary: () =>
    apiClient.get<CashSummary>("/pos-register-closing/current-summary"),
  submitCashCount: (countedCash: number, submissionKey: string) =>
    apiClient.post<CashReconciliation>("/pos-register-closing/submit-count", { countedCash, submissionKey }),
  submitMasterCashBatch: (submissionKey: string) =>
    apiClient.post<CashReconciliation>("/pos-register-closing/submit-master-batch", { submissionKey }),
  verificationQueue: (params: PosListParams = {}) =>
    apiClient.get<PosPage<CashReconciliation>>(`/pos-register-closing/verification-queue?${queryString(params)}`),
  combinedVerificationQueue: (params: PosListParams = {}) =>
    apiClient.get<PosPage<PosVerificationRow>>(`/pos-register-management/verification-queue?${queryString(params)}`),
  reconciliation: (id: number) =>
    apiClient.get<CashReconciliation>(`/pos-register-closing/verification-queue/${id}`),
  decideReconciliation: (id: number, data: { verificationKey: string; decision: "APPROVE" | "REJECT"; verifiedCountedCash?: number; confirmedNetCash?: number; physicalRecipientIdentity?: string; verificationReason?: string; rejectionReason?: string }) =>
    apiClient.post<CashReconciliation>(`/pos-register-closing/verification-queue/${id}/decision`, data),
  masterClosingLocations: () => apiClient.get<Array<{ locationId: number; code: string; name: string }>>("/pos-master-closing/locations"),
  masterClosingSummary: (locationId: number) => apiClient.get<MasterClosingSummary>(`/pos-master-closing/summary?locationId=${locationId}`),
  masterClosingHistory: (locationId: number, params: PosListParams = {}) => apiClient.get<PosPage<MasterReconciliation>>(`/pos-master-closing/history?${queryString({ ...params, locationId })}`),
  submitMasterRegisterCount: (data: { locationId: number; posRegisterSessionId: number; submissionKey: string; countedCash: number; masterCashierIdentity: string }) => apiClient.post<MasterReconciliation>("/pos-master-closing/submit-count", data),
  masterVerificationQueue: (params: PosListParams = {}) => apiClient.get<PosPage<MasterReconciliation>>(`/pos-master-closing/verification-queue?${queryString(params)}`),
  masterReconciliation: (id: number) => apiClient.get<MasterReconciliation>(`/pos-master-closing/verification-queue/${id}`),
  decideMasterReconciliation: (id: number, data: { verificationKey: string; decision: "APPROVE" | "REJECT"; verifiedCountedCash: number; rejectionReason?: string }) => apiClient.post<MasterReconciliation>(`/pos-master-closing/verification-queue/${id}/decision`, data),
  recordMasterRefundPayout: (refundId: number, data: { payoutKey: string; locationId: number; posRegisterSessionId: number; paymentMethodId: number; amount: number; reason: string; physicalPayerIdentity: string }) => apiClient.post(`/invoice-refunds/${refundId}/master-payout`, data),
  recordMasterReversalPayout: (reversalId: number, data: { payoutKey: string; locationId: number; posRegisterSessionId: number; amount: number; reason: string; physicalPayerIdentity: string }) => apiClient.post(`/invoice-payment-reversals/${reversalId}/master-payout`, data),
};
