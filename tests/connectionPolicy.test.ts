import { describe, expect, it } from "bun:test";
import { WA_DISCONNECT_REASONS } from "zapo-js";
import {
    computeReconnectDelayMs,
    MAX_RECONNECT_ATTEMPTS,
    shouldScheduleReconnect
} from "../src/utils/connectionPolicy";

describe("connectionPolicy", () => {
    it("exports expected max reconnect attempts", () => {
        expect(MAX_RECONNECT_ATTEMPTS).toBe(10);
    });

    describe("shouldScheduleReconnect", () => {
        it("does not reconnect when shutting down", () => {
            expect(
                shouldScheduleReconnect(
                    { reason: WA_DISCONNECT_REASONS.FAILURE_SERVICE_UNAVAILABLE, isLogout: false },
                    true
                )
            ).toEqual({ reconnect: false, reason: "shutting_down" });
        });

        it("does not reconnect when logged out", () => {
            expect(
                shouldScheduleReconnect(
                    { reason: WA_DISCONNECT_REASONS.FAILURE_NOT_AUTHORIZED, isLogout: true },
                    false
                )
            ).toEqual({ reconnect: false, reason: "logout" });
        });

        it("delegates failure_client_too_old to zapo-js recovery", () => {
            expect(
                shouldScheduleReconnect(
                    { reason: WA_DISCONNECT_REASONS.FAILURE_CLIENT_TOO_OLD, isLogout: false },
                    false
                )
            ).toEqual({ reconnect: false, reason: "handled_by_client_too_old_recovery" });
        });

        it("does not reconnect on client_disconnected", () => {
            expect(
                shouldScheduleReconnect(
                    { reason: WA_DISCONNECT_REASONS.CLIENT_DISCONNECTED, isLogout: false },
                    false
                )
            ).toEqual({ reconnect: false, reason: "client_disconnected" });
        });

        it("does not reconnect on stream_error_replaced", () => {
            expect(
                shouldScheduleReconnect(
                    { reason: WA_DISCONNECT_REASONS.STREAM_ERROR_REPLACED, isLogout: false },
                    false
                )
            ).toEqual({ reconnect: false, reason: "session_replaced" });
        });

        it("does not reconnect on failure_bad_user_agent", () => {
            expect(
                shouldScheduleReconnect(
                    { reason: WA_DISCONNECT_REASONS.FAILURE_BAD_USER_AGENT, isLogout: false },
                    false
                )
            ).toEqual({ reconnect: false, reason: "bad_user_agent" });
        });

        it("schedules reconnect on transient disconnects", () => {
            for (const reason of [
                WA_DISCONNECT_REASONS.FAILURE_SERVICE_UNAVAILABLE,
                WA_DISCONNECT_REASONS.COMMS_STOPPED,
                WA_DISCONNECT_REASONS.STREAM_ERROR_OTHER
            ]) {
                expect(shouldScheduleReconnect({ reason, isLogout: false }, false)).toEqual({
                    reconnect: true,
                    reason: "transient_disconnect"
                });
            }
        });
    });

    describe("computeReconnectDelayMs", () => {
        it("computes exponential backoff capped at 60s", () => {
            expect(computeReconnectDelayMs(-1)).toBe(2_000);
            expect(computeReconnectDelayMs(0)).toBe(2_000);
            expect(computeReconnectDelayMs(1)).toBe(4_000);
            expect(computeReconnectDelayMs(2)).toBe(8_000);
            expect(computeReconnectDelayMs(3)).toBe(16_000);
            expect(computeReconnectDelayMs(4)).toBe(32_000);
            expect(computeReconnectDelayMs(5)).toBe(60_000);
            expect(computeReconnectDelayMs(10)).toBe(60_000);
        });
    });
});
