import QRCode from "qrcode";

/**
 * Generates a high-contrast PNG Buffer of the dynamic QRIS string.
 */
export async function generateQrisBuffer(qrisString: string): Promise<Buffer> {
    if (!qrisString || qrisString.trim().length === 0) {
        throw new Error("QRIS string cannot be empty");
    }

    return await QRCode.toBuffer(qrisString, {
        type: "png",
        margin: 2,
        width: 512,
        errorCorrectionLevel: "M",
        color: {
            dark: "#000000",
            light: "#FFFFFF"
        }
    });
}
