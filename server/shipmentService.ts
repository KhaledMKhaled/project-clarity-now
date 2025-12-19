import { and, desc, eq } from "drizzle-orm";
import { ZodError } from "zod";
import {
  exchangeRates,
  insertShipmentItemSchema,
  insertShipmentSchema,
  inventoryMovements,
  shipmentItems,
  shipments,
  shipmentShippingDetails,
  type InsertShipmentItem,
  type Shipment,
  type ShipmentItem,
} from "@shared/schema";
import { db } from "./db";
import {
  convertRmbToEgp,
  convertUsdToRmb,
  roundAmount,
} from "./services/currency";

type CreateShipmentPayload = {
  items?: unknown[];
  [key: string]: unknown;
};

type UpdateShipmentPayload = {
  step?: number;
  shipmentData?: unknown;
  items?: unknown[];
  shippingData?: any;
};

function calculateItemTotals(items: ShipmentItem[]) {
  const purchaseCostRmb = items.reduce(
    (sum, item) => sum + parseFloat(item.totalPurchaseCostRmb || "0"),
    0
  );

  // Customs is calculated per piece
  const customsCostEgp = items.reduce((sum, item) => {
    const pieces = item.totalPiecesCou || 0;
    const customsPerPiece = parseFloat(item.customsCostPerCartonEgp || "0");
    return sum + pieces * customsPerPiece;
  }, 0);

  // Takhreeg is calculated per carton
  const takhreegCostEgp = items.reduce((sum, item) => {
    const ctn = item.cartonsCtn || 0;
    const takhreegPerCarton = parseFloat(item.takhreegCostPerCartonEgp || "0");
    return sum + ctn * takhreegPerCarton;
  }, 0);

  return {
    purchaseCostRmb,
    customsCostEgp,
    takhreegCostEgp,
  };
}

export async function createShipmentWithItems(
  payload: CreateShipmentPayload,
  userId?: string
): Promise<Shipment> {
  const { items = [], ...shipmentData } = payload || {};

  try {
    const validatedShipment = insertShipmentSchema.parse({
      ...shipmentData,
      createdByUserId: userId,
    });

    const purchaseRateFromPayload = validatedShipment.purchaseRmbToEgpRate
      ? parseFloat(validatedShipment.purchaseRmbToEgpRate)
      : undefined;

    const parsedItems = (items as unknown[]).map((item) =>
      insertShipmentItemSchema.omit({ shipmentId: true }).parse(item)
    );

    const shipment = await db.transaction(async (tx) => {
      const [createdShipment] = await tx
        .insert(shipments)
        .values(validatedShipment)
        .returning();

      const insertedItems: ShipmentItem[] = [];
      for (const item of parsedItems) {
        // Calculate total customs and takhreeg costs for this item
        // Customs is calculated per piece, Takhreeg is calculated per carton
        const pieces = item.totalPiecesCou || 0;
        const cartons = item.cartonsCtn || 0;
        const customsPerPiece = parseFloat(item.customsCostPerCartonEgp?.toString() || "0");
        const takhreegPerCarton = parseFloat(item.takhreegCostPerCartonEgp?.toString() || "0");
        const totalCustomsCostEgp = (pieces * customsPerPiece).toFixed(2);
        const totalTakhreegCostEgp = (cartons * takhreegPerCarton).toFixed(2);

        const [insertedItem] = await tx
          .insert(shipmentItems)
          .values({ 
            ...item, 
            shipmentId: createdShipment.id,
            totalCustomsCostEgp,
            totalTakhreegCostEgp,
          })
          .returning();
        insertedItems.push(insertedItem);
      }

      const totals = calculateItemTotals(insertedItems);

      const [latestRmbRate] = await tx
        .select()
        .from(exchangeRates)
        .where(
          and(eq(exchangeRates.fromCurrency, "RMB"), eq(exchangeRates.toCurrency, "EGP"))
        )
        .orderBy(desc(exchangeRates.rateDate))
        .limit(1);

    const purchaseRate = purchaseRateFromPayload
      ? purchaseRateFromPayload
      : latestRmbRate
        ? parseFloat(latestRmbRate.rateValue)
        : 7.15;
    const purchaseCostEgp = convertRmbToEgp(totals.purchaseCostRmb, purchaseRate);
    const finalTotalCostEgp = roundAmount(
      purchaseCostEgp + totals.customsCostEgp + totals.takhreegCostEgp,
    );

      const [updatedShipment] = await tx
        .update(shipments)
        .set({
          purchaseCostRmb: totals.purchaseCostRmb.toFixed(2),
          purchaseCostEgp: purchaseCostEgp.toFixed(2),
          purchaseRmbToEgpRate: purchaseRate.toFixed(4),
          customsCostEgp: totals.customsCostEgp.toFixed(2),
          takhreegCostEgp: totals.takhreegCostEgp.toFixed(2),
          finalTotalCostEgp: finalTotalCostEgp.toFixed(2),
          balanceEgp: finalTotalCostEgp.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(shipments.id, createdShipment.id))
        .returning();

      return updatedShipment;
    });

    return shipment;
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error("بيانات الشحنة أو البنود غير صالحة");
    }
    throw new Error("تعذر إنشاء الشحنة، يرجى المحاولة مرة أخرى");
  }
}

export async function updateShipmentWithItems(
  shipmentId: number,
  payload: UpdateShipmentPayload
): Promise<Shipment> {
  const { step, shipmentData, items, shippingData } = payload || {};

  try {
    const validatedShipmentData = shipmentData
      ? insertShipmentSchema.partial().parse(shipmentData)
      : undefined;

    const parsedItems = items && Array.isArray(items)
      ? (items as unknown[]).map((item) =>
          insertShipmentItemSchema.omit({ shipmentId: true }).parse(item)
        )
      : undefined;

    const shipment = await db.transaction(async (tx) => {
      const [existingShipment] = await tx
        .select()
        .from(shipments)
        .where(eq(shipments.id, shipmentId));

      if (!existingShipment) {
        throw new Error("الشحنة غير موجودة");
      }

      let currentShipment = existingShipment;

      const purchaseRate = validatedShipmentData?.purchaseRmbToEgpRate
        ? parseFloat(validatedShipmentData.purchaseRmbToEgpRate)
        : parseFloat(existingShipment.purchaseRmbToEgpRate || "0") || 7.15;

      if (validatedShipmentData) {
        const [updated] = await tx
          .update(shipments)
          .set({ ...validatedShipmentData, updatedAt: new Date() })
          .where(eq(shipments.id, shipmentId))
          .returning();
        if (updated) {
          currentShipment = updated;
        }
      }

      if (parsedItems) {
        await tx.delete(shipmentItems).where(eq(shipmentItems.shipmentId, shipmentId));

        const insertedItems: ShipmentItem[] = [];
        for (const item of parsedItems as InsertShipmentItem[]) {
          // Calculate total customs and takhreeg costs for this item
          // Customs is calculated per piece, Takhreeg is calculated per carton
          const pieces = item.totalPiecesCou || 0;
          const cartons = item.cartonsCtn || 0;
          const customsPerPiece = parseFloat(item.customsCostPerCartonEgp?.toString() || "0");
          const takhreegPerCarton = parseFloat(item.takhreegCostPerCartonEgp?.toString() || "0");
          const totalCustomsCostEgp = (pieces * customsPerPiece).toFixed(2);
          const totalTakhreegCostEgp = (cartons * takhreegPerCarton).toFixed(2);

          const [insertedItem] = await tx
            .insert(shipmentItems)
            .values({ 
              ...item, 
              shipmentId,
              totalCustomsCostEgp,
              totalTakhreegCostEgp,
            })
            .returning();
          insertedItems.push(insertedItem);
        }

        const totals = calculateItemTotals(insertedItems);

        const [updatedAfterItems] = await tx
          .update(shipments)
          .set({
            purchaseCostRmb: totals.purchaseCostRmb.toFixed(2),
            purchaseCostEgp: convertRmbToEgp(totals.purchaseCostRmb, purchaseRate).toFixed(2),
            purchaseRmbToEgpRate: purchaseRate.toFixed(4),
            customsCostEgp: totals.customsCostEgp.toFixed(2),
            takhreegCostEgp: totals.takhreegCostEgp.toFixed(2),
            updatedAt: new Date(),
          })
          .where(eq(shipments.id, shipmentId))
          .returning();

        if (updatedAfterItems) {
          currentShipment = updatedAfterItems;
        } else {
          currentShipment = {
            ...currentShipment,
            purchaseCostRmb: totals.purchaseCostRmb.toFixed(2),
            purchaseCostEgp: convertRmbToEgp(totals.purchaseCostRmb, purchaseRate).toFixed(2),
            purchaseRmbToEgpRate: purchaseRate.toFixed(4),
            customsCostEgp: totals.customsCostEgp.toFixed(2),
            takhreegCostEgp: totals.takhreegCostEgp.toFixed(2),
          } as Shipment;
        }
      }

      if (shippingData) {
        const rmbToEgpRaw =
          parseFloat(shippingData.rmbToEgpRate || "0") ||
          parseFloat(currentShipment.purchaseRmbToEgpRate || "0") ||
          1;
        const usdToRmbRaw = parseFloat(shippingData.usdToRmbRate || "0") || 1;
        const rmbToEgp = rmbToEgpRaw > 0 ? rmbToEgpRaw : 1;
        const usdToRmb = usdToRmbRaw > 0 ? usdToRmbRaw : 1;

        const totalPurchaseCostRmb = parseFloat(currentShipment.purchaseCostRmb || "0");
        const commissionRmb =
          (totalPurchaseCostRmb * parseFloat(shippingData.commissionRatePercent || "0")) /
          100;
        const commissionEgp = convertRmbToEgp(commissionRmb, rmbToEgp);

        const shippingCostUsd =
          parseFloat(shippingData.shippingAreaSqm || "0") *
          parseFloat(shippingData.shippingCostPerSqmUsdOriginal || "0");
        const shippingCostRmb = convertUsdToRmb(shippingCostUsd, usdToRmb);
        const shippingCostEgp = convertRmbToEgp(shippingCostRmb, rmbToEgp);

        const parsedShippingDate = shippingData.shippingDate || null;
        const parsedRatesUpdatedAt = shippingData.ratesUpdatedAt ? new Date(shippingData.ratesUpdatedAt) : null;

        await tx
          .insert(shipmentShippingDetails)
          .values({
            shipmentId,
            totalPurchaseCostRmb: totalPurchaseCostRmb.toFixed(2),
            commissionRatePercent: shippingData.commissionRatePercent,
            commissionValueRmb: commissionRmb.toFixed(2),
            commissionValueEgp: commissionEgp.toFixed(2),
            shippingAreaSqm: shippingData.shippingAreaSqm,
            shippingCostPerSqmUsdOriginal: shippingData.shippingCostPerSqmUsdOriginal,
            totalShippingCostUsdOriginal: shippingCostUsd.toFixed(2),
            totalShippingCostRmb: shippingCostRmb.toFixed(2),
            totalShippingCostEgp: shippingCostEgp.toFixed(2),
            shippingDate: parsedShippingDate,
            rmbToEgpRateAtShipping: shippingData.rmbToEgpRate,
            usdToRmbRateAtShipping: shippingData.usdToRmbRate,
            sourceOfRates: shippingData.sourceOfRates,
            ratesUpdatedAt: parsedRatesUpdatedAt,
          })
          .onConflictDoUpdate({
            target: shipmentShippingDetails.shipmentId,
            set: {
              totalPurchaseCostRmb: totalPurchaseCostRmb.toFixed(2),
              commissionRatePercent: shippingData.commissionRatePercent,
              commissionValueRmb: commissionRmb.toFixed(2),
              commissionValueEgp: commissionEgp.toFixed(2),
              shippingAreaSqm: shippingData.shippingAreaSqm,
              shippingCostPerSqmUsdOriginal: shippingData.shippingCostPerSqmUsdOriginal,
              totalShippingCostUsdOriginal: shippingCostUsd.toFixed(2),
              totalShippingCostRmb: shippingCostRmb.toFixed(2),
              totalShippingCostEgp: shippingCostEgp.toFixed(2),
              shippingDate: parsedShippingDate,
              rmbToEgpRateAtShipping: shippingData.rmbToEgpRate,
              usdToRmbRateAtShipping: shippingData.usdToRmbRate,
              sourceOfRates: shippingData.sourceOfRates,
              ratesUpdatedAt: parsedRatesUpdatedAt,
              updatedAt: new Date(),
            },
          })
          .returning();

        const [updatedAfterShipping] = await tx
          .update(shipments)
          .set({
            purchaseCostEgp: convertRmbToEgp(totalPurchaseCostRmb, purchaseRate).toFixed(2),
            commissionCostRmb: commissionRmb.toFixed(2),
            commissionCostEgp: commissionEgp.toFixed(2),
            shippingCostRmb: shippingCostRmb.toFixed(2),
            shippingCostEgp: shippingCostEgp.toFixed(2),
            updatedAt: new Date(),
          })
          .where(eq(shipments.id, shipmentId))
          .returning();

        if (updatedAfterShipping) {
          currentShipment = updatedAfterShipping;
        }
      }

      const [latestShipment] = await tx
        .select()
        .from(shipments)
        .where(eq(shipments.id, shipmentId));

      const shipmentForTotals = latestShipment || currentShipment;

      const purchaseCostEgp = parseFloat(shipmentForTotals.purchaseCostEgp || "0");
      const commissionCostEgp = parseFloat(shipmentForTotals.commissionCostEgp || "0");
      const shippingCostEgp = parseFloat(shipmentForTotals.shippingCostEgp || "0");
      const customsCostEgp = parseFloat(shipmentForTotals.customsCostEgp || "0");
      const takhreegCostEgp = parseFloat(shipmentForTotals.takhreegCostEgp || "0");

      const finalTotalCostEgp = roundAmount(
        purchaseCostEgp + commissionCostEgp + shippingCostEgp + customsCostEgp + takhreegCostEgp,
      );

      const totalPaidEgp = parseFloat(shipmentForTotals.totalPaidEgp || "0");
      const balanceEgp = roundAmount(Math.max(0, finalTotalCostEgp - totalPaidEgp));

      let newStatus = shipmentForTotals.status;
      const previousStatus = shipmentForTotals.status;
      if (step === 1) {
        newStatus = "في انتظار الشحن";
      } else if (step === 2 && shippingData) {
        newStatus = "في انتظار الشحن";
      } else if (step === 3) {
        newStatus = "جاهزة للاستلام";
      } else if (step === 4) {
        newStatus = "مستلمة بنجاح";
      }

      const [finalShipment] = await tx
        .update(shipments)
          .set({
            finalTotalCostEgp: finalTotalCostEgp.toFixed(2),
            balanceEgp: balanceEgp.toFixed(2),
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(shipments.id, shipmentId))
        .returning();

      if (step === 4 && newStatus === "مستلمة بنجاح" && previousStatus !== "مستلمة بنجاح") {
        const shipmentItemsForInventory = await tx
          .select()
          .from(shipmentItems)
          .where(eq(shipmentItems.shipmentId, shipmentId));

        const purchaseRate = parseFloat(shipmentForTotals.purchaseRmbToEgpRate || "7");
        const totalCustomsCost = parseFloat(shipmentForTotals.customsCostEgp || "0");
        const totalTakhreegCost = parseFloat(shipmentForTotals.takhreegCostEgp || "0");
        const totalShippingCost = parseFloat(shipmentForTotals.shippingCostEgp || "0");
        const totalCommissionCost = parseFloat(shipmentForTotals.commissionCostEgp || "0");
        const totalPurchaseCost = parseFloat(shipmentForTotals.purchaseCostEgp || "0");

        const totalPieces = shipmentItemsForInventory.reduce((sum, item) => sum + (item.totalPiecesCou || 0), 0);

        for (const item of shipmentItemsForInventory) {
          const itemPurchaseCostEgp = parseFloat(item.totalPurchaseCostRmb || "0") * purchaseRate;
          
          const pieceRatio = totalPieces > 0 ? (item.totalPiecesCou || 0) / totalPieces : 0;
          const itemShareOfExtras = pieceRatio * (totalCustomsCost + totalTakhreegCost + totalShippingCost + totalCommissionCost);
          
          const itemTotalCostEgp = itemPurchaseCostEgp + itemShareOfExtras;
          const unitCostEgp = (item.totalPiecesCou || 0) > 0 ? itemTotalCostEgp / (item.totalPiecesCou || 1) : 0;
          const unitCostRmb = purchaseRate > 0 ? unitCostEgp / purchaseRate : 0;

          await tx.insert(inventoryMovements).values({
            shipmentId,
            shipmentItemId: item.id,
            productId: item.productId,
            totalPiecesIn: item.totalPiecesCou || 0,
            unitCostRmb: unitCostRmb.toFixed(4),
            unitCostEgp: unitCostEgp.toFixed(4),
            totalCostEgp: itemTotalCostEgp.toFixed(2),
            movementDate: new Date().toISOString().split("T")[0],
          });
        }
      }

      return finalShipment || shipmentForTotals;
    });

    return shipment;
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error("بيانات الشحنة أو البنود غير صالحة");
    }
    throw new Error((error as Error)?.message || "تعذر تحديث الشحنة");
  }
}
