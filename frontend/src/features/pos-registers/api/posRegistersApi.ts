import {
  apiClient,
  POS_TERMINAL_CREDENTIAL_KEY,
} from "../../../services/apiClient";

export type RegisterMode = "TERMINAL_REGISTER" | "MASTER_REGISTER";
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

export const posRegistersApi = {
  locationConfigs: () =>
    apiClient.get<PosLocationSetup[]>("/pos-registers/location-configs"),
  configureLocation: (locationId: number, registerMode: RegisterMode) =>
    apiClient.put(`/pos-registers/locations/${locationId}/config`, {
      registerMode,
    }),
  terminals: () => apiClient.get<PosTerminal[]>("/pos-registers/terminals"),
  createTerminal: (data: {
    locationId: number;
    terminalCode: string;
    displayName: string;
  }) => apiClient.post<PosTerminal>("/pos-registers/terminals", data),
  updateTerminal: (id: number, displayName: string) =>
    apiClient.put<PosTerminal>(`/pos-registers/terminals/${id}`, {
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
  pairings: (id: number) =>
    apiClient.get<PosPairing[]>(`/pos-registers/terminals/${id}/pairings`),
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
  startCashierSession: () =>
    apiClient.post("/pos-register-sessions/cashier/start", {}),
  currentCashSummary: () =>
    apiClient.get<CashSummary>("/pos-register-closing/current-summary"),
  submitCashCount: (countedCash: number, submissionKey: string) =>
    apiClient.post<CashReconciliation>("/pos-register-closing/submit-count", { countedCash, submissionKey }),
  submitMasterCashBatch: (submissionKey: string) =>
    apiClient.post<CashReconciliation>("/pos-register-closing/submit-master-batch", { submissionKey }),
  verificationQueue: () =>
    apiClient.get<CashReconciliation[]>("/pos-register-closing/verification-queue"),
  reconciliation: (id: number) =>
    apiClient.get<CashReconciliation>(`/pos-register-closing/verification-queue/${id}`),
  decideReconciliation: (id: number, data: { verificationKey: string; decision: "APPROVE" | "REJECT"; verifiedCountedCash?: number; confirmedNetCash?: number; physicalRecipientIdentity?: string; verificationReason?: string; rejectionReason?: string }) =>
    apiClient.post<CashReconciliation>(`/pos-register-closing/verification-queue/${id}/decision`, data),
};
