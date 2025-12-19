import type { Shipment, ShipmentPayment } from "@shared/schema";
import type { IStorage } from "./storage";

export type PaymentWithShipment = ShipmentPayment & { shipment?: Shipment };

type PaymentsStorage = Pick<IStorage, "getAllPayments" | "getShipmentsByIds">;

export async function getPaymentsWithShipments(
  paymentsStorage: PaymentsStorage,
): Promise<PaymentWithShipment[]> {
  const payments = await paymentsStorage.getAllPayments();

  if (payments.length === 0) return [];

  const shipmentIds = Array.from(new Set(payments.map((payment) => payment.shipmentId)));
  const shipments = await paymentsStorage.getShipmentsByIds(shipmentIds);
  const shipmentMap = new Map(shipments.map((shipment) => [shipment.id, shipment]));

  return payments.map((payment) => ({
    ...payment,
    shipment: shipmentMap.get(payment.shipmentId),
  }));
}
