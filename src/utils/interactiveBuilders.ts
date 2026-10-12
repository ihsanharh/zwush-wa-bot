import { proto } from "zapo-js";
import { formatRupiah, formatStatusBadge, t, type Language } from "../i18n";
import { config } from "../config";
import type { CategoryDefinition } from "./categories";
import type { CatalogItem, OrderInfo, PaginationInfo, VoucherItem } from "../types";

/**
 * Generic helper to construct interactive native flow quick reply messages.
 */
export function buildQuickReplyPayload(
    text: string,
    buttons: Array<{ id: string; text: string }>,
    options?: { footer?: string; header?: any }
): { interactiveMessage: any; text: string; buttons: Array<{ id: string; text: string }> } {
    const interactiveMessage: any = {
        body: { text },
        nativeFlowMessage: {
            messageVersion: 1,
            buttons: buttons.map((btn) => ({
                name: "quick_reply",
                buttonParamsJson: JSON.stringify({
                    display_text: btn.text,
                    id: btn.id
                })
            }))
        }
    };
    if (options?.footer) {
        interactiveMessage.footer = { text: options.footer };
    }
    if (options?.header) {
        interactiveMessage.header = options.header;
    }
    return {
        interactiveMessage,
        text,
        buttons
    };
}

/**
 * Builds Category List Menu (Single Select Drawer)
 */
export function buildCategoryListMenu(
    categories: CategoryDefinition[],
    lang: Language = "id"
): { listMessage: any } {
    const store = config.STORE_NAME;
    const title = t("interactive.categoryListTitle", lang, { store });
    const description = t("interactive.categoryListDesc", lang);
    const buttonText = t("interactive.categoryListBtn", lang);

    const rows = categories.map((cat) => ({
        rowId: `cat_${cat.dbCategory}`,
        title: cat.displayName.replace(/^\d+\.\s*/, ""),
        description: cat.displayPrice || ""
    }));

    return {
        listMessage: {
            title,
            description,
            buttonText,
            footerText: `${store} • The Hive Bedrock`,
            listType: proto.Message.ListMessage.ListType.SINGLE_SELECT,
            sections: [
                {
                    title,
                    rows
                }
            ]
        }
    };
}

/**
 * Builds Paginated Item List Menu with navigation controls
 */
export function buildPaginatedItemListMenu(
    items: CatalogItem[],
    category: CategoryDefinition,
    page: number = 1,
    pageSize: number = 8,
    lang: Language = "id"
): { listMessage: any } {
    const store = config.STORE_NAME;
    const activeItems = items.filter((i) => i.active && i.category === category.dbCategory);
    const totalPages = Math.max(1, Math.ceil(activeItems.length / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);

    const startIdx = (safePage - 1) * pageSize;
    const pageItems = activeItems.slice(startIdx, startIdx + pageSize);

    const itemRows = pageItems.map((item) => {
        const priceStr = formatRupiah(item.rupiahPrice);
        const discountStr = item.discountPercent ? ` (${item.discountPercent}% OFF)` : "";
        return {
            rowId: `item_${item.sku || item.name}`,
            title: item.name,
            description: `${priceStr}${discountStr}`
        };
    });

    const navRows: Array<{ rowId: string; title: string; description?: string }> = [];

    if (safePage < totalPages) {
        navRows.push({
            rowId: `nav_page_${safePage + 1}`,
            title: t("interactive.navNextPage", lang, { nextPage: safePage + 1, totalPages }),
            description: t("interactive.itemsListBtn", lang)
        });
    }

    if (safePage > 1) {
        navRows.push({
            rowId: `nav_page_${safePage - 1}`,
            title: t("interactive.navPrevPage", lang, { prevPage: safePage - 1, totalPages }),
            description: t("interactive.itemsListBtn", lang)
        });
    }

    navRows.push({
        rowId: "nav_change_cat",
        title: t("interactive.navChangeCategory", lang)
    });

    const categoryTitle = t("interactive.itemsListTitle", lang, { categoryName: category.displayName });

    return {
        listMessage: {
            title: categoryTitle,
            description: `${t("interactive.itemsListBtn", lang)} (${safePage}/${totalPages})`,
            buttonText: t("interactive.itemsListBtn", lang),
            footerText: `${store} • The Hive Bedrock`,
            listType: proto.Message.ListMessage.ListType.SINGLE_SELECT,
            sections: [
                {
                    title: categoryTitle,
                    rows: itemRows
                },
                {
                    title: t("interactive.navSectionTitle", lang),
                    rows: navRows
                }
            ]
        }
    };
}

/**
 * Builds Gamertag Prompt Buttons (Quick Reply buttons: [Ganti Item], [Batalkan Pesanan])
 * Supports attaching an item image directly to the interactive card header.
 */
export function buildGamertagPromptButtons(
    promptText: string,
    lang: Language = "id",
    headerImage?: Buffer | any
): {
    interactiveMessage: any;
    text: string;
    buttons: Array<{ id: string; text: string }>;
    headerImage?: Buffer;
} {
    const store = config.STORE_NAME;
    const buttons = [
        {
            id: "btn_modify_change_item",
            text: t("buttons.changeItem", lang)
        },
        {
            id: "btn_cancel_order",
            text: t("buttons.cancelOrder", lang)
        }
    ];

    let headerOption: any = undefined;
    if (
        headerImage &&
        typeof headerImage === "object" &&
        !Buffer.isBuffer(headerImage) &&
        (headerImage.url || headerImage.directPath)
    ) {
        headerOption = {
            hasMediaAttachment: true,
            imageMessage: headerImage
        };
    }

    const payload = buildQuickReplyPayload(promptText, buttons, {
        footer: store,
        header: headerOption
    });

    return {
        ...payload,
        headerImage: Buffer.isBuffer(headerImage) ? headerImage : undefined
    };
}

/**
 * Builds Gamertag Change Prompt Buttons (Single quick reply button: [ Batal ])
 */
export function buildGamertagChangePromptButtons(
    promptText: string,
    lang: Language = "id"
): {
    interactiveMessage: any;
    text: string;
    buttons: Array<{ id: string; text: string }>;
} {
    const store = config.STORE_NAME;
    const cancelText = t("buttons.cancel", lang);
    const buttons = [
        {
            id: "btn_cancel_gamertag",
            text: cancelText
        }
    ];

    return buildQuickReplyPayload(promptText, buttons, { footer: store });
}

/**
 * Builds Order Confirmation Buttons (Max 3 buttons for Meta limits)
 */
export function buildOrderConfirmationButtons(
    orderSummaryText: string,
    hasVoucher: boolean = false,
    lang: Language = "id"
): { interactiveMessage: any } {
    const store = config.STORE_NAME;

    const voucherBtnText = hasVoucher
        ? t("buttons.removeVoucher", lang)
        : t("buttons.applyVoucher", lang);

    const voucherBtnId = hasVoucher ? "btn_remove_voucher" : "btn_open_voucher";

    return buildQuickReplyPayload(
        orderSummaryText,
        [
            { id: "btn_confirm_order", text: t("buttons.confirmOrder", lang) },
            { id: voucherBtnId, text: voucherBtnText },
            { id: "btn_modify_menu", text: t("buttons.modifyMenu", lang) }
        ],
        { footer: `${store} • Automated Checkout` }
    );
}

/**
 * Builds Modify Order Sub-Menu (Single Select List)
 */
export function buildModifyOrderListMenu(lang: Language = "id"): { listMessage: any } {
    const store = config.STORE_NAME;
    return {
        listMessage: {
            title: t("interactive.modifyMenuTitle", lang),
            description: t("interactive.modifyMenuDesc", lang),
            buttonText: t("buttons.modifyMenu", lang),
            footerText: store,
            listType: proto.Message.ListMessage.ListType.SINGLE_SELECT,
            sections: [
                {
                    title: t("interactive.modifyMenuTitle", lang),
                    rows: [
                        {
                            rowId: "opt_change_gamertag",
                            title: t("interactive.modifyGamertag", lang)
                        },
                        {
                            rowId: "opt_change_item",
                            title: t("interactive.modifyItem", lang)
                        },
                        {
                            rowId: "opt_cancel_order",
                            title: t("interactive.modifyCancel", lang)
                        }
                    ]
                }
            ]
        }
    };
}

/**
 * Builds Voucher Prompt Buttons (Native quick reply button: [ Batal ])
 */
export function buildVoucherPromptButtons(
    promptText: string,
    lang: Language = "id"
): {
    interactiveMessage: any;
    text: string;
    buttons: Array<{ id: string; text: string }>;
} {
    const store = config.STORE_NAME;
    const cancelText = t("buttons.cancel", lang);
    const buttons = [
        {
            id: "btn_cancel_voucher",
            text: cancelText
        }
    ];

    return buildQuickReplyPayload(promptText, buttons, { footer: store });
}

/**
 * Builds Invoice Buttons (QRIS payment card)
 */
export function buildInvoiceButtons(
    invoiceText: string,
    lang: Language = "id",
    headerImage?: Buffer | any
): {
    interactiveMessage: any;
    text: string;
    buttons: Array<{ id: string; text: string }>;
    headerImage?: Buffer;
} {
    const store = config.STORE_NAME;
    let headerOption: any = undefined;
    if (
        headerImage &&
        typeof headerImage === "object" &&
        !Buffer.isBuffer(headerImage) &&
        (headerImage.url || headerImage.directPath)
    ) {
        headerOption = {
            hasMediaAttachment: true,
            imageMessage: headerImage
        };
    }

    const payload = buildQuickReplyPayload(
        invoiceText,
        [
            { id: "btn_check_payment", text: t("buttons.checkPayment", lang) },
            { id: "btn_cancel_order", text: t("buttons.cancelOrder", lang) }
        ],
        {
            footer: `${store} • QRIS Dinamis`,
            header: headerOption
        }
    );

    return {
        ...payload,
        headerImage: Buffer.isBuffer(headerImage) ? headerImage : undefined
    };
}


/**
 * Builds Quick Action Buttons for New Orders in Admin Log Group (Paid & Done)
 */
export function buildAdminOrderActionButtons(
    orderId: string,
    lang: Language = "id"
): { interactiveMessage: any; text: string; buttons: Array<{ id: string; text: string }> } {
    const text = t("interactive.adminOrderActionPrompt", lang, { orderId });
    const buttons = [
        { id: `btn_admin_paid_${orderId}`, text: t("buttons.markPaid", lang) },
        { id: `btn_admin_done_${orderId}`, text: t("buttons.markCompleted", lang) }
    ];
    return buildQuickReplyPayload(text, buttons);
}

/**
 * Builds Quick Retry Buttons for Failed or Held Orders in Admin Log Group
 */
export function buildAdminOrderFailureButtons(
    orderId: string,
    failureReason?: string,
    lang: Language = "id"
): { interactiveMessage: any; text: string; buttons: Array<{ id: string; text: string }> } {
    const reason = failureReason || t("interactive.defaultAdminFailureReason", lang);
    const text = t("interactive.adminOrderFailurePrompt", lang, { orderId, reason });
    const buttons = [
        { id: `btn_admin_reprocess_${orderId}`, text: t("buttons.retry", lang) }
    ];
    return buildQuickReplyPayload(text, buttons);
}

/**
 * Builds Follow-up Error & Live Chat Support Button for Buyer
 */
export function buildUserOrderFailureButtons(
    orderId: string,
    failureReason?: string,
    lang: Language = "id"
): { interactiveMessage: any; text: string; buttons: Array<{ id: string; text: string }> } {
    const reason = failureReason || t("interactive.defaultFailureReason", lang);
    const text = t("interactive.userOrderFailurePrompt", lang, { orderId, reason });
    const buttons = [
        { id: `btn_start_livechat_${orderId}`, text: t("buttons.startLiveChat", lang) }
    ];
    return buildQuickReplyPayload(text, buttons);
}

/**
 * Builds Live Chat Ticket Solved Button for Admin Group
 */
export function buildAdminSupportSolvedButtons(
    target: string,
    lang: Language = "id"
): { interactiveMessage: any; text: string; buttons: Array<{ id: string; text: string }> } {
    const text = t("interactive.adminSupportSolvedPrompt", lang);
    const buttons = [
        { id: `btn_admin_solved_${target}`, text: t("buttons.solved", lang) }
    ];
    return buildQuickReplyPayload(text, buttons);
}

/**
 * Builds Interactive Admin Panel List Menu (Drawer) for Admin Group
 */
export function buildAdminPanelMenu(
    lang: Language = "id",
    isMaintenanceOn = false
): { listMessage: any } {
    const store = config.STORE_NAME;
    const title = t("interactive.adminPanelTitle", lang, { store });
    const description = t("interactive.adminPanelDesc", lang, { store });
    const buttonText = t("interactive.adminPanelBtn", lang);
    const maintStatus = isMaintenanceOn ? "🔴 Mode: ON (Aktif)" : "🟢 Mode: OFF (Normal)";

    return {
        listMessage: {
            title,
            description,
            buttonText,
            footerText: `${store} • Admin Control Panel`,
            listType: proto.Message.ListMessage.ListType.SINGLE_SELECT,
            sections: [
                {
                    title: "Status & Kontrol Bot",
                    rows: [
                        {
                            rowId: "admin_panel_balance",
                            title: t("interactive.adminBtnBalance", lang),
                            description: "Lihat saldo token Hive & omset penjualan"
                        },
                        {
                            rowId: "admin_panel_maintenance",
                            title: t("interactive.adminBtnMaintenance", lang),
                            description: `Status Maintenance (${maintStatus})`
                        },
                        {
                            rowId: "admin_panel_sync",
                            title: t("interactive.adminBtnSync", lang),
                            description: "Sinkronisasi katalog item Hive via gibot"
                        }
                    ]
                },
                {
                    title: "Manajemen Toko",
                    rows: [
                        {
                            rowId: "admin_panel_orders",
                            title: t("interactive.adminBtnOrders", lang),
                            description: "Daftar pesanan tertahan token / pending"
                        },
                        {
                            rowId: "admin_panel_vouchers",
                            title: t("interactive.adminBtnVoucher", lang),
                            description: "Ringkasan voucher promo & diskon toko"
                        }
                    ]
                }
            ]
        }
    };
}

/**
 * Builds Quick Reply Buttons for Admin Panel fallback
 */
export function buildAdminPanelQuickReply(
    lang: Language = "id",
    isMaintenanceOn = false
): { interactiveMessage: any; text: string; buttons: Array<{ id: string; text: string }> } {
    const store = config.STORE_NAME;
    const maintStatus = isMaintenanceOn ? "🔴 ON" : "🟢 OFF";
    const text = `⚙️ *PANEL KONTROL ADMIN — ${store.toUpperCase()}*\n\n` +
        `• Status Maintenance: *${maintStatus}*\n\n` +
        `Silakan pilih menu kontrol admin di bawah:\n` +
        `_(💡 Ketik *voucher* atau *saldo* untuk akses cepat)_`;
    const buttons = [
        { id: "admin_panel_balance", text: t("interactive.adminBtnBalance", lang) },
        { id: "admin_panel_vouchers", text: "🎟️ Kelola Voucher" },
        { id: "admin_panel_more", text: "⚙️ Menu Lainnya ➡️" }
    ];
    return buildQuickReplyPayload(text, buttons, { footer: `${store} • Admin Panel` });
}

/**
 * Builds Maintenance Mode Interactive Controls (Toggle Buttons)
 */
export function buildAdminMaintenanceButtons(
    isMaintenanceOn: boolean,
    lang: Language = "id"
): { interactiveMessage: any; text: string; buttons: Array<{ id: string; text: string }> } {
    const store = config.STORE_NAME;
    const statusText = isMaintenanceOn ? "AKTIF (ON) 🔴" : "NONAKTIF (OFF) 🟢";
    const text = t("admin.maintenanceStatus", lang, { storeUpper: store.toUpperCase(), status: statusText });
    const buttons = [
        { id: isMaintenanceOn ? "btn_admin_maint_off" : "btn_admin_maint_on", text: isMaintenanceOn ? t("buttons.maintOff", lang) : t("buttons.maintOn", lang) },
        { id: "btn_admin_panel", text: t("buttons.adminPanel", lang) }
    ];
    return buildQuickReplyPayload(text, buttons);
}

/**
 * Builds Balance Summary Action Buttons (Refresh + Back to Panel)
 */
export function buildAdminBalanceButtons(
    balanceText: string,
    lang: Language = "id"
): { interactiveMessage: any; text: string; buttons: Array<{ id: string; text: string }> } {
    const buttons = [
        { id: "btn_admin_balance_refresh", text: t("buttons.refreshBalance", lang) },
        { id: "btn_admin_panel", text: t("buttons.adminPanel", lang) }
    ];
    return buildQuickReplyPayload(balanceText, buttons);
}

/**
 * Builds Welcome Quick-Reply Buttons (Catalog, History, Settings)
 */
export function buildWelcomeButtons(lang: Language = "id"): { interactiveMessage: any } {
    const store = config.STORE_NAME;
    const buttons = [
        { id: "btn_start_buying", text: t("buttons.browseCatalog", lang) },
        { id: "btn_history", text: t("buttons.orderHistory", lang) },
        { id: "btn_settings", text: t("buttons.settingsAndInfo", lang) }
    ];
    return buildQuickReplyPayload(t("greeting", lang), buttons, { footer: `${store} • The Hive Bedrock` });
}

/**
 * Builds Settings & Information List Menu (Drawer)
 */
export function buildSettingsListMenu(lang: Language = "id"): { listMessage: any } {
    const store = config.STORE_NAME;
    const title = t("interactive.settingsTitle", lang);
    const description = t("interactive.settingsDesc", lang);
    const buttonText = t("interactive.settingsBtn", lang);

    const switchLangTitle = lang === "id" ? t("interactive.switchLangEn", lang) : t("interactive.switchLangId", lang);
    const switchLangDesc = lang === "id" ? t("interactive.switchLangEnDesc", lang) : t("interactive.switchLangIdDesc", lang);

    return {
        listMessage: {
            title,
            description,
            buttonText,
            footerText: `${store} • The Hive Bedrock`,
            listType: proto.Message.ListMessage.ListType.SINGLE_SELECT,
            sections: [
                {
                    title,
                    rows: [
                        {
                            rowId: "act_switch_lang",
                            title: switchLangTitle,
                            description: switchLangDesc
                        },
                        {
                            rowId: "act_view_faq",
                            title: t("interactive.faqTitle", lang),
                            description: t("interactive.faqDesc", lang)
                        }
                    ]
                }
            ]
        }
    };
}

/**
 * Builds Paginated Order History Buttons (Card text + Quick Reply buttons)
 */
export function buildOrderHistoryButtons(
    orders: (OrderInfo[] & { pagination?: PaginationInfo }) | OrderInfo[],
    page: number = 1,
    pageSize: number = 5,
    lang: Language = "id",
    customTotalPages?: number
): {
    interactiveMessage: any;
    text: string;
    buttons: Array<{ id: string; text: string }>;
} {
    const store = config.STORE_NAME;
    const pagination = (orders as { pagination?: PaginationInfo }).pagination;
    const isServerPaginated = customTotalPages !== undefined || pagination !== undefined;
    const totalPages = Math.max(
        1,
        customTotalPages ?? pagination?.totalPages ?? Math.ceil(orders.length / pageSize)
    );
    const safePage = Math.min(Math.max(1, page), totalPages);

    const startIdx = (safePage - 1) * pageSize;
    const pageOrders = isServerPaginated ? orders : orders.slice(startIdx, startIdx + pageSize);

    let out = t("history.pageTitle", lang, { page: safePage, totalPages, store });

    pageOrders.forEach((ord, idx) => {
        const globalIdx = startIdx + idx + 1;
        const badge = formatStatusBadge(ord.status, lang, ord.failureReason);
        out += `${globalIdx}. *#${ord.id}* — ${badge}\n`;
        out += `   📦 ${ord.itemName} (${ord.gamertag})\n`;
        out += `   💰 ${formatRupiah(ord.totalNominal)}\n\n`;
    });

    out += t("history.footer", lang);

    const buttonsList: Array<{ id: string; text: string }> = [];

    if (safePage > 1) {
        buttonsList.push({
            id: `btn_hist_page_${safePage - 1}`,
            text: t("buttons.prevPage", lang)
        });
    }

    if (safePage < totalPages) {
        const nextLabel = t("buttons.nextPage", lang, { nextPage: safePage + 1, totalPages });
        const safeNextLabel = nextLabel.length <= 20 ? nextLabel : t("buttons.nextPageShort", lang);
        buttonsList.push({
            id: `btn_hist_page_${safePage + 1}`,
            text: safeNextLabel
        });
    }

    buttonsList.push({
        id: "btn_start_buying",
        text: t("buttons.browseCatalog", lang)
    });

    return buildQuickReplyPayload(out, buttonsList, { footer: `${store} • The Hive Bedrock` });
}

/**
 * Builds Order Cancelled Notice with quick-reply buttons (e.g. Beli Kosmetik, Riwayat Pesanan)
 */
export function buildOrderCancelledButtons(
    message: string,
    lang: Language = "id"
): {
    interactiveMessage: any;
    text: string;
    buttons: Array<{ id: string; text: string }>;
} {
    const store = config.STORE_NAME;
    const buttons = [
        { id: "btn_start_buying", text: t("buttons.browseCatalog", lang) },
        { id: "btn_history", text: t("buttons.orderHistory", lang) }
    ];
    return buildQuickReplyPayload(message, buttons, { footer: `${store} • The Hive Bedrock` });
}

/**
 * Builds Order Success / Delivered Notice with quick-reply buttons (e.g. Beli Lagi, Riwayat Pesanan)
 */
export function buildOrderSuccessButtons(
    message: string,
    lang: Language = "id"
): {
    interactiveMessage: any;
    text: string;
    buttons: Array<{ id: string; text: string }>;
} {
    const store = config.STORE_NAME;
    const buttons = [
        { id: "btn_start_buying", text: t("buttons.buyAgain", lang) },
        { id: "btn_history", text: t("buttons.orderHistory", lang) }
    ];
    return buildQuickReplyPayload(message, buttons, { footer: `${store} • The Hive Bedrock` });
}

/**
 * Builds Payment Pending / Check Payment Retry Notice with quick-reply button (Cek Pembayaran)
 */
export function buildPaymentPendingButtons(
    message: string,
    lang: Language = "id"
): {
    interactiveMessage: any;
    text: string;
    buttons: Array<{ id: string; text: string }>;
} {
    const store = config.STORE_NAME;
    const buttons = [
        { id: "btn_check_payment", text: t("buttons.checkPayment", lang) }
    ];
    return buildQuickReplyPayload(message, buttons, { footer: `${store} • QRIS Dinamis` });
}

/**
 * Builds Order Expired Notice with quick-reply buttons (Beli Kosmetik, Riwayat Pesanan)
 */
export function buildOrderExpiredButtons(
    message: string,
    lang: Language = "id"
): {
    interactiveMessage: any;
    text: string;
    buttons: Array<{ id: string; text: string }>;
} {
    const store = config.STORE_NAME;
    const buttons = [
        { id: "btn_start_buying", text: t("buttons.browseCatalog", lang) },
        { id: "btn_history", text: t("buttons.orderHistory", lang) }
    ];
    return buildQuickReplyPayload(message, buttons, { footer: `${store} • The Hive Bedrock` });
}

/**
 * Builds Voucher Management Overview Menu (List, Buat, Kembali)
 */
export function buildAdminVouchersOverview(
    discountPercent: number,
    activeVouchers: number,
    totalVouchers: number,
    lang: Language = "id"
): { interactiveMessage: any; text: string; buttons: Array<{ id: string; text: string }> } {
    const text = `🎟️ *MANAJEMEN VOUCHER & DISKON*\n\n` +
        `• Diskon Global Toko: *${discountPercent}%*\n` +
        `• Total Voucher Aktif: *${activeVouchers}* voucher\n` +
        `• Total Voucher Terdaftar: *${totalVouchers}* voucher\n\n` +
        `💡 _Diskon toko diterapkan langsung ke seluruh katalog item. Voucher tambahan dapat diklaim pembeli saat konfirmasi order._\n\n` +
        `Silakan pilih menu manajemen voucher di bawah:`;
    const buttons = [
        { id: "btn_admin_voucher_list", text: "📋 List Voucher" },
        { id: "btn_admin_voucher_create", text: "➕ Buat Voucher" },
        { id: "btn_admin_panel", text: t("buttons.adminPanel", lang) }
    ];
    return buildQuickReplyPayload(text, buttons);
}

/**
 * Builds Voucher List Display with Management Hint & Quick Action Buttons
 */
export function buildAdminVoucherListMessage(
    vouchers: VoucherItem[],
    lang: Language = "id"
): { interactiveMessage: any; text: string; buttons: Array<{ id: string; text: string }> } {
    let text = `📋 *DAFTAR VOUCHER ZWUSH STORE*\n\n`;

    if (vouchers.length === 0) {
        text += `_Belum ada voucher yang terdaftar di database._\n\nKlik tombol *[➕ Buat Baru]* di bawah untuk membuat voucher pertama!`;
    } else {
        vouchers.slice(0, 15).forEach((v, idx) => {
            const statusBadge = v.active ? "🟢 Aktif" : "🔴 Nonaktif";
            const discountStr = v.discountType === "PERCENT"
                ? `${v.discountValue}%`
                : `Rp ${v.discountValue.toLocaleString("id-ID")}`;
            const maxUsesStr = v.maxUses !== null ? `${v.maxUses}` : "∞ (Tanpa Batas)";
            text += `${idx + 1}. 🏷️ *${v.code}* (${statusBadge})\n` +
                `   • Diskon: *${discountStr}*\n` +
                `   • Kuota: *${v.usedCount} / ${maxUsesStr}*\n\n`;
        });
        text += `👉 *Ketik KODE voucher* (contoh: *${vouchers[0].code}*) di chat ini untuk mengedit atau menghapus voucher secara permanen!`;
    }

    const buttons = [
        { id: "btn_admin_voucher_create", text: "➕ Buat Baru" },
        { id: "btn_admin_voucher_list", text: "🔄 Refresh" },
        { id: "btn_admin_panel", text: t("buttons.adminPanel", lang) }
    ];
    return buildQuickReplyPayload(text, buttons);
}

/**
 * Builds Individual Voucher Detail Card with Action Buttons
 */
export function buildAdminVoucherDetailCard(
    voucher: VoucherItem,
    lang: Language = "id"
): { interactiveMessage: any; text: string; buttons: Array<{ id: string; text: string }> } {
    const statusText = voucher.active ? "🟢 Aktif" : "🔴 Nonaktif";
    const discountStr = voucher.discountType === "PERCENT"
        ? `${voucher.discountValue}%`
        : `Rp ${voucher.discountValue.toLocaleString("id-ID")}`;
    const maxUsesStr = voucher.maxUses !== null ? `${voucher.maxUses} kali` : "Tanpa Batas";
    const expiredStr = voucher.expiresAt ? new Date(voucher.expiresAt).toLocaleDateString("id-ID") : "Tanpa Batas";

    const text = `🏷️ *DETAIL VOUCHER: ${voucher.code}*\n\n` +
        `• Status: *${statusText}*\n` +
        `• Tipe Potongan: *${discountStr}*\n` +
        `• Penggunaan: *${voucher.usedCount} / ${maxUsesStr}*\n` +
        `• Kadaluwarsa: *${expiredStr}*\n\n` +
        `Silakan pilih tindakan untuk voucher ini:`;

    const toggleText = voucher.active ? "🔴 Nonaktifkan" : "🟢 Aktifkan";
    const buttons = [
        { id: `btn_admin_voucher_toggle_${voucher.code}`, text: toggleText },
        { id: `btn_admin_voucher_edit_menu_${voucher.code}`, text: "✏️ Edit Voucher" },
        { id: `btn_admin_voucher_del_confirm_${voucher.code}`, text: "🗑️ Hapus Permanen" }
    ];
    return buildQuickReplyPayload(text, buttons);
}

/**
 * Builds Voucher Edit Menu Buttons (Edit Diskon vs Edit Kuota)
 */
export function buildAdminVoucherEditMenu(
    code: string,
    lang: Language = "id"
): { interactiveMessage: any; text: string; buttons: Array<{ id: string; text: string }> } {
    const text = `✏️ *EDIT VOUCHER: ${code}*\n\nPilih bagian voucher yang ingin Anda ubah:`;
    const buttons = [
        { id: `btn_admin_voucher_edit_val_${code}`, text: "1. Nilai Diskon" },
        { id: `btn_admin_voucher_edit_max_${code}`, text: "2. Kuota Maksimal" },
        { id: "btn_admin_voucher_cancel", text: "❌ Batal" }
    ];
    return buildQuickReplyPayload(text, buttons);
}

/**
 * Builds Voucher Delete Confirmation Card
 */
export function buildAdminVoucherDeleteConfirm(
    code: string,
    lang: Language = "id"
): { interactiveMessage: any; text: string; buttons: Array<{ id: string; text: string }> } {
    const text = `⚠️ *KONFIRMASI HAPUS VOUCHER*\n\n` +
        `Voucher *${code}* akan *benar-benar dihapus secara permanen dari database*!\n\n` +
        `Apakah Anda yakin ingin menghapus voucher ini selamanya?`;
    const buttons = [
        { id: `btn_admin_voucher_del_exec_${code}`, text: "🗑️ Ya, Hapus Permanen" },
        { id: "btn_admin_voucher_cancel", text: "❌ Batal" }
    ];
    return buildQuickReplyPayload(text, buttons);
}



