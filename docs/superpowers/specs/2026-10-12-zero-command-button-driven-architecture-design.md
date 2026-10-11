# Zero-Command & Button-Driven Architecture Specification

## 1. Overview & Motivation

Zwush WhatsApp Bot previously evolved into an interactive, zero-text customer experience, but retained legacy slash command files and command registries under the hood. Furthermore, admins were still expected to type text commands (`/done`, `/paid`, `/reprocess`, `/solved`) in the group to manage orders and tickets.

This specification defines the transition to a **Zero-Command & Button-Driven Architecture**:
1. **Zero Text Commands for Customers**: Customers have 0 slash commands. All interactions occur through native WhatsApp buttons and list menus.
2. **Minimal Text Commands for Admins**: Only 3 essential slash commands remain in the Admin Group:
   - `/maintenance` (`on`, `off`, `status`)
   - `/sync` (resync catalog)
   - `/saldo` (alias `/balance`)
3. **Button-Driven Admin Workflows**:
   - Every transaction log in `ZwushLogs` includes a quoted follow-up message with action buttons: `[ ✅ Tandai Paid ]` and `[ 🚀 Proses / Done ]`.
   - Any order failure or hold (e.g., token exhaustion, gamertag mismatch) quotes the original transaction log with the failure reason and an interactive button: `[ 🔄 Retry Order ]`.
   - Support tickets / live chat notifications in `ZwushAdmin` include an interactive button: `[ ✅ Selesai / Solved ]`.
4. **Codebase Clean-Up**:
   - Complete deletion of `src/commands/general/` (all 10 command files removed).
   - Deletion of obsolete admin command files (`done.ts`, `paid.ts`, `reprocess.ts`, `solved.ts`, `orders.ts`, `admin.ts`, `discount.ts`, `voucher.ts`, `setgroup.ts`).
   - Customer button actions (`btn_start_buying`, `btn_check_payment`, `btn_cancel_order`, `btn_history`) execute native flow handlers without delegating to command classes.
   - Admin action buttons execute direct service functions in `src/handlers/adminActions.ts`.

---

## 2. Architecture & Components

```
                   ┌───────────────────────────────────────────────┐
                   │             WhatsApp Event Entry              │
                   │               (src/index.ts)                  │
                   └──────────────────────┬────────────────────────┘
                                          │
                                          ▼
                   ┌───────────────────────────────────────────────┐
                   │            Message & Action Router            │
                   │           (src/handlers/message.ts)           │
                   └──────────────┬─────────────────┬──────────────┘
                                  │                 │
                Private 1:1 Chat  │                 │ Group Chat
                                  ▼                 ▼
             ┌────────────────────────┐         ┌─────────────────────────┐
             │ Customer Flow Handlers │         │ Is Admin Group?         │
             │ - Greeting buttons     │         └────┬──────────────┬─────┘
             │ - Buying wizard flow   │              │              │
             │ - Invoice actions      │              ▼              ▼
             │ - History pagination   │       Admin Actions     3 Slash Cmds
             │ (NO slash commands)    │      (btn_admin_*)     - /maintenance
             └────────────────────────┘     (src/handlers/     - /sync
                                             adminActions.ts)  - /saldo
```

### 2.1 Interaction Rules by Chat Type

| Chat Context | User Role | Allowed Interactions | Prohibited Interactions |
| :--- | :--- | :--- | :--- |
| **Private Chat (1:1)** | Customer | Interactive Buttons, List Menus, Gamertag text, Voucher text | ALL slash commands (silently dropped or falls back to welcome buttons) |
| **Private Chat (1:1)** | Admin | Identical to customer, **PLUS** bypasses maintenance mode | ALL slash commands & admin action buttons |
| **Log Group (`ZwushLogs`)** | Admin | Interactive action buttons (`btn_admin_paid_*`, `btn_admin_done_*`, `btn_admin_reprocess_*`) | Text slash commands (ignored) |
| **Admin Group (`ZwushAdmin`)** | Admin | Interactive action buttons (`btn_admin_solved_*`), Slash commands: `/maintenance`, `/sync`, `/saldo` | All other slash commands |
| **Other Groups** | Anyone | None | Bot ignores all messages completely |

---

## 3. Detailed Component Design

### 3.1 Admin Group Logger (`src/handlers/adminLogger.ts`)

#### A. New Order Logging with Quoted Action Buttons
When `logNewOrder(order)` is called:
1. Send main order log card to `logGroupJid`:
   ```text
   📦 *ORDER BARU — ZWUSH STORE*

   🆔 ID: *#ORD-123456*
   🛍️ Item: *1 Hour XP Boost*
   👤 Gamertag: *Steve*
   💰 Total: *Rp 8.000*
   📱 Pembeli: wa.me/628123456789
   📊 Status: *⏳ Menunggu Pembayaran*
   ```
2. Save `messageKey` (`{ id, remoteJid, fromMe: true }`) in `OrderLogEntry`.
3. Immediately send a follow-up interactive button message quoting `messageKey`:
   - Quote: `messageKey`
   - Body: `Aksi Admin untuk Order #ORD-123456:`
   - Buttons:
     - `[ ✅ Tandai Paid ]` (`id: btn_admin_paid_ORD-123456`)
     - `[ 🚀 Proses / Done ]` (`id: btn_admin_done_ORD-123456`)

#### B. Order Failure / Held with Quoted Retry Button
When `updateOrderStatus(orderId, status, extra)` is called with status `FAILED` or `HELD` (e.g. `notifyInsufficientTokens`, `notifyDelayedPayment`, or CoreClient callback):
1. Update / edit the main log card with the new status badge.
2. Send a follow-up interactive message quoting the original `messageKey`:
   - Quote: `messageKey` (or target group if not found)
   - Body:
     ```text
     ⚠️ *KENDALA PESANAN #ORD-123456*
     Alasan: [Failure Reason / Token Kurang / Pembayaran Terlambat]

     👉 Silakan periksa kendala di atas, lalu klik tombol di bawah untuk mencoba memproses kembali:
     ```
   - Button:
     - `[ 🔄 Retry Order ]` (`id: btn_admin_reprocess_ORD-123456`)

#### C. Live Chat / Support Notification with Solved Button
When `notifySupportRequest(info)` is called in `adminGroupJid`:
1. Send support alert mentioning `@everyone` or all group participants.
2. Follow up or send as interactive message:
   - Body:
     ```text
     🚨 *PERMINTAAN BANTUAN PELANGGAN — SUPPORT TICKET* 🚨
     @everyone

     Ada pembeli yang memerlukan bantuan manual admin:
     📱 WhatsApp: wa.me/628123456789
     🆔 Order ID: *#ORD-123456*
     ⚠️ Kendala: [Kendala]

     💡 *Setelah selesai membantu pelanggan, klik tombol di bawah untuk mengaktifkan bot kembali:*
     ```
   - Button:
     - `[ ✅ Selesai / Solved ]` (`id: btn_admin_solved_628123456789@s.whatsapp.net`)

---

### 3.2 Admin Action Service (`src/handlers/adminActions.ts`)

Extract admin action click handling into a dedicated module that calls `CoreClient` and `StateManager` directly without command wrappers:

1. **`handleAdminPaid(orderId, ctx, remoteJid, sender)`**:
   - Calls `ctx.client.markOrderPaid(orderId)`.
   - Calls `ctx.client.reprocessOrder(orderId)` to trigger auto-delivery to The Hive.
   - Sends reply to group: `✅ Pesanan *#${orderId}* berhasil ditandai LUNAS dan sedang diproses ke The Hive oleh @sender`.

2. **`handleAdminDone(orderId, ctx, remoteJid, sender)`**:
   - Calls `ctx.client.updateOrderStatus(orderId, "COMPLETED")`.
   - Sends reply to group: `✅ Pesanan *#${orderId}* berhasil diselesaikan secara manual oleh @sender`.

3. **`handleAdminReprocess(orderId, ctx, remoteJid, sender)`**:
   - Calls `ctx.client.reprocessOrder(orderId)`.
   - Sends reply to group: `🔄 Pesanan *#${orderId}* berhasil dikirim ulang ke The Hive oleh @sender`.

4. **`handleAdminSolved(targetJidOrOrderId, ctx, remoteJid, sender)`**:
   - Resolves target user session from memory or Core API order.
   - Clears `LIVE_CHAT` step and resets session to `IDLE`.
   - Sends closing message to customer: `✅ *SESI BANTUAN SELESAI* ...`.
   - Sends confirmation to Admin Group: `✅ Tiket live chat untuk *${target}* telah diselesaikan oleh @sender. Bot otomatis telah aktif kembali!`.

---

### 3.3 The 3 Retained Admin Slash Commands (`src/commands/admin/`)

Only three commands will be registered in `defaultRegistry`:
1. **`/maintenance`** (`src/commands/admin/maintenance.ts`):
   - Arguments: `on`, `off`, `status`.
   - Saves maintenance flag in `StateManager` and disk `./.auth/maintenance_state.json`.
2. **`/sync`** (`src/commands/admin/sync.ts`):
   - Refreshes catalog cache from Core API.
3. **`/saldo` / `/balance`** (`src/commands/admin/balance.ts`):
   - Checks balance / Gibot tokens from Core API and formats rupiah/token summary.

All other commands will be deleted from the filesystem and unmapped.

---

### 3.4 Decoupling Customer Button Handlers (`src/handlers/message.ts`)

Existing button callbacks will no longer import or invoke legacy command files:
- `btn_start_buying` -> calls category list menu builder and `ctx.sendList`.
- `btn_check_payment` -> calls `ctx.client.getOrderStatus` and formats status directly.
- `btn_cancel_order` -> cancels session in `StateManager` and notifies customer directly.
- `btn_history` / `btn_hist_page_*` -> fetches orders from `ctx.client.getOrders` and builds paginated history buttons directly.
- Bare order ID (`#ORD-...`) -> fetches order status from `ctx.client.getOrderStatus` and formats status directly.

---

## 4. File Changes & Clean-Up Plan

### Files to Delete:
- `src/commands/general/cancel.ts`
- `src/commands/general/catalog.ts`
- `src/commands/general/checkPayment.ts`
- `src/commands/general/faq.ts`
- `src/commands/general/help.ts`
- `src/commands/general/history.ts`
- `src/commands/general/language.ts`
- `src/commands/general/menu.ts`
- `src/commands/general/status.ts`
- `src/commands/general/support.ts`
- `src/commands/admin/admin.ts`
- `src/commands/admin/discount.ts`
- `src/commands/admin/done.ts`
- `src/commands/admin/orders.ts`
- `src/commands/admin/paid.ts`
- `src/commands/admin/reprocess.ts`
- `src/commands/admin/setgroup.ts`
- `src/commands/admin/solved.ts`
- `src/commands/admin/voucher.ts`
- `src/commands/orderHelper.ts` (merge remaining utilities or delete)

### Files to Add / Modify:
- `src/handlers/adminActions.ts` (New: dedicated handler functions for admin buttons)
- `src/handlers/adminLogger.ts` (Updated: quoted messages for order actions and failure retry, solved button for live chat)
- `src/utils/interactiveBuilders.ts` (Updated: builders for order action buttons, failure retry buttons, solved buttons)
- `src/handlers/message.ts` (Updated: clean decoupled button actions, zero text commands in private chat, only 3 commands in admin group)
- `src/commands/index.ts` (Updated: exports only maintenance, sync, balance)
- `tests/*` (Updated: test cases reflecting new button actions and verifying deleted commands do not exist)

---

## 5. Verification & Testing Strategy

1. **Unit Tests**:
   - `adminLogger.test.ts`: Verify `logNewOrder` sends quoted action buttons (`btn_admin_paid_*`, `btn_admin_done_*`).
   - `adminLogger.test.ts`: Verify order failure sends quoted retry button (`btn_admin_reprocess_*`).
   - `adminLogger.test.ts`: Verify `notifySupportRequest` sends interactive solved button (`btn_admin_solved_*`).
   - `adminActions.test.ts`: Verify each admin button click performs expected Core API actions and group replies.
   - `maintenanceMode.test.ts`: Verify `/maintenance` works in admin group, and command is prohibited in private chat.
   - `interactiveBuyingFlow.test.ts`: Verify all customer buttons (`btn_start_buying`, `btn_check_payment`, `btn_cancel_order`, `btn_history`) operate seamlessly without legacy command files.
2. **Type Checking**:
   - Run `bun run tsc --noEmit` to ensure 0 broken imports across the repository.
3. **Full Test Suite**:
   - Run `bun test` to confirm all test suites pass.
4. **Deploy & Server Log Verification**:
   - Push to `main`, observe GitHub Actions build & deploy to `ocsgam`.
   - Inspect live container logs to confirm healthy start and WhatsApp connection.
