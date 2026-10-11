# Zero-Command & Button-Driven Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all slash commands for customers and operational admin tasks, retain strictly 3 admin commands (`/maintenance`, `/sync`, `/saldo`), and transition all order management & live chat resolution to WhatsApp interactive quoted action buttons.

**Architecture:** Quoted interactive action buttons in transaction logs (`ZwushLogs`) for order settlement (`paid`, `done`) and error retries (`reprocess`), interactive buttons in admin alerts (`ZwushAdmin`) for ticket resolution (`solved`), decoupling customer buttons from command objects, and deleting all obsolete command files.

**Tech Stack:** TypeScript, Bun (`bun test`), zapo-js / Baileys protocol message structures, CoreClient HTTP API.

**Spec:** `docs/superpowers/specs/2026-10-12-zero-command-button-driven-architecture-design.md`

## Global Constraints

- Customers have 0 slash commands; all customer navigation is purely via interactive buttons and list menus.
- Only 3 text slash commands are retained in Admin Group: `/maintenance`, `/sync`, `/saldo` (alias `/balance`).
- All other commands (`/beli`, `/katalog`, `/menu`, `/cek`, `/bantuan`, `/done`, `/paid`, `/reprocess`, `/solved`, `/orders`, etc.) are removed from the filesystem and registry.
- Order log follow-up messages must quote the original transaction log messageKey (`options.quote`).
- All tests must pass (`bun test`) and TypeScript compilation must be clean (`bun run tsc --noEmit`).

## Review Focus

1. `logNewOrder` handles sender without `quote` option gracefully if mock or platform returns minimal key.
2. `updateOrderStatus` for `FAILED` or `HELD` sends a retry button quoting the original log message.
3. `btn_admin_paid_*` marks order as paid in Core API and automatically triggers reprocess delivery to The Hive.
4. `btn_admin_solved_*` resolves live chat session in memory, sends closing greeting to customer, and confirms in admin group.
5. Customer interactions (`btn_start_buying`, `btn_check_payment`, `btn_cancel_order`, `btn_history`) execute without importing any deleted command modules.

---

### Task 1: Admin Interactive Button Builders

**Files:**
- Modify: `src/utils/interactiveBuilders.ts`
- Test: `tests/utils/interactiveBuilders.test.ts` (or `tests/interactiveBuilders.test.ts`)

**Interfaces:**
- Produces:
  - `buildAdminOrderActionButtons(orderId: string, lang?: Language)`: returns `{ interactiveMessage: any, text: string, buttons: Array<{ id: string, text: string }> }` with `btn_admin_paid_${orderId}` and `btn_admin_done_${orderId}`
  - `buildAdminOrderFailureButtons(orderId: string, failureReason?: string, lang?: Language)`: returns `{ interactiveMessage: any, text: string, buttons: Array<{ id: string, text: string }> }` with `btn_admin_reprocess_${orderId}`
  - `buildAdminSupportSolvedButtons(target: string, lang?: Language)`: returns `{ interactiveMessage: any, text: string, buttons: Array<{ id: string, text: string }> }` with `btn_admin_solved_${target}`

- [ ] **Step 1: Write failing tests for the new admin button builders**

Create/update `tests/interactiveBuilders.test.ts`:
```typescript
import { describe, expect, it } from "bun:test";
import {
    buildAdminOrderActionButtons,
    buildAdminOrderFailureButtons,
    buildAdminSupportSolvedButtons
} from "../src/utils/interactiveBuilders";

describe("Admin Interactive Button Builders", () => {
    it("should build new order action buttons with paid and done", () => {
        const res = buildAdminOrderActionButtons("ORD-12345");
        expect(res.buttons.some(b => b.id === "btn_admin_paid_ORD-12345")).toBe(true);
        expect(res.buttons.some(b => b.id === "btn_admin_done_ORD-12345")).toBe(true);
        expect(res.interactiveMessage.nativeFlowMessage.buttons.length).toBe(2);
    });

    it("should build order failure retry buttons with reprocess", () => {
        const res = buildAdminOrderFailureButtons("ORD-12345", "Token Gibot habis");
        expect(res.buttons.some(b => b.id === "btn_admin_reprocess_ORD-12345")).toBe(true);
        expect(res.text).toContain("Token Gibot habis");
        expect(res.interactiveMessage.nativeFlowMessage.buttons.length).toBe(1);
    });

    it("should build live chat solved button", () => {
        const res = buildAdminSupportSolvedButtons("628123456789@s.whatsapp.net");
        expect(res.buttons.some(b => b.id === "btn_admin_solved_628123456789@s.whatsapp.net")).toBe(true);
        expect(res.interactiveMessage.nativeFlowMessage.buttons.length).toBe(1);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/interactiveBuilders.test.ts`
Expected: FAIL due to missing functions or signatures.

- [ ] **Step 3: Implement builders in `src/utils/interactiveBuilders.ts`**

Update `src/utils/interactiveBuilders.ts`:
```typescript
export function buildAdminOrderActionButtons(
    orderId: string,
    lang: Language = "id"
): { interactiveMessage: any; text: string; buttons: Array<{ id: string; text: string }> } {
    const text = `Aksi Cepat Admin — Order #${orderId}:`;
    const buttons = [
        { id: `btn_admin_paid_${orderId}`, text: "✅ Tandai Paid" },
        { id: `btn_admin_done_${orderId}`, text: "🚀 Proses / Done" }
    ];
    return {
        interactiveMessage: {
            body: { text },
            nativeFlowMessage: {
                messageVersion: 1,
                buttons: buttons.map(btn => ({
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({ display_text: btn.text, id: btn.id })
                }))
            }
        },
        text,
        buttons
    };
}

export function buildAdminOrderFailureButtons(
    orderId: string,
    failureReason?: string,
    lang: Language = "id"
): { interactiveMessage: any; text: string; buttons: Array<{ id: string; text: string }> } {
    const reason = failureReason || "Kendala pemrosesan The Hive";
    const text = `⚠️ *KENDALA PESANAN #${orderId}*\nAlasan: *${reason}*\n\n👉 Silakan periksa kendala di atas, lalu klik tombol di bawah untuk mencoba memproses kembali:`;
    const buttons = [
        { id: `btn_admin_reprocess_${orderId}`, text: "🔄 Retry Order" }
    ];
    return {
        interactiveMessage: {
            body: { text },
            nativeFlowMessage: {
                messageVersion: 1,
                buttons: buttons.map(btn => ({
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({ display_text: btn.text, id: btn.id })
                }))
            }
        },
        text,
        buttons
    };
}

export function buildAdminSupportSolvedButtons(
    target: string,
    lang: Language = "id"
): { interactiveMessage: any; text: string; buttons: Array<{ id: string; text: string }> } {
    const text = `💡 *Setelah selesai membantu pelanggan, klik tombol di bawah untuk mengaktifkan bot kembali:*`;
    const buttons = [
        { id: `btn_admin_solved_${target}`, text: "✅ Selesai / Solved" }
    ];
    return {
        interactiveMessage: {
            body: { text },
            nativeFlowMessage: {
                messageVersion: 1,
                buttons: buttons.map(btn => ({
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({ display_text: btn.text, id: btn.id })
                }))
            }
        },
        text,
        buttons
    };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/interactiveBuilders.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/interactiveBuilders.ts tests/interactiveBuilders.test.ts
git commit -m "feat(buttons): add admin interactive action button builders"
```

---

### Task 2: Admin Group Logger Quoted Follow-up Buttons

**Files:**
- Modify: `src/handlers/adminLogger.ts`
- Test: `tests/handlers/adminLogger.test.ts` (or create if not present)

**Interfaces:**
- Consumes:
  - `buildAdminOrderActionButtons`, `buildAdminOrderFailureButtons`, `buildAdminSupportSolvedButtons` from `src/utils/interactiveBuilders`
- Produces:
  - `AdminGroupLogger.logNewOrder`: sends log message, then sends quoted follow-up message with paid/done buttons quoting the log message.
  - `AdminGroupLogger.updateOrderStatus`: on `FAILED` or `HELD`, updates status and sends quoted follow-up message with retry button quoting the log message.
  - `AdminGroupLogger.notifySupportRequest`: sends alert and follow-up interactive solved button.

- [ ] **Step 1: Write test for quoted follow-up buttons in AdminGroupLogger**

Create/update `tests/handlers/adminLogger.test.ts`:
```typescript
import { describe, expect, it, mock } from "bun:test";
import { AdminGroupLogger, type GroupMessageSender } from "../../src/handlers/adminLogger";

describe("AdminGroupLogger Quoted Buttons", () => {
    it("should send quoted action buttons after logging a new order", async () => {
        const sentMessages: Array<{ jid: string; content: any; options?: any }> = [];
        const mockSender: GroupMessageSender = {
            sendMessage: mock(async (jid: string, content: any, options?: any) => {
                sentMessages.push({ jid, content, options });
                return { key: { id: "msg-log-1", remoteJid: jid, fromMe: true } };
            }),
            editMessage: mock(async () => {})
        };

        const logger = new AdminGroupLogger("log@g.us", mockSender, "admin@g.us");
        await logger.logNewOrder({
            orderId: "ORD-999",
            itemName: "Pet Dog",
            gamertag: "Steve",
            totalNominal: 10000,
            platformUserId: "6281111111@s.whatsapp.net"
        });

        expect(sentMessages.length).toBe(2);
        // Message 1 is main card
        expect(sentMessages[0]?.content).toContain("ORDER BARU");
        // Message 2 is quoted follow-up with buttons
        expect(sentMessages[1]?.options?.quote?.id).toBe("msg-log-1");
        expect(sentMessages[1]?.content?.interactiveMessage?.nativeFlowMessage?.buttons[0]?.buttonParamsJson)
            .toContain("btn_admin_paid_ORD-999");
    });

    it("should send quoted retry button when order status is updated to FAILED or HELD", async () => {
        const sentMessages: Array<{ jid: string; content: any; options?: any }> = [];
        const mockSender: GroupMessageSender = {
            sendMessage: mock(async (jid: string, content: any, options?: any) => {
                sentMessages.push({ jid, content, options });
                return { key: { id: "msg-log-1", remoteJid: jid, fromMe: true } };
            }),
            editMessage: mock(async () => {})
        };

        const logger = new AdminGroupLogger("log@g.us", mockSender, "admin@g.us");
        await logger.logNewOrder({
            orderId: "ORD-999",
            itemName: "Pet Dog",
            gamertag: "Steve",
            totalNominal: 10000,
            platformUserId: "6281111111@s.whatsapp.net"
        });

        sentMessages.length = 0;
        await logger.updateOrderStatus("ORD-999", "FAILED", { failureReason: "Token Gibot habis" });

        expect(sentMessages.length).toBe(1);
        expect(sentMessages[0]?.options?.quote?.id).toBe("msg-log-1");
        expect(sentMessages[0]?.content?.interactiveMessage?.nativeFlowMessage?.buttons[0]?.buttonParamsJson)
            .toContain("btn_admin_reprocess_ORD-999");
    });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun test tests/handlers/adminLogger.test.ts`
Expected: FAIL

- [ ] **Step 3: Update `src/handlers/adminLogger.ts` to send quoted follow-ups**

In `src/handlers/adminLogger.ts`:
- Update `GroupMessageSender.sendMessage(jid: string, content: any, options?: any)` to accept `options?: any`.
- In `logNewOrder`:
  After obtaining `messageKey`, call:
  ```typescript
  const { buildAdminOrderActionButtons } = await import("../utils/interactiveBuilders");
  const actionPayload = buildAdminOrderActionButtons(order.orderId, "id");
  await this.sender.sendMessage(this.logGroupJid, actionPayload, { quote: messageKey });
  ```
- In `updateOrderStatus`:
  When `status === "FAILED" || status === "HELD"`:
  ```typescript
  if (entry?.messageKey) {
      const { buildAdminOrderFailureButtons } = await import("../utils/interactiveBuilders");
      const failPayload = buildAdminOrderFailureButtons(orderId, extra?.failureReason, "id");
      await this.sender.sendMessage(this.logGroupJid, failPayload, { quote: entry.messageKey });
  }
  ```
- In `notifySupportRequest`:
  Include or follow-up with:
  ```typescript
  const { buildAdminSupportSolvedButtons } = await import("../utils/interactiveBuilders");
  const solvedPayload = buildAdminSupportSolvedButtons(info.platformUserId, "id");
  await this.sender.sendMessage(targetJid, solvedPayload);
  ```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/handlers/adminLogger.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/handlers/adminLogger.ts tests/handlers/adminLogger.test.ts
git commit -m "feat(adminLogger): send quoted follow-up buttons for order settlement and failure retry"
```

---

### Task 3: Direct Admin Action Handlers

**Files:**
- Create: `src/handlers/adminActions.ts`
- Test: `tests/handlers/adminActions.test.ts`

**Interfaces:**
- Produces:
  - `handleAdminAction(remoteJid: string, actionId: string, effectiveSender: string, isGroup: boolean, userLang: Language, ctx: BotContext): Promise<boolean>`
    - Handles `btn_admin_paid_<orderId>`
    - Handles `btn_admin_done_<orderId>`
    - Handles `btn_admin_reprocess_<orderId>`
    - Handles `btn_admin_solved_<target>`

- [ ] **Step 1: Write test for admin action dispatcher**

Create `tests/handlers/adminActions.test.ts`:
```typescript
import { describe, expect, it, mock } from "bun:test";
import { handleAdminAction } from "../../src/handlers/adminActions";
import type { BotContext } from "../../src/handlers/message";
import { StateManager } from "../../src/state";

describe("Admin Action Handlers", () => {
    it("should handle btn_admin_paid by marking paid and reprocessing", async () => {
        const sentTexts: string[] = [];
        const state = new StateManager();
        const mockClient = {
            markOrderPaid: mock(async () => ({ success: true })),
            reprocessOrder: mock(async () => ({ success: true }))
        } as any;

        const ctx: BotContext = {
            client: mockClient,
            state,
            sendText: async (jid, text) => { sentTexts.push(text); }
        } as any;

        const handled = await handleAdminAction(
            "123@g.us",
            "btn_admin_paid_ORD-101",
            "admin@s.whatsapp.net",
            true,
            "id",
            ctx
        );

        expect(handled).toBe(true);
        expect(mockClient.markOrderPaid).toHaveBeenCalledWith("ORD-101");
        expect(mockClient.reprocessOrder).toHaveBeenCalledWith("ORD-101");
        expect(sentTexts[0]).toContain("LUNAS");
    });

    it("should handle btn_admin_solved by resolving live chat and resetting session", async () => {
        const sentTexts: Array<{ jid: string; text: string }> = [];
        const state = new StateManager();
        const userJid = "628999@s.whatsapp.net";
        state.setSessionStep(userJid, "LIVE_CHAT");

        const ctx: BotContext = {
            client: {} as any,
            state,
            sendText: async (jid, text) => { sentTexts.push({ jid, text }); }
        } as any;

        const handled = await handleAdminAction(
            "admin-group@g.us",
            `btn_admin_solved_${userJid}`,
            "admin@s.whatsapp.net",
            true,
            "id",
            ctx
        );

        expect(handled).toBe(true);
        expect(state.getSession(userJid).step).toBe("IDLE");
        // Sends buyer closing text
        expect(sentTexts.some(m => m.jid === userJid)).toBe(true);
        // Sends admin confirmation
        expect(sentTexts.some(m => m.jid === "admin-group@g.us")).toBe(true);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/handlers/adminActions.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/handlers/adminActions.ts`**

Write `src/handlers/adminActions.ts`:
```typescript
import type { BotContext } from "./message";
import type { Language } from "../types";
import { config } from "../config";
import { t } from "../i18n";
import { extractPhoneNumber } from "../utils/messageUtils";

export async function handleAdminAction(
    remoteJid: string,
    actionId: string,
    effectiveSender: string,
    isGroup: boolean,
    userLang: Language,
    ctx: BotContext
): Promise<boolean> {
    const mentions = isGroup && effectiveSender ? [effectiveSender] : undefined;
    const senderTag = effectiveSender ? `@${extractPhoneNumber(effectiveSender)}` : "Admin";

    // 1. Mark Paid + Auto Reprocess
    if (actionId.startsWith("btn_admin_paid_") || actionId.startsWith("admin_paid_")) {
        const orderId = actionId.replace(/^(btn_)?admin_paid_/, "");
        try {
            await ctx.client.markOrderPaid(orderId);
            try {
                await ctx.client.reprocessOrder(orderId);
            } catch (reErr) {
                console.warn(`[adminAction] Auto-reprocess after paid failed for #${orderId}:`, reErr);
            }
            await ctx.sendText(
                remoteJid,
                `✅ Pesanan *#${orderId}* berhasil ditandai *LUNAS* dan dikirim ke antrean pengiriman The Hive oleh ${senderTag}! 🚀`,
                mentions
            );
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, `❌ Gagal menandai lunas pesanan *#${orderId}*: ${msg}`, mentions);
        }
        return true;
    }

    // 2. Manual Done / Completed
    if (actionId.startsWith("btn_admin_done_") || actionId.startsWith("admin_done_")) {
        const orderId = actionId.replace(/^(btn_)?admin_done_/, "");
        try {
            await ctx.client.updateOrderStatus(orderId, "COMPLETED");
            await ctx.sendText(
                remoteJid,
                `✅ Pesanan *#${orderId}* berhasil diselesaikan secara manual oleh ${senderTag}! 📦✨`,
                mentions
            );
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, `❌ Gagal menyelesaikan pesanan *#${orderId}*: ${msg}`, mentions);
        }
        return true;
    }

    // 3. Reprocess / Retry Order
    if (actionId.startsWith("btn_admin_reprocess_") || actionId.startsWith("admin_reprocess_")) {
        const orderId = actionId.replace(/^(btn_)?admin_reprocess_/, "");
        try {
            await ctx.client.reprocessOrder(orderId);
            await ctx.sendText(
                remoteJid,
                `🔄 Pesanan *#${orderId}* berhasil dikirim ulang ke antrean pengiriman The Hive oleh ${senderTag}! ⚡`,
                mentions
            );
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            await ctx.sendText(remoteJid, `❌ Gagal memproses ulang pesanan *#${orderId}*: ${msg}`, mentions);
        }
        return true;
    }

    // 4. Live Chat Solved
    if (actionId.startsWith("btn_admin_solved_") || actionId.startsWith("admin_solved_")) {
        const rawTarget = actionId.replace(/^(btn_)?admin_solved_/, "").trim();
        let matched = ctx.state.findLiveChatUser(rawTarget);

        if (!matched && rawTarget) {
            try {
                const cleanOrderId = rawTarget.replace(/^#/, "");
                const orderRes = await ctx.client.getOrderStatus(cleanOrderId);
                if (orderRes?.platformUserId) {
                    matched = { jid: orderRes.platformUserId, session: ctx.state.getSession(orderRes.platformUserId) };
                }
            } catch {
                // ignore
            }
        }

        if (!matched && !rawTarget) {
            const activeList = ctx.state.getAllActiveLiveChats();
            if (activeList.length === 1 && activeList[0]) {
                matched = { jid: activeList[0].jid, session: ctx.state.getSession(activeList[0].jid) };
            }
        }

        if (!matched) {
            await ctx.sendText(remoteJid, `⚠️ Tidak ditemukan sesi live chat aktif untuk *${rawTarget}*.`, mentions);
            return true;
        }

        const targetJid = matched.jid;
        ctx.state.setSessionStep(targetJid, "IDLE");
        ctx.state.updateSession(targetJid, { liveChatOrderId: undefined });

        // Send closing message to customer
        const targetLang = ctx.state.getLanguage(targetJid);
        const buyerClosing = t("admin.solvedBuyerClosing", targetLang, { store: config.STORE_NAME });
        try {
            await ctx.sendText(targetJid, buyerClosing);
        } catch (err) {
            console.warn(`[adminAction] Failed to send closing text to ${targetJid}:`, err);
        }

        const cleanPhone = extractPhoneNumber(targetJid);
        await ctx.sendText(
            remoteJid,
            `✅ *TIKET LIVE CHAT DISELESAIKAN*\n• Pelanggan: *+${cleanPhone}*\n• Ditangani oleh: ${senderTag}\n• Status: *Bot Aktif Kembali ✅*`,
            mentions
        );
        return true;
    }

    return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/handlers/adminActions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/handlers/adminActions.ts tests/handlers/adminActions.test.ts
git commit -m "feat(adminActions): implement direct service handlers for admin action buttons"
```

---

### Task 4: Decouple Customer Buttons & Clean Message Router

**Files:**
- Modify: `src/handlers/message.ts`
- Test: `tests/flows/interactiveBuyingFlow.test.ts`

**Interfaces:**
- Consumes:
  - `handleAdminAction` from `src/handlers/adminActions`
  - `buildCategoryListMenu`, `buildOrderHistoryButtons` from `src/utils/interactiveBuilders`
- Produces:
  - `handleIncomingMessage`: routes customer buttons directly to UI builders without calling commands.
  - Admin Group routing: allows ONLY `/maintenance`, `/sync`, `/saldo` (or `/balance`), and routes `btn_admin_*` / `admin_*` to `handleAdminAction`.

- [ ] **Step 1: Update customer button callbacks in `src/handlers/message.ts`**

In `src/handlers/message.ts`:
- Replace `btn_start_buying` command import with direct `buildCategoryListMenu` and `ctx.sendList`.
- Replace `btn_check_payment` command import with direct `ctx.client.getOrderStatus` and formatted status text.
- Replace `btn_cancel_order` command import with direct session cancel:
  ```typescript
  ctx.state.resetSession(remoteJid);
  ctx.state.setActiveOrderId(remoteJid, undefined);
  await ctx.sendText(remoteJid, t("cancelSuccess", userLang));
  ```
- Replace `btn_history` / `btn_hist_page_*` with direct `ctx.client.getOrders` and `buildOrderHistoryButtons`.
- Replace bare order regex (`#?ORD-...`) with direct `ctx.client.getOrderStatus`.
- Route admin group button clicks:
  ```typescript
  if (isAdmin && (trimmed.startsWith("admin_") || trimmed.startsWith("btn_admin_") || trimmed.startsWith("cmd_"))) {
      const handled = await handleAdminAction(remoteJid, trimmed, effectiveSender, true, userLang, ctx);
      if (handled) return;
  }
  ```
- In group slash command dispatch:
  Only allow `/maintenance`, `/sync`, `/saldo`, `/balance`. Reject or ignore all other slash commands.

- [ ] **Step 2: Run tests to verify customer and admin button interactions**

Run: `bun test tests/flows/interactiveBuyingFlow.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/handlers/message.ts
git commit -m "refactor(message): decouple customer button handlers and route admin actions directly"
```

---

### Task 5: Delete Obsolete Commands & Clean Registry

**Files:**
- Delete: all files in `src/commands/general/`
- Delete: `done.ts`, `paid.ts`, `reprocess.ts`, `solved.ts`, `orders.ts`, `admin.ts`, `discount.ts`, `voucher.ts`, `setgroup.ts` in `src/commands/admin/`
- Modify: `src/commands/index.ts`
- Modify: `src/commands/registry.ts`

**Interfaces:**
- Produces:
  - `defaultRegistry` containing only `maintenanceCommand`, `syncCommand`, `balanceCommand`.

- [ ] **Step 1: Remove obsolete command files**

```bash
git rm src/commands/general/*.ts
git rm src/commands/admin/admin.ts \
       src/commands/admin/discount.ts \
       src/commands/admin/done.ts \
       src/commands/admin/orders.ts \
       src/commands/admin/paid.ts \
       src/commands/admin/reprocess.ts \
       src/commands/admin/setgroup.ts \
       src/commands/admin/solved.ts \
       src/commands/admin/voucher.ts
```

- [ ] **Step 2: Update `src/commands/index.ts`**

Export only the 3 retained commands:
```typescript
export * from "./types";
export * from "./registry";
export { maintenanceCommand } from "./admin/maintenance";
export { syncCommand } from "./admin/sync";
export { balanceCommand } from "./admin/balance";
```

- [ ] **Step 3: Update `src/commands/registry.ts`**

Register only `maintenanceCommand`, `syncCommand`, `balanceCommand` in `defaultRegistry`. Remove imports of deleted commands.

- [ ] **Step 4: Check TypeScript compile errors**

Run: `bun run tsc --noEmit`
Identify and remove any leftover imports from deleted files across the codebase.

- [ ] **Step 5: Commit**

```bash
git add src/commands/
git commit -m "chore(commands): delete obsolete slash commands, retaining only maintenance, sync, and balance"
```

---

### Task 6: Test Suite Cleanup & Full System Verification

**Files:**
- Modify/Clean: `tests/commands/*` (remove or adapt tests for deleted commands)
- Test: All test suites in `tests/`

- [ ] **Step 1: Clean up test files referencing deleted commands**

- In `tests/commands/orderHelperAndCommands.test.ts`: remove tests for `/paid` and `/reprocess` text commands (as they are now covered by `adminActions.test.ts`).
- Remove obsolete command test files if they only test deleted text commands (e.g. `tests/commands/checkPayment.test.ts` -> verify covered in `interactiveBuyingFlow.test.ts`).
- Update `tests/locales.test.ts` if it asserted names of deleted commands.

- [ ] **Step 2: Run all unit tests**

Run: `bun test`
Expected: ALL test suites PASS.

- [ ] **Step 3: Run TypeScript type checker**

Run: `bun run tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add tests/
git commit -m "test: clean up tests for deleted commands and verify full test suite"
```

---

### Task 7: Git Push & Server Verification

**Files:**
- Repository: `main` branch

- [ ] **Step 1: Push changes to GitHub**

```bash
git push origin main
```

- [ ] **Step 2: Monitor deployment on `ocsgam`**

```bash
ssh ocsgam "docker ps --filter name=zwush-wa-bot"
ssh ocsgam "docker logs --tail 40 zwush-wa-bot"
```
Verify container restarted, WhatsApp connection open, and groups discovered.
