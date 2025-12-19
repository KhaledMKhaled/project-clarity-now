import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type { Shipment, ShipmentPayment } from "@shared/schema";
import { getPaymentsWithShipments } from "./payments";

const baseShipment: Shipment = {
  id: 10,
  shipmentCode: "SH-10",
  shipmentName: "Test Shipment",
  purchaseDate: new Date("2024-01-01"),
  status: "جديدة",
  invoiceCustomsDate: null,
  createdByUserId: null,
  purchaseCostRmb: "0",
  purchaseCostEgp: "0",
  commissionCostRmb: "0",
  commissionCostEgp: "0",
  shippingCostRmb: "0",
  shippingCostEgp: "0",
  customsCostEgp: "0",
  takhreegCostEgp: "0",
  finalTotalCostEgp: "0",
  totalPaidEgp: "0",
  balanceEgp: "0",
  lastPaymentDate: null,
  createdAt: new Date("2024-01-02"),
  updatedAt: new Date("2024-01-02"),
};

const createPayment = (overrides: Partial<ShipmentPayment>): ShipmentPayment => ({
  id: 1,
  shipmentId: baseShipment.id,
  paymentDate: new Date("2024-02-01"),
  paymentCurrency: "EGP",
  amountOriginal: "100.00",
  exchangeRateToEgp: null,
  amountEgp: "100.00",
  paymentMethod: "نقدي",
  cashReceiverName: "Ali",
  referenceNumber: null,
  note: null,
  createdByUserId: null,
  createdAt: new Date("2024-02-02"),
  updatedAt: new Date("2024-02-02"),
  ...overrides,
});

describe("getPaymentsWithShipments", () => {
  it("fetches shipments once for multiple payments and combines the results", async () => {
    const payments = [
      createPayment({ id: 1 }),
      createPayment({ id: 2, shipmentId: baseShipment.id }),
    ];

    const storage = {
      getAllPayments: mock.fn(async () => payments),
      getShipmentsByIds: mock.fn(async (_ids: number[]) => [baseShipment]),
    };

    const result = await getPaymentsWithShipments(storage);

    assert.equal(storage.getShipmentsByIds.mock.calls.length, 1);
    assert.equal(result.length, payments.length);
    assert.ok(result.every((payment) => payment.shipment?.id === baseShipment.id));
  });

  it("skips shipment lookup when there are no payments", async () => {
    const storage = {
      getAllPayments: mock.fn(async () => [] as ShipmentPayment[]),
      getShipmentsByIds: mock.fn(async () => [] as Shipment[]),
    };

    const result = await getPaymentsWithShipments(storage);

    assert.equal(storage.getShipmentsByIds.mock.calls.length, 0);
    assert.deepEqual(result, []);
  });
});
