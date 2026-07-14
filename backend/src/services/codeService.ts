import QRCode from "qrcode";
import bwipjs from "bwip-js";

export class CodeService {
  async generateQrPng(value: string, sizePx: number): Promise<Buffer> {
    return QRCode.toBuffer(value || " ", {
      type: "png",
      width: Math.max(64, Math.floor(sizePx)),
      margin: 1,
      errorCorrectionLevel: "M",
    });
  }

  async generateBarcodePng(value: string, widthPx: number, heightPx: number): Promise<Buffer> {
    const png = await bwipjs.toBuffer({
      bcid: "code128",
      text: value || "0",
      scale: 3,
      height: Math.max(8, Math.floor(heightPx / 3)),
      includetext: false,
      width: Math.max(1, Math.floor(widthPx / 10)),
    });
    return png;
  }
}
