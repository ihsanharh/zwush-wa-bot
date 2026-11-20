import { WA_DISCONNECT_REASONS } from "zapo-js";

export const MAX_RECONNECT_ATTEMPTS = 10;

export type ReconnectDecisionReason =
    | "shutting_down"
    | "logout"
    | "handled_by_client_too_old_recovery"
    | "client_disconnected"
    | "session_replaced"
    | "bad_user_agent"
    | "transient_disconnect";

export interface ReconnectDecision {
    reconnect: boolean;
    reason: ReconnectDecisionReason;
}

export interface CloseEventSummary {
    reason?: string | null;
    isLogout?: boolean;
}

/**
 * Determines whether the WhatsApp client should schedule a reconnect attempt
 * after a `connection` close event, avoiding loops on logout, client shutdown,
 * session replacement, bad user agent, or 405 auto-recovery.
 */
export function shouldScheduleReconnect(
    event: CloseEventSummary,
    isShuttingDown: boolean
): ReconnectDecision {
    if (isShuttingDown) {
        return { reconnect: false, reason: "shutting_down" };
    }
    if (event.isLogout) {
        return { reconnect: false, reason: "logout" };
    }
    if (event.reason === WA_DISCONNECT_REASONS.FAILURE_CLIENT_TOO_OLD) {
        return { reconnect: false, reason: "handled_by_client_too_old_recovery" };
    }
    if (event.reason === WA_DISCONNECT_REASONS.CLIENT_DISCONNECTED) {
        return { reconnect: false, reason: "client_disconnected" };
    }
    if (event.reason === WA_DISCONNECT_REASONS.STREAM_ERROR_REPLACED) {
        return { reconnect: false, reason: "session_replaced" };
    }
    if (event.reason === WA_DISCONNECT_REASONS.FAILURE_BAD_USER_AGENT) {
        return { reconnect: false, reason: "bad_user_agent" };
    }
    return { reconnect: true, reason: "transient_disconnect" };
}

/**
 * Computes exponential backoff delay in milliseconds (2s base, capped at 60s).
 */
export function computeReconnectDelayMs(attempt: number): number {
    return Math.min(60_000, 2_000 * 2 ** Math.max(0, attempt));
}
