export type ShippingQuotationRequest = {
  carrier: "spx";
  province: string;
  district: string;
  ward: string;
  addressLine: string;
  packageCount: number;
  actualWeightKg: number;
  chargeableWeightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  codAmount: number;
};

export type ShippingQuotation = {
  fee: number;
  estimatedDelivery: string;
  carrier: "spx";
  source: "spx" | "development_mock";
};

export interface ShippingQuotationService {
  quote(request: ShippingQuotationRequest): Promise<ShippingQuotation>;
}

class SpxShippingQuotationService implements ShippingQuotationService {
  async quote(request: ShippingQuotationRequest): Promise<ShippingQuotation> {
    // SPX quotation has not been integrated yet. Never return fabricated prices in production.
    if (!import.meta.env.DEV) {
      throw new Error("Dịch vụ báo giá SPX chưa được cấu hình.");
    }

    await new Promise((resolve) => window.setTimeout(resolve, 450));

    // Development-only deterministic quote, deliberately calculated instead of hard-coding demo output.
    const weightUnits = Math.max(1, Math.ceil(request.chargeableWeightKg));
    const oversizeUnits = Math.max(0, Math.ceil((request.lengthCm + request.widthCm + request.heightCm - 100) / 20));
    const fee = Math.round((18_000 + weightUnits * 4_500 + oversizeUnits * 3_000 + Math.max(0, request.packageCount - 1) * 6_000) / 1000) * 1000;

    return {
      fee,
      estimatedDelivery: request.province.toLocaleLowerCase("vi-VN").includes("hà nội") ? "1–3 ngày" : "2–4 ngày",
      carrier: "spx",
      source: "development_mock",
    };
  }
}

export const shippingQuotationService: ShippingQuotationService = new SpxShippingQuotationService();
