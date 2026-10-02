import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../../../components/ui/Modal";
import { useAuth } from "../../auth/AuthContext";
import {
  PosTerminal,
  RegisterMode,
  posRegistersApi,
} from "../api/posRegistersApi";
import { PosPagination, PosSearch, useDebouncedValue } from "../components/PosListControls";
import "./pos-registers.css";

type TerminalFormMode = "create" | "edit" | "move";

export function PosRegistersPage({ embedded = false, selectedLocationId }: { embedded?: boolean; selectedLocationId?: number }) {
  const client = useQueryClient();
  const { permissions, role } = useAuth();
  const canAdmin =
    role?.code === "TENANT_ADMIN" ||
    permissions.includes("SALES_POS_REGISTER_ADMIN");
  const [activationCode, setActivationCode] = useState("");
  const [modeDrafts, setModeDrafts] = useState<
    Record<number, RegisterMode | "">
  >({});
  const [formMode, setFormMode] = useState<TerminalFormMode | null>(null);
  const [editingTerminal, setEditingTerminal] = useState<PosTerminal | null>(
    null,
  );
  const [terminalForm, setTerminalForm] = useState({
    locationId: "",
    terminalCode: "",
    displayName: "",
    isActive: true,
  });
  const [locationSearch, setLocationSearch] = useState("");
  const [locationPage, setLocationPage] = useState(1);
  const [locationLimit, setLocationLimit] = useState<20 | 50 | 100>(20);
  const [terminalSearch, setTerminalSearch] = useState("");
  const [terminalStatus, setTerminalStatus] = useState("ALL");
  const [terminalPage, setTerminalPage] = useState(1);
  const [terminalLimit, setTerminalLimit] = useState<20 | 50 | 100>(20);
  const [pairingSearch, setPairingSearch] = useState("");
  const [pairingStatus, setPairingStatus] = useState("ALL");
  const [pairingPage, setPairingPage] = useState(1);
  const [pairingLimit, setPairingLimit] = useState<20 | 50 | 100>(20);
  const debouncedLocationSearch = useDebouncedValue(locationSearch);
  const debouncedTerminalSearch = useDebouncedValue(terminalSearch);
  const debouncedPairingSearch = useDebouncedValue(pairingSearch);
  const [issuedCode, setIssuedCode] = useState<{
    terminal: PosTerminal;
    code: string;
    expiresAt: string;
  } | null>(null);
  const [pairingTerminal, setPairingTerminal] = useState<PosTerminal | null>(
    null,
  );

  const current = useQuery({
    queryKey: ["pos-terminal-pairing", "current"],
    queryFn: posRegistersApi.currentPairing,
    retry: false,
  });
  const locations = useQuery({
    queryKey: ["pos-registers", "locations", selectedLocationId, locationPage, locationLimit, debouncedLocationSearch],
    queryFn: () => posRegistersApi.locationConfigs({ locationId: selectedLocationId, page: locationPage, limit: locationLimit, search: debouncedLocationSearch }),
    enabled: canAdmin,
  });
  const availableLocations = useQuery({ queryKey: ["pos-register-management", "locations"], queryFn: posRegistersApi.managementLocations, enabled: canAdmin });
  const terminals = useQuery({
    queryKey: ["pos-registers", "terminals", selectedLocationId, terminalPage, terminalLimit, debouncedTerminalSearch, terminalStatus],
    queryFn: () => posRegistersApi.terminals({ locationId: selectedLocationId, page: terminalPage, limit: terminalLimit, search: debouncedTerminalSearch, status: terminalStatus }),
    enabled: canAdmin,
  });
  const pairings = useQuery({
    queryKey: ["pos-registers", "pairings", pairingTerminal?.posTerminalId, pairingPage, pairingLimit, debouncedPairingSearch, pairingStatus],
    queryFn: () => posRegistersApi.pairings(pairingTerminal!.posTerminalId, { page: pairingPage, limit: pairingLimit, search: debouncedPairingSearch, status: pairingStatus }),
    enabled: canAdmin && Boolean(pairingTerminal),
  });

  useEffect(() => {
    if (!locations.data) return;
    setModeDrafts(
      Object.fromEntries(
        locations.data.items.map((row) => [
          row.location.locationId,
          row.config?.registerMode ?? "",
        ]),
      ),
    );
  }, [locations.data]);
  useEffect(() => setLocationPage(1), [debouncedLocationSearch, selectedLocationId]);
  useEffect(() => setTerminalPage(1), [debouncedTerminalSearch, terminalStatus, selectedLocationId]);
  useEffect(() => setPairingPage(1), [debouncedPairingSearch, pairingStatus, pairingTerminal?.posTerminalId]);
  const displayedLocations = locations.data?.items ?? [];
  const displayedTerminals = terminals.data?.items ?? [];

  const refreshAdmin = () => {
    void client.invalidateQueries({ queryKey: ["pos-registers"] });
    void client.invalidateQueries({ queryKey: ["pos-register-management"] });
    void client.invalidateQueries({ queryKey: ["pos-register-session"] });
    void client.invalidateQueries({ queryKey: ["billing-locations"] });
  };
  const pair = useMutation({
    mutationFn: () =>
      posRegistersApi.activateBrowser(activationCode.trim().toUpperCase()),
    onSuccess: () => {
      setActivationCode("");
      void client.invalidateQueries({ queryKey: ["pos-terminal-pairing"] });
      refreshAdmin();
    },
  });
  const configure = useMutation({
    mutationFn: ({
      locationId,
      mode,
    }: {
      locationId: number;
      mode: RegisterMode;
    }) => posRegistersApi.configureLocation(locationId, mode),
    onSuccess: refreshAdmin,
    onError: (_error, variables) => {
      const persisted = locations.data?.items.find((row) => Number(row.location.locationId) === Number(variables.locationId));
      setModeDrafts((drafts) => ({ ...drafts, [variables.locationId]: persisted?.config?.registerMode ?? "" }));
    },
  });
  const saveTerminal = useMutation({
    mutationFn: async () => {
      if (formMode === "create")
        return posRegistersApi.createTerminal({
          locationId: Number(terminalForm.locationId),
          terminalCode: terminalForm.terminalCode.trim().toUpperCase(),
          displayName: terminalForm.displayName.trim(),
          isActive: terminalForm.isActive,
        });
      if (formMode === "edit" && editingTerminal)
        return posRegistersApi.updateTerminal(
          editingTerminal.posTerminalId,
          terminalForm.terminalCode.trim().toUpperCase(),
          terminalForm.displayName.trim(),
        );
      if (formMode === "move" && editingTerminal)
        return posRegistersApi.reassignTerminal(
          editingTerminal.posTerminalId,
          Number(terminalForm.locationId),
        );
      throw new Error("Choose a terminal action.");
    },
    onSuccess: () => {
      closeTerminalForm();
      refreshAdmin();
    },
  });
  const status = useMutation({
    mutationFn: ({
      terminal,
      active,
    }: {
      terminal: PosTerminal;
      active: boolean;
    }) => posRegistersApi.setTerminalActive(terminal.posTerminalId, active),
    onSuccess: () => {
      refreshAdmin();
      void client.invalidateQueries({ queryKey: ["pos-terminal-pairing"] });
    },
  });
  const issue = useMutation({
    mutationFn: (terminal: PosTerminal) =>
      posRegistersApi.issueActivation(terminal.posTerminalId),
    onSuccess: (result, terminal) =>
      setIssuedCode({
        terminal,
        code: result.activationCode,
        expiresAt: result.expiresAt,
      }),
  });
  const revoke = useMutation({
    mutationFn: ({
      terminalId,
      pairingId,
    }: {
      terminalId: number;
      pairingId: number;
    }) => posRegistersApi.revokePairing(terminalId, pairingId),
    onSuccess: () => {
      void pairings.refetch();
      refreshAdmin();
      void client.invalidateQueries({ queryKey: ["pos-terminal-pairing"] });
    },
  });

  const closeTerminalForm = () => {
    setFormMode(null);
    setEditingTerminal(null);
    setTerminalForm({ locationId: "", terminalCode: "", displayName: "", isActive: true });
    saveTerminal.reset();
  };
  const openCreate = () => {
    setEditingTerminal(null);
    setTerminalForm({
      locationId: selectedLocationId ? String(selectedLocationId) : availableLocations.data?.[0]
        ? String(availableLocations.data[0].locationId)
        : "",
      terminalCode: "",
      displayName: "",
      isActive: true,
    });
    setFormMode("create");
  };
  const openEdit = (terminal: PosTerminal) => {
    setEditingTerminal(terminal);
    setTerminalForm({
      locationId: String(terminal.locationId),
      terminalCode: terminal.terminalCode,
      displayName: terminal.displayName,
      isActive: terminal.isActive,
    });
    setFormMode("edit");
  };
  const openMove = (terminal: PosTerminal) => {
    setEditingTerminal(terminal);
    setTerminalForm({
      locationId: String(terminal.locationId),
      terminalCode: terminal.terminalCode,
      displayName: terminal.displayName,
      isActive: terminal.isActive,
    });
    setFormMode("move");
  };
  const submitTerminal = (event: FormEvent) => {
    event.preventDefault();
    saveTerminal.mutate();
  };
  const clearInvalidPairing = () => {
    posRegistersApi.clearLocalPairing();
    client.removeQueries({ queryKey: ["pos-terminal-pairing", "current"] });
    void current.refetch();
  };

  return (
    <div className="pos-register-page">
      {!embedded && <div className="page-head">
        <div>
          <div className="eyebrow">SALES / POS SETUP</div>
          <h1>POS Registers</h1>
          <p>
            Configure location register mode and pair this browser to a billing
            terminal.
          </p>
        </div>
        {canAdmin && (
          <button className="btn btn-primary" onClick={openCreate}>
            + New Terminal
          </button>
        )}
      </div>}

      <section className="card pos-pairing-card">
        <div>
          <h2>This browser</h2>
          <p>
            The pairing remains on this browser when a cashier signs out. Every
            cashier still signs in with their own account.
          </p>
        </div>
        {current.isPending ? (
          <div className="empty">Checking terminal pairing...</div>
        ) : current.isError ? (
          <div className="error-box" role="alert">
            {current.error.message}
            <button className="btn btn-secondary" onClick={clearInvalidPairing}>
              Clear invalid credential
            </button>
          </div>
        ) : current.data?.paired ? (
          <div className="paired-terminal">
            <span className="status status-on">
              <i /> Paired
            </span>
            <div>
              <strong>{current.data.terminal.displayName}</strong>
              <small>
                {current.data.terminal.terminalCode} ·{" "}
                {current.data.terminal.location?.name}
              </small>
            </div>
            <div>
              <small>Last verified</small>
              <strong>
                {current.data.pairing.lastSeenAt
                  ? new Date(current.data.pairing.lastSeenAt).toLocaleString()
                  : "Now"}
              </strong>
            </div>
          </div>
        ) : (
          <form
            className="activation-form"
            onSubmit={(event) => {
              event.preventDefault();
              pair.mutate();
            }}
          >
            <label className="field">
              <span>Activation code</span>
              <input
                className="control activation-code"
                required
                value={activationCode}
                onChange={(event) => {
                  setActivationCode(event.target.value.toUpperCase());
                  pair.reset();
                }}
                placeholder="ABCD-EFGH-JKLM"
                maxLength={14}
              />
            </label>
            <button className="btn btn-primary" disabled={pair.isPending}>
              {pair.isPending ? "Activating..." : "Activate this browser"}
            </button>
            {pair.isError && (
              <div className="error-box">{pair.error.message}</div>
            )}
          </form>
        )}
      </section>

      {canAdmin && (
        <>
          <section className="card">
            <div className="sales-card-head">
              <div>
                <h2>Location register modes</h2>
                <p>
                  Locations remain unconfigured until an administrator
                  explicitly saves a mode.
                </p>
              </div>
              {!selectedLocationId && <PosSearch value={locationSearch} onChange={setLocationSearch} placeholder="Search locations" />}
            </div>
            {locations.isError && (
              <div className="error-box">{locations.error.message}</div>
            )}
            <div className="sales-table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Location</th>
                    <th>Status</th>
                    <th>Register mode</th>
                    <th className="right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.isPending ? (
                    <tr>
                      <td colSpan={4}>Loading locations...</td>
                    </tr>
                  ) : !displayedLocations.length ? (
                    <tr>
                      <td colSpan={4}>
                        <div className="empty">
                          No authorized locations available.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    displayedLocations.map(({ location, config }) => (
                      <tr key={location.locationId}>
                        <td>
                          <strong>{location.name}</strong>
                          <small className="refund-code">{location.code}</small>
                        </td>
                        <td>
                          <span
                            className={
                              location.isActive
                                ? "status status-on"
                                : "status status-off"
                            }
                          >
                            <i />
                            {location.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td>
                          <select
                            className="control"
                            value={modeDrafts[location.locationId] ?? ""}
                            onChange={(event) =>
                              setModeDrafts((drafts) => ({
                                ...drafts,
                                [location.locationId]: event.target
                                  .value as RegisterMode,
                              }))
                            }
                          >
                            <option value="">Unconfigured</option>
                            <option value="TERMINAL_REGISTER">
                              Terminal Register
                            </option>
                            <option value="MASTER_REGISTER">
                              Master Register
                            </option>
                          </select>
                          {config && (
                            <small className="refund-code">
                              Saved{" "}
                              {new Date(
                                config.updatedAt ?? config.createdAt,
                              ).toLocaleString()}
                            </small>
                          )}
                        </td>
                        <td className="right">
                          <button
                            className="btn btn-primary"
                            disabled={
                              !location.isActive ||
                              !modeDrafts[location.locationId] ||
                              configure.isPending
                            }
                            onClick={() =>
                              configure.mutate({
                                locationId: location.locationId,
                                mode: modeDrafts[
                                  location.locationId
                                ] as RegisterMode,
                              })
                            }
                          >
                            Save mode
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {locations.data && <PosPagination page={locationPage} limit={locationLimit} total={locations.data.total} onPage={setLocationPage} onLimit={setLocationLimit} />}
            {configure.isError && (
              <div className="error-box">{configure.error.message}</div>
            )}
          </section>

          <section className="card">
            <div className="sales-card-head">
              <div>
                <h2>Registered terminals</h2>
                <p>
                  A terminal identifies one billing browser/device. It is not a
                  cashier, drawer, card machine, or register session.
                </p>
              </div>
              <div className="pos-card-actions"><button className="btn btn-primary" onClick={openCreate}>+ Create terminal</button><button className="btn btn-secondary" onClick={refreshAdmin}>Refresh</button></div>
            </div>
            <div className="pos-list-tools"><PosSearch value={terminalSearch} onChange={setTerminalSearch} placeholder="Search code, name, or location" /><select className="control" value={terminalStatus} onChange={(event) => setTerminalStatus(event.target.value)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></div>
            {(terminals.isError || status.isError || issue.isError) && (
              <div className="error-box">
                {terminals.error?.message ??
                  status.error?.message ??
                  issue.error?.message}
              </div>
            )}
            <div className="sales-table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Display name</th>
                    <th>Location</th>
                    <th>Pairing</th>
                    <th>Status</th>
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {terminals.isPending ? (
                    <tr>
                      <td colSpan={6}>Loading terminals...</td>
                    </tr>
                  ) : !displayedTerminals.length ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="empty">
                          No POS terminals registered yet.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    displayedTerminals.map((terminal) => (
                      <tr key={terminal.posTerminalId}>
                        <td>
                          <span className="code-chip">
                            {terminal.terminalCode}
                          </span>
                        </td>
                        <td>
                          <strong>{terminal.displayName}</strong>
                        </td>
                        <td>{terminal.location?.name}</td>
                        <td>
                          {terminal.activePairingCount ? (
                            <span className="status status-on">
                              <i />
                              Paired
                            </span>
                          ) : (
                            <span className="status status-off">
                              <i />
                              Not paired
                            </span>
                          )}
                        </td>
                        <td>
                          <span
                            className={
                              terminal.isActive
                                ? "status status-on"
                                : "status status-off"
                            }
                          >
                            <i />
                            {terminal.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="right">
                          <div className="pos-terminal-actions">
                            <button
                              className="btn btn-edit-soft"
                              onClick={() => openEdit(terminal)}
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn-secondary"
                              disabled={terminal.activePairingCount > 0}
                              title={
                                terminal.activePairingCount
                                  ? "Revoke the pairing before moving this terminal."
                                  : undefined
                              }
                              onClick={() => openMove(terminal)}
                            >
                              Move
                            </button>
                            <button
                              className="btn btn-secondary"
                              onClick={() => setPairingTerminal(terminal)}
                            >
                              Pairings
                            </button>
                            {terminal.isActive && (
                              <button
                                className="btn btn-primary"
                                onClick={() => issue.mutate(terminal)}
                              >
                                Issue code
                              </button>
                            )}
                            <button
                              className={
                                terminal.isActive
                                  ? "btn btn-danger-soft"
                                  : "btn btn-success-soft"
                              }
                              disabled={status.isPending}
                              onClick={() =>
                                status.mutate({
                                  terminal,
                                  active: !terminal.isActive,
                                })
                              }
                            >
                              {terminal.isActive ? "Deactivate" : "Activate"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {terminals.data && <PosPagination page={terminalPage} limit={terminalLimit} total={terminals.data.total} onPage={setTerminalPage} onLimit={setTerminalLimit} />}
          </section>
        </>
      )}

      <Modal
        open={Boolean(formMode)}
        onClose={closeTerminalForm}
        title={
          formMode === "create"
            ? "Register POS terminal"
            : formMode === "move"
              ? "Move POS terminal"
              : "Edit POS terminal"
        }
        subtitle={editingTerminal?.terminalCode}
      >
        <form onSubmit={submitTerminal}>
          <div className="modal-body">
            <div className="form-grid">
              {(formMode === "create" || formMode === "move") && (
                <label className="field">
                  <span>Location</span>
                  <select
                    className="control"
                    required
                    value={terminalForm.locationId}
                    onChange={(event) =>
                      setTerminalForm({
                        ...terminalForm,
                        locationId: event.target.value,
                      })
                    }
                  >
                    <option value="">Choose location</option>
                    {(availableLocations.data ?? [])
                      .map((location) => (
                        <option
                          key={location.locationId}
                          value={location.locationId}
                        >
                          {location.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {formMode !== "move" && (
                <label className="field">
                  <span>Stable terminal code</span>
                  <input
                    className="control"
                    required
                    maxLength={50}
                    pattern="[A-Za-z0-9][A-Za-z0-9_-]*"
                    value={terminalForm.terminalCode}
                    onChange={(event) =>
                      setTerminalForm({
                        ...terminalForm,
                        terminalCode: event.target.value.toUpperCase(),
                      })
                    }
                    placeholder="POS-01"
                  />
                </label>
              )}
              {formMode !== "move" && (
                <label className="field">
                  <span>Display name</span>
                  <input
                    className="control"
                    required
                    maxLength={150}
                    value={terminalForm.displayName}
                    onChange={(event) =>
                      setTerminalForm({
                        ...terminalForm,
                        displayName: event.target.value,
                      })
                    }
                    placeholder="Front Counter"
                  />
                </label>
              )}
              {formMode === "create" && <label className="field checkbox-field"><input type="checkbox" checked={terminalForm.isActive} onChange={(event) => setTerminalForm({ ...terminalForm, isActive: event.target.checked })} /><span>Active and available for pairing</span></label>}
            </div>
            {formMode === "move" && (
              <p className="pending-note">
                Moving requires all pairings to be revoked and no register
                history for this terminal. If it has been used for a register,
                create a new terminal at the destination to preserve the old
                location's records. A moved terminal needs a new activation code.
              </p>
            )}
            {saveTerminal.isError && (
              <div className="error-box">{saveTerminal.error.message}</div>
            )}
          </div>
          <div className="modal-foot">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={closeTerminalForm}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={saveTerminal.isPending}
            >
              {saveTerminal.isPending
                ? "Saving..."
                : formMode === "move"
                  ? "Move terminal"
                  : "Save terminal"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(issuedCode)}
        onClose={() => setIssuedCode(null)}
        title="Activation code"
        subtitle={issuedCode?.terminal.displayName}
      >
        {issuedCode && (
          <>
            <div className="modal-body activation-result">
              <p>
                Show this code once on the terminal browser. It expires at{" "}
                {new Date(issuedCode.expiresAt).toLocaleString()}.
              </p>
              <strong>{issuedCode.code}</strong>
              <p>
                The server stores only its hash. Closing this dialog will not
                reveal the code again.
              </p>
            </div>
            <div className="modal-foot">
              <button
                className="btn btn-secondary"
                onClick={() => navigator.clipboard.writeText(issuedCode.code)}
              >
                Copy code
              </button>
              <button
                className="btn btn-primary"
                onClick={() => setIssuedCode(null)}
              >
                Done
              </button>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={Boolean(pairingTerminal)}
        onClose={() => setPairingTerminal(null)}
        title="Terminal pairings"
        subtitle={pairingTerminal ? `${pairingTerminal.location?.name ?? "Location"} · ${pairingTerminal.terminalCode}` : undefined}
        wide
      >
        <div className="modal-body">
          <div className="pos-list-tools"><PosSearch value={pairingSearch} onChange={setPairingSearch} placeholder="Search pairing history" /><select className="control" value={pairingStatus} onChange={(event) => setPairingStatus(event.target.value)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="REVOKED">Revoked</option></select></div>
          <table className="table">
            <thead>
              <tr>
                <th>Paired</th>
                <th>Paired by</th>
                <th>Last seen</th>
                <th>Status</th>
                <th className="right">Action</th>
              </tr>
            </thead>
            <tbody>
              {pairings.isPending ? (
                <tr>
                  <td colSpan={5}>Loading pairings...</td>
                </tr>
              ) : !pairings.data?.items.length ? (
                <tr>
                  <td colSpan={5}>No pairing history.</td>
                </tr>
              ) : (
                pairings.data.items.map((pairing) => (
                  <tr key={pairing.posTerminalPairingId}>
                    <td>{new Date(pairing.pairedAt).toLocaleString()}</td>
                    <td>
                      {pairing.pairedByUsername ?? pairing.pairedByUserId}
                    </td>
                    <td>
                      {pairing.lastSeenAt
                        ? new Date(pairing.lastSeenAt).toLocaleString()
                        : "—"}
                    </td>
                    <td>
                      {pairing.revokedAt ? (
                        <>
                          <span className="status status-off">
                            <i />
                            Revoked
                          </span>
                          <small className="refund-code">
                            {pairing.revocationReason}
                          </small>
                        </>
                      ) : (
                        <span className="status status-on">
                          <i />
                          Active
                        </span>
                      )}
                    </td>
                    <td className="right">
                      {!pairing.revokedAt && pairingTerminal && (
                        <button
                          className="btn btn-danger-soft"
                          disabled={revoke.isPending}
                          onClick={() =>
                            revoke.mutate({
                              terminalId: pairingTerminal.posTerminalId,
                              pairingId: pairing.posTerminalPairingId,
                            })
                          }
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {pairings.data && <PosPagination page={pairingPage} limit={pairingLimit} total={pairings.data.total} onPage={setPairingPage} onLimit={setPairingLimit} />}
          {(pairings.isError || revoke.isError) && (
            <div className="error-box">
              {pairings.error?.message ?? revoke.error?.message}
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button
            className="btn btn-secondary"
            onClick={() => setPairingTerminal(null)}
          >
            Close
          </button>
        </div>
      </Modal>
    </div>
  );
}
