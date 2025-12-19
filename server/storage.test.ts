import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  Shipment,
  ShipmentCustomsDetails,
  ShipmentItem,
  ShipmentShippingDetails,
} from "@shared/schema";
import { computeShipmentKnownTotal, MissingRmbRateError } from "./storage";

const baseShipment: Shipment = {
  id: 1,
  shipmentCode: "S-1",
  shipmentName: "Test",
  purchaseDate: new Date("2024-01-01"),
  status: "جديدة",
  invoiceCustomsDate: null,
  createdByUserId: null,
  purchaseCostRmb: "0",
  purchaseCostEgp: "0",
  purchaseRmbToEgpRate: "0",
  commissionCostRmb: "0",
  commissionCostEgp: "0",
  shippingCostRmb: "0",
  shippingCostEgp: "0",
  customsCostEgp: "0",
  takhreegCostEgp: "0",
  finalTotalCostEgp: "0",
  totalPaidEgp: "0",
  balanceEgp: "0",
  partialDiscountRmb: "0",
  discountNotes: null,
  lastPaymentDate: null,
  createdAt: new Date("2024-01-02"),
  updatedAt: new Date("2024-01-02"),
};

const buildShipment = (overrides: Partial<Shipment>): Shipment => ({
  ...baseShipment,
  ...overrides,
});

const buildItem = (overrides: Partial<ShipmentItem>): ShipmentItem => ({
  id: 1,
  shipmentId: baseShipment.id,
  supplierId: null,
  productId: null,
  productType: null,
  productName: "Item",
  description: null,
  countryOfOrigin: "China",
  imageUrl: null,
  cartonsCtn: 0,
  piecesPerCartonPcs: 0,
  totalPiecesCou: 0,
  purchasePricePerPiecePriRmb: "0",
  totalPurchaseCostRmb: "0",
  customsCostPerCartonEgp: null,
  totalCustomsCostEgp: null,
  takhreegCostPerCartonEgp: null,
  totalTakhreegCostEgp: null,
  createdAt: new Date("2024-01-02"),
  updatedAt: new Date("2024-01-02"),
  ...overrides,
});

describe("computeShipmentKnownTotal", () => {
  it("sums available EGP components for جديدة without NaN", () => {
    const shipment = buildShipment({
      status: "جديدة",
      purchaseCostEgp: "150.50",
      customsCostEgp: "25",
      takhreegCostEgp: "0",
    });

    const total = computeShipmentKnownTotal({ shipment });

    assert.equal(total, 175.5);
  });

  it("converts RMB-only totals using the shipment purchase rate for في انتظار الشحن", () => {
    const shipment = buildShipment({
      status: "في انتظار الشحن",
      purchaseCostRmb: "200",
      shippingCostRmb: "30",
      commissionCostRmb: "20",
      purchaseRmbToEgpRate: "5",
    });

    const total = computeShipmentKnownTotal({ shipment });

    assert.equal(total, 1250);
  });

  it("uses shipping details and item fallbacks for جاهزة للاستلام", () => {
    const shipment = buildShipment({
      status: "جاهزة للاستلام",
      purchaseCostEgp: "0",
      purchaseCostRmb: "0",
      customsCostEgp: "0",
      takhreegCostEgp: "0",
    });

    const shippingDetails: ShipmentShippingDetails = {
      id: 1,
      shipmentId: shipment.id,
      totalPurchaseCostRmb: "0",
      commissionRatePercent: "0",
      commissionValueRmb: "10",
      commissionValueEgp: "0",
      shippingAreaSqm: "0",
      shippingCostPerSqmUsdOriginal: null,
      totalShippingCostUsdOriginal: null,
      totalShippingCostRmb: "0",
      totalShippingCostEgp: "40",
      shippingDate: null,
      rmbToEgpRateAtShipping: null,
      usdToRmbRateAtShipping: null,
      sourceOfRates: null,
      ratesUpdatedAt: null,
      createdAt: new Date("2024-01-03"),
      updatedAt: new Date("2024-01-03"),
    };

    const customsDetails: ShipmentCustomsDetails = {
      id: 1,
      shipmentId: shipment.id,
      totalCustomsCostEgp: "0",
      totalTakhreegCostEgp: "0",
      customsInvoiceDate: null,
      createdAt: new Date("2024-01-03"),
      updatedAt: new Date("2024-01-03"),
    };

    const items: ShipmentItem[] = [
      buildItem({
        id: 10,
        cartonsCtn: 2,
        totalPurchaseCostRmb: "60",
        customsCostPerCartonEgp: "5",
        takhreegCostPerCartonEgp: "3",
      }),
      buildItem({
        id: 11,
        cartonsCtn: 1,
        totalPurchaseCostRmb: "40",
        customsCostPerCartonEgp: "4",
        takhreegCostPerCartonEgp: "3",
      }),
    ];

    const total = computeShipmentKnownTotal({
      shipment,
      shippingDetails,
      customsDetails,
      items,
      latestRmbToEgpRate: 6.2,
    });

    assert.equal(total, 745);
  });

  it("prefers payment rates before defaults for مستلمة بنجاح", () => {
    const shipment = buildShipment({
      status: "مستلمة بنجاح",
      shippingCostRmb: "20",
      customsCostEgp: "10",
      purchaseRmbToEgpRate: "0",
    });

    const total = computeShipmentKnownTotal({
      shipment,
      paymentRmbToEgpRate: 5.5,
      defaultRmbToEgpRate: 6.5,
    });

    assert.equal(total, 120);
  });

  it("throws when RMB totals are present without any usable rate", () => {
    const shipment = buildShipment({
      status: "في انتظار الشحن",
      purchaseCostRmb: "100",
      purchaseRmbToEgpRate: "0",
    });

    assert.throws(() => {
      computeShipmentKnownTotal({ shipment });
    }, MissingRmbRateError);
  });
});
