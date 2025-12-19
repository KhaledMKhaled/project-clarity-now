import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { eq } from "drizzle-orm";

process.env.DATABASE_URL ||= process.env.TEST_DATABASE_URL || "postgres://localhost:5432/test";

const { db, pool } = await import("../db");
const { storage } = await import("../storage");
const { shipments, shipmentPayments } = await import("@shared/schema");

const parseAmount = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : parseFloat(value as any);
  return Number.isFinite(parsed) ? parsed : 0;
};

async function createTestShipment(overrides: Partial<typeof shipments.$inferInsert> = {}) {
  const [shipment] = await db
    .insert(shipments)
    .values({
      shipmentCode: `TX-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      shipmentName: "Atomicity Check",
      purchaseDate: new Date(),
      purchaseCostRmb: "100.00",
      purchaseRmbToEgpRate: "10.00",
      customsCostEgp: "50.00",
      takhreegCostEgp: "0",
      commissionCostRmb: "0",
      shippingCostRmb: "0",
      status: "جديدة",
      ...overrides,
    })
    .returning();

  return shipment;
}

async function cleanupShipment(shipmentId: number) {
  await db.delete(shipmentPayments).where(eq(shipmentPayments.shipmentId, shipmentId));
  await db.delete(shipments).where(eq(shipments.id, shipmentId));
}

const buildPayment = (shipmentId: number) => ({
  shipmentId,
  paymentDate: new Date(),
  paymentCurrency: "EGP",
  amountOriginal: "100.00",
  amountEgp: "100.00",
  costComponent: "شراء",
  paymentMethod: "نقدي",
  createdByUserId: "tester",
});

describe("payment transaction atomicity", () => {
  after(async () => {
    await pool.end();
  });

  it("commits payment with synchronized totals", async () => {
    const shipment = await createTestShipment();

    try {
      const payment = await storage.createPayment(buildPayment(shipment.id));

      const [reloadedShipment] = await db
        .select()
        .from(shipments)
        .where(eq(shipments.id, shipment.id));
      const payments = await db
        .select()
        .from(shipmentPayments)
        .where(eq(shipmentPayments.shipmentId, shipment.id));

      assert.equal(payments.length, 1);
      assert.equal(payments[0].id, payment.id);

      const expectedTotal = 1000 + 50; // RMB converted with rate + customs
      assert.equal(parseAmount(reloadedShipment.purchaseCostEgp), 1000);
      assert.equal(parseAmount(reloadedShipment.finalTotalCostEgp), expectedTotal);
      assert.equal(parseAmount(reloadedShipment.totalPaidEgp), 100);
      assert.equal(parseAmount(reloadedShipment.balanceEgp), expectedTotal - 100);
    } finally {
      await cleanupShipment(shipment.id);
    }
  });

  it("rolls back the payment insert and shipment updates when an error occurs after insert", async () => {
    const shipment = await createTestShipment();

    try {
      await assert.rejects(() =>
        storage.createPayment(buildPayment(shipment.id), {
          simulatePostInsertError: true,
        })
      );

      const payments = await db
        .select()
        .from(shipmentPayments)
        .where(eq(shipmentPayments.shipmentId, shipment.id));
      const [reloadedShipment] = await db
        .select()
        .from(shipments)
        .where(eq(shipments.id, shipment.id));

      assert.equal(payments.length, 0);
      assert.equal(parseAmount(reloadedShipment.totalPaidEgp), 0);
      assert.equal(parseAmount(reloadedShipment.balanceEgp), 0);
      assert.equal(parseAmount(reloadedShipment.finalTotalCostEgp), 0);
    } finally {
      await cleanupShipment(shipment.id);
    }
  });
});
