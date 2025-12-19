import assert from "node:assert/strict";
import { createServer } from "http";
import type { AddressInfo } from "net";
import express from "express";
import test, { beforeEach, mock } from "node:test";

import type { InsertShipmentPayment, ShipmentPayment } from "@shared/schema";

process.env.DATABASE_URL ||= "postgres://example.com:5432/test";
process.env.SESSION_SECRET ||= "test-secret";

type ShipmentState = {
  status: string;
  total: number;
  paid: number;
};

const shipmentSeeds = [
  { id: 101, status: "جديدة" },
  { id: 102, status: "في انتظار الشحن" },
  { id: 103, status: "جاهزة للاستلام" },
  { id: 104, status: "مستلمة بنجاح" },
];

const storageState: {
  shipments: Map<number, ShipmentState>;
  payments: ShipmentPayment[];
} = {
  shipments: new Map(),
  payments: [],
};

const createAuditLogMock = mock.fn(async () => ({}));

const createPaymentMock = mock.fn(async (data: InsertShipmentPayment) => {
  const shipment = storageState.shipments.get(data.shipmentId);

  if (!shipment) {
    const error = new Error("Shipment not found");
    (error as any).status = 404;
    throw error;
  }

  const attempted = Number(data.amountEgp);
  const remaining = Math.max(0, shipment.total - shipment.paid);

  if (attempted > remaining + 0.0001) {
    const error = new Error("Overpay not allowed");
    (error as any).status = 409;
    throw error;
  }

  shipment.paid += attempted;

  const payment: ShipmentPayment = {
    id: storageState.payments.length + 1,
    shipmentId: data.shipmentId,
    paymentDate: data.paymentDate,
    paymentCurrency: data.paymentCurrency,
    amountOriginal: data.amountOriginal.toString(),
    exchangeRateToEgp: data.exchangeRateToEgp ? data.exchangeRateToEgp.toString() : null,
    amountEgp: data.amountEgp.toString(),
    costComponent: data.costComponent,
    paymentMethod: data.paymentMethod,
    cashReceiverName: data.cashReceiverName ?? null,
    referenceNumber: data.referenceNumber ?? null,
    note: data.note ?? null,
    attachmentUrl: null,
    createdByUserId: data.createdByUserId ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  storageState.payments.push(payment);

  return payment;
});

const storageModule = await import("../storage");
const storage = storageModule.storage as any;
const mockedCreatePayment = mock.method(storage, "createPayment", createPaymentMock);
const mockedCreateAuditLog = mock.method(storage, "createAuditLog", createAuditLogMock);
const mockedGetAllPayments = mock.method(storage, "getAllPayments", async () => storageState.payments);
const mockedGetShipmentsByIds = mock.method(
  storage,
  "getShipmentsByIds",
  async (ids: number[]) =>
    ids.map((id) => ({
      id,
      status: storageState.shipments.get(id)?.status,
    })),
);

const { registerRoutes } = await import("../routes");

function resetStorageState() {
  storageState.shipments = new Map(
    shipmentSeeds.map(({ id, status }) => [id, { status, total: 1_000, paid: 0 }])
  );
  storageState.payments = [];
  createPaymentMock.mock.resetCalls();
  createAuditLogMock.mock.resetCalls();
  mockedCreatePayment.mock.resetCalls();
  mockedCreateAuditLog.mock.resetCalls();
  mockedGetAllPayments.mock.resetCalls();
  mockedGetShipmentsByIds.mock.resetCalls();
}

function createPaymentPayload(shipmentId: number, amount = "150.00") {
  return {
    shipmentId,
    paymentDate: new Date().toISOString(),
    paymentCurrency: "EGP",
    amountOriginal: amount,
    exchangeRateToEgp: null,
    amountEgp: amount,
    costComponent: "شراء",
    paymentMethod: "نقدي",
    cashReceiverName: "Tester",
  } satisfies Record<string, unknown>;
}

async function createTestServer(user?: { id: string; role: string }) {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use((req, _res, next) => {
    req.user = user as any;
    req.isAuthenticated = () => Boolean(user);
    next();
  });

  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);

  await new Promise((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as AddressInfo).port;

  const close = () =>
    new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });

  return { port, close };
}

beforeEach(() => {
  resetStorageState();
});

test("manager and accountant roles can create payments", async () => {
  for (const role of ["مدير", "محاسب"]) {
    const { port, close } = await createTestServer({ id: `${role}-1`, role });

    const response = await fetch(`http://127.0.0.1:${port}/api/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createPaymentPayload(101)),
    });

    const body = await response.json();
    await close();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.data.shipmentId, 101);
  }

  assert.equal(createPaymentMock.mock.calls.length, 2);
});

test("viewer and inventory roles are forbidden", async () => {
  for (const role of ["مشاهد", "مسؤول مخزون"]) {
    const { port, close } = await createTestServer({ id: `${role}-1`, role });

    const response = await fetch(`http://127.0.0.1:${port}/api/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createPaymentPayload(101)),
    });

    const body = await response.json();
    await close();

    assert.equal(response.status, 403);
    assert.deepEqual(body, { message: "لا تملك صلاحية لتنفيذ هذا الإجراء" });
  }

  assert.equal(createPaymentMock.mock.calls.length, 0);
});

for (const { id, status } of shipmentSeeds) {
  test(`allows payment for shipment status ${status} when not overpaying`, async () => {
    const { port, close } = await createTestServer({ id: "manager-1", role: "مدير" });

    const response = await fetch(`http://127.0.0.1:${port}/api/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createPaymentPayload(id, "200.00")),
    });

    const body = await response.json();
    await close();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.data.shipmentId, id);
    assert.equal(body.data.amountEgp, "200.00");
  });
}
