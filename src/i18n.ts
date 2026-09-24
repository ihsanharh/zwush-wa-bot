import type { CatalogItem, OrderNotificationPayload, OrderStatus } from "./types";
import { config } from "./config";

export type Language = "id" | "en";

export function formatRupiah(amount: number): string {
    return `Rp ${amount.toLocaleString("id-ID")}`;
}

export function formatStatusBadge(status: string, lang: Language = "id", failureReason?: string | null): string {
    if (lang === "en") {
        switch (status) {
            case "PENDING_PAYMENT":
                return "⏳ Awaiting Payment";
            case "QUEUED":
                return "💳 Payment Received / In Queue";
            case "GIFTING":
                return "🎁 Sending In-Game Gift (The Hive)";
            case "SUCCESS":
                return "✅ Delivered (Completed)";
            case "INSUFFICIENT_TOKENS":
                return "⚠️ Awaiting Restock";
            case "EXPIRED":
                return "⏱️ Expired (Cancelled)";
            case "FAILED":
                return `❌ Failed: ${failureReason || "Unknown"}`;
            default:
                return status;
        }
    }

    switch (status) {
        case "PENDING_PAYMENT":
            return "⏳ Menunggu Pembayaran";
        case "QUEUED":
            return "💳 Pembayaran Diterima / Dalam Antrean";
        case "GIFTING":
            return "🎁 Sedang Dikirim ke In-Game (The Hive)";
        case "SUCCESS":
            return "✅ Selesai Dikirim";
        case "INSUFFICIENT_TOKENS":
            return "⚠️ Token Kurang / Menunggu Restock";
        case "EXPIRED":
            return "⏱️ Kedaluwarsa (Batal)";
        case "FAILED":
            return `❌ Gagal: ${failureReason || "Tidak Diketahui"}`;
        default:
            return status;
    }
}

export function formatStatusNotification(
    payload: OrderNotificationPayload,
    adminPhone: string,
    lang: Language = "id",
    storeName?: string
): string {
    const { orderId, gamertag, itemName, status, message } = payload;
    const store = storeName || config.STORE_NAME || "Store";

    if (lang === "en") {
        switch (status) {
            case "QUEUED":
                return (
                    `✅ *PAYMENT RECEIVED!*\n\n` +
                    `Your order *#${orderId}* (*${itemName}* for *${gamertag}*) has been verified 🎉\n\n` +
                    `⏳ Your item is now queued for automated delivery to The Hive. Please allow 1–2 minutes!`
                );
            case "GIFTING":
                return (
                    `🎁 *IN-GAME DELIVERY IN PROGRESS*\n\n` +
                    `${store} bot is logging into The Hive to deliver *${itemName}* to Gamertag *${gamertag}*.\n` +
                    `Please wait a moment...`
                );
            case "SUCCESS":
                return (
                    `🎉 *ORDER DELIVERED SUCCESSFULLY!*\n\n` +
                    `📦 Item: *${itemName}*\n` +
                    `👤 Gamertag: *${gamertag}*\n` +
                    `🆔 Order ID: #${orderId}\n\n` +
                    `Please check your *Mailbox / Gift Box* in The Hive Bedrock.\n` +
                    `Thank you for shopping with *${store}*! ✨`
                );
            case "INSUFFICIENT_TOKENS":
                return (
                    `ℹ️ *ORDER UPDATE #${orderId}*\n\n` +
                    `Hi there! We received your payment. Currently our server is restocking gifts for The Hive.\n\n` +
                    `Your order will automatically be delivered as soon as tokens are ready. If not delivered within 10 minutes, please reach out to admin via */help*! 🥰`
                );
            case "EXPIRED":
                return (
                    `⏱️ *ORDER EXPIRED*\n\n` +
                    `The 15-minute payment window for order *#${orderId}* has expired.\n` +
                    `This QRIS is no longer valid. Please do not make payment.\n\n` +
                    `Type */buy* if you wish to place a new order.\n` +
                    `_(If you already transferred after expiry, contact admin at wa.me/${adminPhone})_`
                );
            case "FAILED":
                return (
                    `❌ *DELIVERY FAILED*\n\n` +
                    `Order *#${orderId}* could not be delivered.\n` +
                    `Reason: ${message || "Unknown"}\n\n` +
                    `Don't worry, please contact our admin at wa.me/${adminPhone} with your order ID.`
                );
            default:
                return `ℹ️ Order #${orderId} status: ${status}`;
        }
    }

    // Indonesian default
    switch (status) {
        case "QUEUED":
            return (
                `✅ *PEMBAYARAN DITERIMA!*\n\n` +
                `Pesanan kamu *#${orderId}* (*${itemName}* untuk *${gamertag}*) sudah berhasil diverifikasi 🎉\n\n` +
                `⏳ Pesanan saat ini sedang dalam antrean pengiriman otomatis ke The Hive. Mohon tunggu 1–2 menit ya kak!`
            );
        case "GIFTING":
            return (
                `🎁 *PROSES PENGIRIMAN IN-GAME*\n\n` +
                `Bot ${store} sedang login ke The Hive untuk mengirimkan *${itemName}* ke Gamertag *${gamertag}*.\n` +
                `Mohon tunggu sebentar ya kak...`
            );
        case "SUCCESS":
            return (
                `🎉 *PESANAN BERHASIL DIKIRIM!*\n\n` +
                `📦 Item: *${itemName}*\n` +
                `👤 Gamertag: *${gamertag}*\n` +
                `🆔 Order ID: #${orderId}\n\n` +
                `Silakan periksa *Mailbox / Gift Box* kamu di The Hive Bedrock.\n` +
                `Terima kasih telah berbelanja di *${store}*! ✨`
            );
        case "INSUFFICIENT_TOKENS":
            return (
                `ℹ️ *UPDATE PESANAN #${orderId}*\n\n` +
                `Halo kak! Pembayaran kamu sudah kami terima dengan baik. Saat ini server sedang antre restock gift The Hive.\n\n` +
                `Pesanan kamu akan otomatis diproses begitu token siap ya kak. Jika dalam 10 menit belum terkirim, silakan langsung chat admin via */bantuan* ya! 🥰`
            );
        case "EXPIRED":
            return (
                `⏱️ *PESANAN KEDALUWARSA*\n\n` +
                `Batas waktu pembayaran 15 menit untuk pesanan *#${orderId}* telah habis.\n` +
                `QRIS tersebut sudah tidak berlaku. Jangan melakukan pembayaran lagi.\n\n` +
                `Ketik */beli* jika kamu ingin membuat pesanan baru.\n` +
                `_(Jika kamu terlanjur transfer setelah kedaluwarsa, hubungi admin di wa.me/${adminPhone})_`
            );
        case "FAILED":
            return (
                `❌ *PENGIRIMAN GAGAL*\n\n` +
                `Pesanan *#${orderId}* gagal dikirim.\n` +
                `Alasan: ${message || "Tidak diketahui"}\n\n` +
                `Jangan khawatir, silakan hubungi admin kami di wa.me/${adminPhone} dengan menyertakan ID pesanan kamu.`
            );
        default:
            return `ℹ️ Pesanan #${orderId} status: ${status}`;
    }
}

export interface StringParams {
    adminNumber?: string;
    phone?: string;
    orderId?: string;
    itemName?: string;
    gamertag?: string;
    totalNominal?: number;
    count?: number;
    catName?: string;
    storeName?: string;
    isAdmin?: boolean;
    code?: string;
    discountNominal?: number;
    finalPrice?: number;
    percent?: number;
    discountType?: string;
    discountValue?: string | number;
    maxUses?: string | number | null;
}

export function t(key: string, lang: Language, params?: StringParams): string {
    const admin = params?.adminNumber || "admin";
    const phone = params?.phone || "";
    const store = params?.storeName || config.STORE_NAME || "Store";
    const storeUpper = store.toUpperCase();

    if (lang === "en") {
        switch (key) {
            case "greeting":
                return (
                    `Hello! Welcome to *${store}* 🛒✨\n\n` +
                    `We provide official Minecraft Bedrock cosmetics for The Hive at up to 50% discount!\n\n` +
                    `Type */buy* to view our catalog & start ordering 😊`
                );

            case "helpMessage": {
                let msg = (
                    `🤖 *${storeUpper} HELP*\n\n` +
                    `Hi there! Here are the commands you can use:\n\n` +
                    `• */buy* : View catalog & start buying The Hive cosmetics\n` +
                    `• */buy <1-6>* : Directly open category catalog (e.g. */buy 2*)\n` +
                    `• */status* : Check your active order status (or */status <ID>*)\n` +
                    `• */history* : View your recent order history\n` +
                    `• */faq* : FAQ about QRIS payment & item delivery\n` +
                    `• */language <id|en>* : Switch language preference\n` +
                    `• *c* / *cancel* : Cancel ongoing order flow\n` +
                    `• *b* / *back* : Go back 1 step during ordering\n\n` +
                    `👤 Need direct support from admin? Chat us at: *wa.me/${admin}*`
                );
                if (params?.isAdmin) {
                    msg += (
                        `\n\n🛠️ *ADMIN ONLY COMMANDS:*\n` +
                        `• */admin* : Open admin status & control panel\n` +
                        `• */reprocess* : Reprocess token-held / failed orders\n` +
                        `• */reprocess <ID>* : Reprocess a specific order\n` +
                        `• */setgroup* : Register chat group as Admin Group\n` +
                        `• */setdiscount <0-90>* : Set global store discount percentage\n` +
                        `• */voucher* : Manage promo voucher codes (list/create/delete)`
                    );
                }
                return msg;
            }

            case "faqMessage":
                return (
                    `💬 *FAQ & PAYMENT INFO — ${storeUpper}*\n\n` +
                    `*1. What payment methods are accepted?*\n` +
                    `You can pay via *QRIS*! Supports all Indonesian e-wallets (GoPay, OVO, DANA, ShopeePay) & Mobile Banking (BCA, Mandiri, BRI, BNI, etc.) 📱\n\n` +
                    `*2. Why is there a 3-digit unique code in the total?*\n` +
                    `The 3-digit code allows our system to *automatically verify your payment in seconds* without uploading transfer receipts! Please transfer the exact amount including the last 3 digits ✨\n\n` +
                    `*3. How is the item delivered?*\n` +
                    `Items are gifted 100% officially via *The Hive In-Game Gift* feature directly to your Minecraft Bedrock Gamertag 🎁\n\n` +
                    `*4. How long does delivery take?*\n` +
                    `Once payment is detected, our bot delivers your gift within *1 - 3 minutes* ⚡\n\n` +
                    `Any questions? Contact our admin at: *wa.me/${admin}* 😊`
                );

            case "crossLanguageHint":
                return `💡 Hi there! You're currently using *English* mode. Please use */buy* to browse and purchase, or switch language with */language id* 😊`;

            case "groupCheckoutRedirection":
                return `Hi @${phone}! ✨ For your privacy and payment security, we've sent the catalog & order form directly to your private chat! Please check your direct message 😊`;

            case "languageSwitched":
                return `✅ Language successfully switched to *English*! 🇬🇧\nType */buy* to browse our catalog or */help* for guidance.`;

            case "currentLanguageStatus":
                return `🌐 *Language Settings*: English 🇬🇧\nTo switch back to Indonesian, type */bahasa id* or */language id*.`;

            case "cancelSuccess":
                return `Got it! Your order has been cancelled. Whenever you're ready to order again, just type */buy*! 😊`;

            case "noActiveOrderToCancel":
                return `You don't have any active order right now. Type */buy* to start shopping! 😊`;

            case "invalidCategory":
                return `Oops, that category number is not valid 😊\nPlease type a number from *1* to *6*, or type *c* to cancel.`;

            case "invalidItem":
                return `Oops, that item selection was not recognized 😊\nPlease type the item number from the image above or type *b* to go back.`;

            case "invalidGamertag":
                return `Oops, that Minecraft Gamertag is invalid 😅\nGamertags must be 3 to 16 characters (letters, numbers, and spaces only).\nExample: *Steve123* (type *b* to go back, *c* to cancel).`;

            case "confirmPrompt":
                return `Please reply *YES* if the details are correct to generate your QRIS 😊\n(Or reply *b* to change gamertag, *c* to cancel)`;

            case "emptyOrders":
                return `Hi there! You don't have any order history yet 😊\n\nStart shopping for Hive cosmetics by typing */buy*!`;

            case "voucherPrompt":
                return `💡 *Have a voucher?* Type *voucher <CODE>* (example: *voucher SAVE10*)`;

            case "voucherApplied":
                return `🎟️ *Voucher '${params?.code}' applied!*\n💰 Discount: *${formatRupiah(params?.discountNominal || 0)}*\n💵 New Total: *${formatRupiah(params?.finalPrice || 0)}*`;

            case "voucherInvalid":
                return `⚠️ Voucher *${params?.code}* is invalid or not found. Please double-check your code.`;

            case "voucherExhausted":
                return `⚠️ Usage quota for voucher *${params?.code}* has been exhausted.`;

            case "voucherExpired":
                return `⚠️ Voucher *${params?.code}* has expired.`;

            case "discountUpdated":
                return `✅ Store discount successfully updated to *${params?.percent}%*! Catalog and posters have been refreshed.`;

            case "voucherCreated":
                return `✅ Voucher *${params?.code}* successfully created! (Type: ${params?.discountType}, Value: ${params?.discountValue}, Quota: ${params?.maxUses ?? "Unlimited"})`;

            case "voucherDeleted":
                return `✅ Voucher *${params?.code}* has been deactivated successfully!`;

            default:
                return "";
        }
    }

    // Indonesian default
    switch (key) {
        case "greeting":
            return (
                `Halo kak! Selamat datang di *${store}* 🛒✨\n\n` +
                `Kami menyediakan kosmetik resmi The Hive Minecraft Bedrock dengan diskon s/d 50%!\n\n` +
                `Yuk ketik */beli* untuk melihat katalog & mulai memesan ya kak 😊`
            );

        case "helpMessage": {
            let msg = (
                `🤖 *BANTUAN ${storeUpper}*\n\n` +
                `Halo kak! Ini daftar perintah yang bisa kakak gunakan:\n\n` +
                `• */beli* : Lihat katalog & mulai belanja kosmetik The Hive\n` +
                `• */beli <1-6>* : Langsung buka katalog kategori (contoh: */beli 2*)\n` +
                `• */status* : Cek status pesanan aktif kakak (atau */status <ID>*)\n` +
                `• */riwayat* : Lihat daftar riwayat pesanan kakak\n` +
                `• */faq* : Tanya jawab pembayaran QRIS & pengiriman item\n` +
                `• */bahasa <id|en>* : Ganti pilihan bahasa bot\n` +
                `• *b* / *batal* : Batalkan pesanan yang sedang berjalan\n` +
                `• *k* / *kembali* : Kembali ke langkah sebelumnya saat belanja\n\n` +
                `👤 Butuh bantuan langsung dari admin? Chat kami di: *wa.me/${admin}*`
            );
            if (params?.isAdmin) {
                msg += (
                    `\n\n🛠️ *PERINTAH KHUSUS ADMIN:*\n` +
                    `• */admin* : Buka panel status & kontrol admin\n` +
                    `• */reprocess* : Proses ulang semua order tertahan token\n` +
                    `• */reprocess <ID>* : Proses ulang order tertentu\n` +
                    `• */setgroup* : Daftarkan grup obrolan sebagai Admin Group\n` +
                    `• */setdiskon <0-90>* : Ubah persentase diskon toko global\n` +
                    `• */voucher* : Kelola kode voucher promo (list/create/delete)`
                );
            }
            return msg;
        }

        case "faqMessage":
            return (
                `💬 *FAQ & CARA PEMBAYARAN — ${storeUpper}*\n\n` +
                `*1. Pembayaran pakai apa saja kak?*\n` +
                `Bisa pakai *QRIS* ya! Mendukung semua e-wallet (GoPay, OVO, DANA, ShopeePay) & Mobile Banking (BCA, Mandiri, BRI, BNI, dll) 📱\n\n` +
                `*2. Kenapa ada 3 digit kode unik di total nominal?*\n` +
                `Kode unik berfungsi agar pembayaran kakak *otomatis terverifikasi sistem dalam hitungan detik* tanpa perlu repot kirim bukti transfer! Pastikan transfer tepat sampai digit terakhir ya ✨\n\n` +
                `*3. Bagaimana item dikirimkan?*\n` +
                `Item dikirimkan 100% resmi via fitur *In-Game Gift The Hive* langsung ke Gamertag Minecraft Bedrock kakak 🎁\n\n` +
                `*4. Berapa lama proses pengiriman?*\n` +
                `Setelah pembayaran masuk, bot langsung memproses gift dalam waktu *1 - 3 menit* ⚡\n\n` +
                `Ada pertanyaan lain kak? Hubungi admin kami di: *wa.me/${admin}* 😊`
            );

        case "crossLanguageHint":
            return `💡 Halo kak! Bahasa kamu saat ini adalah *Bahasa Indonesia*. Gunakan */beli* untuk mulai belanja, atau ubah bahasa dengan */bahasa en* ya 😊`;

        case "groupCheckoutRedirection":
            return `Halo @${phone}! ✨ Untuk kenyamanan & keamanan pembayaran QRIS kakak, katalog dan formulir pemesanan sudah kami kirimkan ke chat pribadi ya! Silakan cek chat dari kami 😊`;

        case "languageSwitched":
            return `✅ Bahasa berhasil diubah ke *Bahasa Indonesia*! 🇮🇩\nKetik */beli* untuk melihat katalog atau */bantuan* untuk melihat panduan.`;

        case "currentLanguageStatus":
            return `🌐 *Pengaturan Bahasa*: Bahasa Indonesia 🇮🇩\nUntuk beralih ke Bahasa Inggris, ketik */bahasa en* atau */language en*.`;

        case "cancelSuccess":
            return `Siap kak, pemesanan telah dibatalkan ya. Kalau mau belanja lagi nanti, tinggal ketik */beli* aja ya kak! 😊`;

        case "noActiveOrderToCancel":
            return `Saat ini tidak ada pesanan aktif yang sedang berlangsung ya kak. Ketik */beli* untuk mulai belanja! 😊`;

        case "invalidCategory":
            return `Waduh, nomor kategorinya belum tepat nih kak 😊\nSilakan ketik angka *1* s/d *6* sesuai kategori yang diinginkan, atau ketik *b* untuk keluar ya.`;

        case "invalidItem":
            return `Waduh, pilihan itemnya belum sesuai nih kak 😊\nSilakan ketik nomor item dari gambar di atas atau ketik *k* untuk kembali.`;

        case "invalidGamertag":
            return `Waduh, Gamertag tidak valid nih kak 😅\nGamertag Minecraft harus terdiri dari 3 hingga 16 karakter (hanya huruf, angka, dan spasi ya).\nContoh: *Steve123* (atau ketik *k* untuk ganti item, *b* untuk batal).`;

        case "confirmPrompt":
            return `Balas *YA* jika pesanan sudah sesuai untuk membuat QRIS ya kak 😊\n(Atau balas *k* untuk ganti gamertag, *b* untuk batal)`;

        case "emptyOrders":
            return `Halo kak! Kakak belum memiliki riwayat pesanan nih 😊\n\nYuk mulai belanja kosmetik The Hive dengan ketik */beli* ya!`;

        case "voucherPrompt":
            return `💡 *Punya voucher?* Ketik *voucher <KODE>* (contoh: *voucher HEMAT*)`;

        case "voucherApplied":
            return `🎟️ *Voucher '${params?.code}' berhasil dipasang!*\n💰 Potongan: *${formatRupiah(params?.discountNominal || 0)}*\n💵 Total Baru: *${formatRupiah(params?.finalPrice || 0)}*`;

        case "voucherInvalid":
            return `⚠️ Voucher *${params?.code}* tidak valid atau tidak ditemukan nih kak. Silakan periksa kembali ya.`;

        case "voucherExhausted":
            return `⚠️ Kuota penggunaan untuk voucher *${params?.code}* sudah habis kak.`;

        case "voucherExpired":
            return `⚠️ Voucher *${params?.code}* sudah kedaluwarsa kak.`;

        case "discountUpdated":
            return `✅ Diskon toko berhasil diubah menjadi *${params?.percent}%*! Katalog dan poster telah diperbarui.`;

        case "voucherCreated":
            return `✅ Voucher *${params?.code}* berhasil dibuat! (Tipe: ${params?.discountType}, Nilai: ${params?.discountValue}, Kuota: ${params?.maxUses ?? "Tak terbatas"})`;

        case "voucherDeleted":
            return `✅ Voucher *${params?.code}* berhasil dinonaktifkan!`;

        default:
            return "";
    }
}
