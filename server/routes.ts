import type { Express, RequestHandler } from "express";
import type { Server } from "http";
import { storage, type IStorage } from "./storage";
import { setupAuth, isAuthenticated, requireRole } from "./auth";
import { normalizePaymentAmounts } from "./services/currency";
import { logAuditEvent } from "./audit";
import { getPaymentsWithShipments } from "./payments";
import { createShipmentWithItems, updateShipmentWithItems } from "./shipmentService";
import { ApiError, formatError, success } from "./errors";
import type { User } from "@shared/schema";
import {
  insertSupplierSchema,
  insertProductTypeSchema,
  insertExchangeRateSchema,
  insertShipmentPaymentSchema,
} from "@shared/schema";
import { calculatePaymentSnapshot, parseAmountOrZero } from "./services/paymentCalculations";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";

// Configure multer for item image uploads
const itemImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = "uploads/items";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `item-${uniqueSuffix}${ext}`);
  },
});

const uploadItemImage = multer({
  storage: itemImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (_req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

type RouteDependencies = {
  storage?: IStorage;
  auditLogger?: typeof logAuditEvent;
  auth?: {
    setupAuth: (app: Express) => Promise<void>;
    isAuthenticated: RequestHandler;
    requireRole: (roles: string[]) => RequestHandler;
  };
};

type CreatePaymentHandlerDeps = {
  storage: Pick<IStorage, "createPayment">;
  logAuditEvent: (event: Parameters<typeof logAuditEvent>[0]) => void;
};

export function createPaymentHandler(deps: CreatePaymentHandlerDeps): RequestHandler {
  return async (req, res) => {
    try {
      const { shipmentId, paymentDate, paymentCurrency, amountOriginal, exchangeRateToEgp, costComponent, paymentMethod, cashReceiverName, referenceNumber, notes } = req.body;
      const actorId = (req.user as any)?.id;

      // Validate payment date
      const parsedDate = new Date(paymentDate);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({
          error: {
            code: "PAYMENT_DATE_INVALID",
            message: "تاريخ الدفع غير صالح. الرجاء اختيار تاريخ بصيغة YYYY-MM-DD.",
            details: { field: "paymentDate" },
          },
        });
      }

      // Validate amount is numeric
      const originalAmount = parseFloat(amountOriginal);
      if (isNaN(originalAmount)) {
        return res.status(400).json({
          error: {
            code: "PAYMENT_PAYLOAD_INVALID",
            message: "المبلغ الأصلي يجب أن يكون رقمًا صحيحًا",
            details: { field: "amountOriginal" },
          },
        });
      }

      // Validate exchange rate for RMB payments
      if (paymentCurrency === "RMB") {
        const rate = parseFloat(exchangeRateToEgp);
        if (isNaN(rate)) {
          return res.status(400).json({
            error: {
              code: "PAYMENT_RATE_MISSING",
              message: "سعر الصرف لليوان يجب أن يكون رقمًا صحيحًا",
              details: { field: "exchangeRateToEgp" },
            },
          });
        }
        if (rate <= 0) {
          return res.status(400).json({
            error: {
              code: "PAYMENT_RATE_MISSING",
              message: "سعر الصرف لليوان يجب أن يكون أكبر من صفر",
              details: { field: "exchangeRateToEgp" },
            },
          });
        }
      }

      // Normalize payment amounts
      const normalizedAmounts = normalizePaymentAmounts({
        paymentCurrency,
        amountOriginal: originalAmount,
        exchangeRateToEgp: paymentCurrency === "RMB" ? parseFloat(exchangeRateToEgp) : null,
      });

      const payment = await deps.storage.createPayment({
        shipmentId,
        paymentDate: parsedDate,
        paymentCurrency,
        amountOriginal: amountOriginal.toString(),
        exchangeRateToEgp: normalizedAmounts.exchangeRateToEgp?.toString() || null,
        amountEgp: normalizedAmounts.amountEgp.toString(),
        costComponent,
        paymentMethod,
        cashReceiverName: cashReceiverName || null,
        referenceNumber: referenceNumber || null,
        note: notes || null,
        createdByUserId: actorId,
      });

      deps.logAuditEvent({
        userId: actorId,
        entityType: "PAYMENT",
        entityId: payment.id,
        actionType: "CREATE",
        details: {
          shipmentId,
          amount: normalizedAmounts.amountEgp.toString(),
          currency: paymentCurrency,
          method: paymentMethod,
        },
      });

      res.json({ ok: true, payment });
    } catch (error) {
      const { status, body } = formatError(error, {
        code: "PAYMENT_FETCH_FAILED",
        status: 500,
      });
      res.status(status).json(body);
    }
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
  deps: RouteDependencies = {},
): Promise<void> {
  const routeStorage: IStorage = deps.storage ?? storage;
  const auth = deps.auth ?? { setupAuth, isAuthenticated, requireRole };
  const auditLogger = deps.auditLogger ?? ((event: Parameters<typeof logAuditEvent>[0]) => logAuditEvent(event, routeStorage));
  // Setup authentication
  await auth.setupAuth(app);

  // Auth routes
  app.get("/api/auth/user", async (req, res) => {
    if (req.isAuthenticated() && req.user) {
      const user = await routeStorage.getUser(req.user.id);
      if (user) {
        const { password: _, ...userWithoutPassword } = user;
        return res.json(userWithoutPassword);
      }
    }
    res.status(401).json({ message: "Unauthorized" });
  });

  // Image upload for items
  app.post("/api/upload/item-image", isAuthenticated, uploadItemImage.single("image"), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "لم يتم رفع صورة" });
      }
      const imageUrl = `/uploads/items/${req.file.filename}`;
      res.json({ imageUrl });
    } catch (error) {
      console.error("Error uploading image:", error);
      res.status(500).json({ message: "خطأ في رفع الصورة" });
    }
  });

  // Dashboard
  app.get("/api/dashboard/stats", isAuthenticated, async (req, res) => {
    try {
      const stats = await routeStorage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Error fetching dashboard stats" });
    }
  });

  // Suppliers
  app.get("/api/suppliers", isAuthenticated, async (req, res) => {
    try {
      const suppliers = await routeStorage.getAllSuppliers();
      res.json(suppliers);
    } catch (error) {
      res.status(500).json({ message: "Error fetching suppliers" });
    }
  });

  app.get("/api/suppliers/:id", isAuthenticated, async (req, res) => {
    try {
      const supplier = await routeStorage.getSupplier(parseInt(req.params.id));
      if (!supplier) {
        return res.status(404).json({ message: "Supplier not found" });
      }
      res.json(supplier);
    } catch (error) {
      res.status(500).json({ message: "Error fetching supplier" });
    }
  });

  app.post("/api/suppliers", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const data = insertSupplierSchema.parse(req.body);
      const supplier = await routeStorage.createSupplier(data);
      res.json(supplier);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.patch("/api/suppliers/:id", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const supplier = await routeStorage.updateSupplier(parseInt(req.params.id), req.body);
      if (!supplier) {
        return res.status(404).json({ message: "Supplier not found" });
      }
      res.json(supplier);
    } catch (error) {
      res.status(500).json({ message: "Error updating supplier" });
    }
  });

  app.delete("/api/suppliers/:id", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      await routeStorage.deleteSupplier(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Error deleting supplier" });
    }
  });

  // Product Types
  app.get("/api/product-types", isAuthenticated, async (req, res) => {
    try {
      const types = await routeStorage.getAllProductTypes();
      res.json(types);
    } catch (error) {
      res.status(500).json({ message: "Error fetching product types" });
    }
  });

  app.post("/api/product-types", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const data = insertProductTypeSchema.parse(req.body);
      const type = await routeStorage.createProductType(data);
      res.json(type);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.patch("/api/product-types/:id", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const type = await routeStorage.updateProductType(parseInt(req.params.id), req.body);
      if (!type) {
        return res.status(404).json({ message: "Product type not found" });
      }
      res.json(type);
    } catch (error) {
      res.status(500).json({ message: "Error updating product type" });
    }
  });

  app.delete("/api/product-types/:id", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      await routeStorage.deleteProductType(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Error deleting product type" });
    }
  });

  // Shipments
  app.get("/api/shipments", isAuthenticated, async (req, res) => {
    try {
      const shipments = await routeStorage.getAllShipments();
      res.json(shipments);
    } catch (error) {
      res.status(500).json({ message: "Error fetching shipments" });
    }
  });

  app.get("/api/shipments/:id", isAuthenticated, async (req, res) => {
    try {
      const shipment = await routeStorage.getShipment(parseInt(req.params.id));
      if (!shipment) {
        return res.status(404).json({ message: "Shipment not found" });
      }
      res.json(shipment);
    } catch (error) {
      res.status(500).json({ message: "Error fetching shipment" });
    }
  });

  app.post("/api/shipments", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const userId = (req.user as any)?.id;
      const shipment = await createShipmentWithItems(req.body, userId);
      
      logAuditEvent({
        userId,
        entityType: "SHIPMENT",
        entityId: shipment.id,
        actionType: "CREATE",
        details: { status: shipment.status },
      });
      
      res.json(shipment);
    } catch (error) {
      console.error("Error creating shipment:", error);
      res.status(400).json({ message: (error as Error)?.message || "تعذر إنشاء الشحنة" });
    }
  });

  app.patch("/api/shipments/:id", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const shipmentId = parseInt(req.params.id);
      const userId = (req.user as any)?.id;
      
      const existingShipment = await routeStorage.getShipment(shipmentId);
      const previousStatus = existingShipment?.status;
      
      const updatedShipment = await updateShipmentWithItems(shipmentId, req.body);
      
      logAuditEvent({
        userId,
        entityType: "SHIPMENT",
        entityId: shipmentId,
        actionType: "UPDATE",
        details: { step: req.body.step, status: updatedShipment?.status },
      });
      
      if (updatedShipment && updatedShipment.status !== previousStatus) {
        logAuditEvent({
          userId,
          entityType: "SHIPMENT",
          entityId: shipmentId,
          actionType: "STATUS_CHANGE",
          details: { from: previousStatus, to: updatedShipment.status },
        });
      }
      
      res.json(updatedShipment);
    } catch (error) {
      console.error("Error updating shipment:", error);
      const message = (error as Error)?.message || "حدث خطأ أثناء حفظ بيانات الشحنة";
      const status = message === "الشحنة غير موجودة" ? 404 : 400;
      res.status(status).json({ message });
    }
  });

  app.delete("/api/shipments/:id", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const shipmentId = parseInt(req.params.id);
      const userId = (req.user as any)?.id;
      
      await routeStorage.deleteShipment(shipmentId);
      
      logAuditEvent({
        userId,
        entityType: "SHIPMENT",
        entityId: shipmentId,
        actionType: "DELETE",
      });
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Error deleting shipment" });
    }
  });

  // Shipment Items
  app.get("/api/shipments/:id/items", isAuthenticated, async (req, res) => {
    try {
      const items = await routeStorage.getShipmentItems(parseInt(req.params.id));
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Error fetching items" });
    }
  });

  // Shipment Shipping Details
  app.get("/api/shipments/:id/shipping", isAuthenticated, async (req, res) => {
    try {
      const details = await routeStorage.getShippingDetails(parseInt(req.params.id));
      res.json(details || null);
    } catch (error) {
      res.status(500).json({ message: "Error fetching shipping details" });
    }
  });

  // Invoice Summary - breakdown by currency
  app.get("/api/shipments/:id/invoice-summary", isAuthenticated, async (req, res) => {
    try {
      const shipmentId = parseInt(req.params.id);
      const shipment = await routeStorage.getShipment(shipmentId);
      
      if (!shipment) {
        return res.status(404).json({ message: "الشحنة غير موجودة" });
      }
      
      const payments = await routeStorage.getShipmentPayments(shipmentId);
      const paymentAllowance = await routeStorage.getPaymentAllowance(shipmentId, { shipment });
      
      const paymentSnapshot = await calculatePaymentSnapshot({
        shipment,
        payments,
        loadRecoveryData: async () => {
          const items = await routeStorage.getShipmentItems(shipmentId);
          const rate = await routeStorage.getLatestRate("RMB", "EGP");

          return {
            items,
            rmbToEgpRate: rate ? parseAmountOrZero(rate.rateValue) : undefined,
          };
        },
      });

      const paidRmb = paymentSnapshot.paidByCurrency.RMB?.original ?? 0;
      const paidEgp = paymentSnapshot.paidByCurrency.EGP?.original ?? 0;

      // RMB costs breakdown
      const goodsTotalRmb = parseAmountOrZero(shipment.purchaseCostRmb || "0");
      const shippingTotalRmb = parseAmountOrZero(
        shipment.shippingCostRmb || "0",
      );
      const commissionTotalRmb = parseAmountOrZero(
        shipment.commissionCostRmb || "0",
      );
      const rmbSubtotal = goodsTotalRmb + shippingTotalRmb + commissionTotalRmb;
      const rmbRemaining = Math.max(0, rmbSubtotal - paidRmb);
      
      // EGP costs breakdown
      const customsTotalEgp = parseAmountOrZero(shipment.customsCostEgp || "0");
      const takhreegTotalEgp = parseAmountOrZero(
        shipment.takhreegCostEgp || "0",
      );
      const egpSubtotal = customsTotalEgp + takhreegTotalEgp;
      const egpRemaining = Math.max(0, egpSubtotal - paidEgp);

      const paidByCurrency = Object.fromEntries(
        Object.entries(paymentSnapshot.paidByCurrency).map(([currency, values]) => [
          currency,
          {
            original: values.original.toFixed(2),
            convertedToEgp: values.convertedToEgp.toFixed(2),
          },
        ]),
      );

      res.json({
        shipmentId,
        shipmentCode: shipment.shipmentCode,
        shipmentName: shipment.shipmentName,
        knownTotalCost: paymentSnapshot.knownTotalCost.toFixed(2),
        totalPaidEgp: paymentSnapshot.totalPaidEgp.toFixed(2),
        remainingAllowed: paymentSnapshot.remainingAllowed.toFixed(2),
        paidByCurrency,
        rmb: {
          goodsTotal: goodsTotalRmb.toFixed(2),
          shippingTotal: shippingTotalRmb.toFixed(2),
          commissionTotal: commissionTotalRmb.toFixed(2),
          subtotal: rmbSubtotal.toFixed(2),
          paid: paidRmb.toFixed(2),
          remaining: rmbRemaining.toFixed(2),
        },
        egp: {
          customsTotal: customsTotalEgp.toFixed(2),
          takhreegTotal: takhreegTotalEgp.toFixed(2),
          subtotal: egpSubtotal.toFixed(2),
          paid: paidEgp.toFixed(2),
          remaining: egpRemaining.toFixed(2),
        },
        paymentAllowance: {
          knownTotalEgp: paymentAllowance.knownTotal.toFixed(2),
          alreadyPaidEgp: paymentAllowance.alreadyPaid.toFixed(2),
          remainingAllowedEgp: paymentAllowance.remainingAllowed.toFixed(2),
          source: paymentAllowance.recoveredFromItems ? "recovered" : "declared",
        },
        computedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error fetching invoice summary:", error);
      res.status(500).json({ message: "خطأ في جلب ملخص الفاتورة" });
    }
  });

  // Exchange Rates
  app.get("/api/exchange-rates", isAuthenticated, async (req, res) => {
    try {
      const rates = await routeStorage.getAllExchangeRates();
      res.json(rates);
    } catch (error) {
      res.status(500).json({ message: "Error fetching exchange rates" });
    }
  });

  app.post("/api/exchange-rates", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const data = insertExchangeRateSchema.parse(req.body);
      const userId = (req.user as any)?.id;
      const rate = await routeStorage.createExchangeRate(data);
      
      logAuditEvent({
        userId,
        entityType: "EXCHANGE_RATE",
        entityId: rate.id,
        actionType: "CREATE",
        details: { from: rate.fromCurrency, to: rate.toCurrency },
      });
      
      res.json(rate);
    } catch (error) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  // Manual/automatic refresh - simulate external update
  app.post("/api/exchange-rates/refresh", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];
      const latestRmb = await routeStorage.getLatestRate("RMB", "EGP");
      const latestUsd = await routeStorage.getLatestRate("USD", "RMB");
      const userId = (req.user as any)?.id;

      const refreshed = await Promise.all([
        routeStorage.createExchangeRate({
          rateDate: todayStr,
          fromCurrency: "RMB",
          toCurrency: "EGP",
          rateValue: latestRmb?.rateValue || "7.0000",
          source: "تحديث تلقائي",
        }),
        routeStorage.createExchangeRate({
          rateDate: todayStr,
          fromCurrency: "USD",
          toCurrency: "RMB",
          rateValue: latestUsd?.rateValue || "7.2000",
          source: "تحديث تلقائي",
        }),
      ]);

      refreshed.forEach((rate) => {
        logAuditEvent({
          userId,
          entityType: "EXCHANGE_RATE",
          entityId: rate.id,
          actionType: "CREATE",
          details: { from: rate.fromCurrency, to: rate.toCurrency },
        });
      });

      res.json({
        message: "تم تحديث الأسعار",
        lastUpdated: today,
        rates: refreshed,
      });
    } catch (error) {
      console.error("Error refreshing exchange rates", error);
      res.status(500).json({ message: "تعذر تحديث أسعار الصرف" });
    }
  });

  // Payments
  app.get("/api/payments", isAuthenticated, async (req, res) => {
    try {
      const paymentsWithShipments = await getPaymentsWithShipments(routeStorage);
      res.json(paymentsWithShipments);
    } catch (error) {
      const { status, body } = formatError(error, {
        code: "PAYMENT_FETCH_FAILED",
        status: 500,
      });
      res.status(status).json(body);
    }
  });

  app.get("/api/payments/stats", isAuthenticated, async (req, res) => {
    try {
      const stats = await routeStorage.getPaymentStats();
      res.json(stats);
    } catch (error) {
      const { status, body } = formatError(error, {
        code: "PAYMENT_FETCH_FAILED",
        status: 500,
      });
      res.status(status).json(body);
    }
  });

  app.post(
    "/api/payments",
    requireRole(["مدير", "محاسب"]),
    createPaymentHandler({ storage: routeStorage, logAuditEvent: auditLogger }),
  );

  // Inventory
  app.get("/api/inventory", isAuthenticated, async (req, res) => {
    try {
      const movements = await routeStorage.getAllInventoryMovements();
      // Include shipment, shipping details and item info for cost calculations
      const movementsWithDetails = await Promise.all(
        movements.map(async (movement) => {
          const shipment = movement.shipmentId
            ? await routeStorage.getShipment(movement.shipmentId)
            : null;
          const shippingDetails = movement.shipmentId
            ? await routeStorage.getShippingDetails(movement.shipmentId)
            : null;
          const shipmentItems = movement.shipmentId
            ? await routeStorage.getShipmentItems(movement.shipmentId)
            : [];
          const shipmentItem = shipmentItems.find(
            (item) => item.id === movement.shipmentItemId
          );
          // Calculate total pieces in shipment for cost distribution
          const totalShipmentPieces = shipmentItems.reduce((sum, item) => sum + (item.totalPiecesCou || 0), 0);
          return { ...movement, shipment, shipmentItem, shippingDetails, totalShipmentPieces };
        })
      );
      res.json(movementsWithDetails);
    } catch (error) {
      res.status(500).json({ message: "Error fetching inventory" });
    }
  });

  app.get("/api/inventory/stats", isAuthenticated, async (req, res) => {
    try {
      const stats = await routeStorage.getInventoryStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Error fetching inventory stats" });
    }
  });

  // Users
  app.get("/api/users", isAuthenticated, async (req, res) => {
    try {
      const allUsers = await routeStorage.getAllUsers();
      const usersWithoutPasswords = allUsers.map(({ password, ...user }) => user);
      res.json(usersWithoutPasswords);
    } catch (error) {
      res.status(500).json({ message: "Error fetching users" });
    }
  });

  // Create new user (admin only)
  app.post("/api/users", requireRole(["مدير"]), async (req, res) => {
    try {
      const { username, password, firstName, lastName, role } = req.body;
      const actorId = (req.user as any)?.id;
      
      if (!username || !password) {
        return res.status(400).json({ message: "اسم المستخدم وكلمة المرور مطلوبان" });
      }

      const existingUser = await routeStorage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "اسم المستخدم موجود بالفعل" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await routeStorage.createUser({
        username,
        password: hashedPassword,
        firstName: firstName || null,
        lastName: lastName || null,
        role: role || "مشاهد",
      });

      const { password: _, ...userWithoutPassword } = user;
      
      logAuditEvent({
        userId: actorId,
        entityType: "USER",
        entityId: user.id,
        actionType: "CREATE",
        details: { role: user.role },
      });
      
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ message: "Error creating user" });
    }
  });

  // Update user (admin only, or self for password)
  app.patch("/api/users/:id", requireRole(["مدير", "محاسب"]), async (req, res) => {
    try {
      const { id } = req.params;
      const { password, firstName, lastName, role } = req.body;
      const currentUser = req.user!;
      const actorId = (req.user as any)?.id;

      // Only admin can update other users or roles
      if (currentUser.id !== id && currentUser.role !== "مدير") {
        return res.status(403).json({ message: "لا تملك صلاحية لتعديل مستخدمين آخرين" });
      }

      // Non-admins can only update their own password
      if (currentUser.id === id && currentUser.role !== "مدير" && role) {
        return res.status(403).json({ message: "غير مصرح بتغيير الدور" });
      }

      const updateData: any = {};
      if (password) {
        updateData.password = await bcrypt.hash(password, 10);
      }
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (role !== undefined && currentUser.role === "مدير") updateData.role = role;

      const user = await routeStorage.updateUser(id, updateData);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { password: _, ...userWithoutPassword } = user;
      
      logAuditEvent({
        userId: actorId,
        entityType: "USER",
        entityId: user.id,
        actionType: "UPDATE",
        details: { updatedFields: Object.keys(updateData) },
      });
      
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ message: "Error updating user" });
    }
  });

  app.patch("/api/users/:id/role", requireRole(["مدير"]), async (req, res) => {
    try {
      const { role } = req.body;
      const user = await routeStorage.updateUserRole(req.params.id, role);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const { password: _, ...userWithoutPassword } = user;
      
      logAuditEvent({
        userId: (req.user as any)?.id,
        entityType: "USER",
        entityId: user.id,
        actionType: "UPDATE",
        details: { role: user.role },
      });
      
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ message: "Error updating user role" });
    }
  });

  // Delete user (admin only)
  app.delete("/api/users/:id", requireRole(["مدير"]), async (req, res) => {
    try {
      const { id } = req.params;
      const currentUser = req.user!;
      const actorId = (req.user as any)?.id;

      // Prevent deleting yourself
      if (currentUser.id === id) {
        return res.status(400).json({ message: "لا يمكن حذف حسابك الخاص" });
      }

      // Prevent deleting root user
      const targetUser = await routeStorage.getUser(id);
      if (targetUser?.username === "root") {
        return res.status(400).json({ message: "لا يمكن حذف حساب الجذر" });
      }

      await routeStorage.deleteUser(id);
      
      logAuditEvent({
        userId: actorId,
        entityType: "USER",
        entityId: id,
        actionType: "DELETE",
      });
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Error deleting user" });
    }
  });

  // Accounting Routes
  app.get("/api/accounting/dashboard", isAuthenticated, async (req, res) => {
    try {
      const filters = {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        supplierId: req.query.supplierId ? parseInt(req.query.supplierId as string) : undefined,
        shipmentCode: req.query.shipmentCode as string | undefined,
        shipmentStatus: req.query.shipmentStatus as string | undefined,
        paymentStatus: req.query.paymentStatus as string | undefined,
        includeArchived: req.query.includeArchived === "true",
      };
      const stats = await routeStorage.getAccountingDashboard(filters);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching accounting dashboard:", error);
      res.status(500).json({ message: "Error fetching accounting dashboard" });
    }
  });

  app.get("/api/accounting/supplier-balances", isAuthenticated, async (req, res) => {
    try {
      const filters = {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        supplierId: req.query.supplierId ? parseInt(req.query.supplierId as string) : undefined,
        balanceType: req.query.balanceType as 'owing' | 'credit' | 'all' | undefined,
      };
      const balances = await routeStorage.getSupplierBalances(filters);
      res.json(balances);
    } catch (error) {
      console.error("Error fetching supplier balances:", error);
      res.status(500).json({ message: "Error fetching supplier balances" });
    }
  });

  app.get("/api/accounting/supplier-statement/:supplierId", isAuthenticated, async (req, res) => {
    try {
      const supplierId = parseInt(req.params.supplierId);
      const filters = {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const statement = await routeStorage.getSupplierStatement(supplierId, filters);
      res.json(statement);
    } catch (error) {
      console.error("Error fetching supplier statement:", error);
      res.status(500).json({ message: "Error fetching supplier statement" });
    }
  });

  app.get("/api/accounting/movement-report", isAuthenticated, async (req, res) => {
    try {
      const filters = {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
        shipmentId: req.query.shipmentId ? parseInt(req.query.shipmentId as string) : undefined,
        supplierId: req.query.supplierId ? parseInt(req.query.supplierId as string) : undefined,
        movementType: req.query.movementType as string | undefined,
        costComponent: req.query.costComponent as string | undefined,
        paymentMethod: req.query.paymentMethod as string | undefined,
        shipmentStatus: req.query.shipmentStatus as string | undefined,
        paymentStatus: req.query.paymentStatus as string | undefined,
        includeArchived: req.query.includeArchived === "true",
      };
      const report = await routeStorage.getMovementReport(filters);
      res.json(report);
    } catch (error) {
      console.error("Error fetching movement report:", error);
      res.status(500).json({ message: "Error fetching movement report" });
    }
  });

  app.get("/api/accounting/payment-methods-report", isAuthenticated, async (req, res) => {
    try {
      const filters = {
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const report = await routeStorage.getPaymentMethodsReport(filters);
      res.json(report);
    } catch (error) {
      console.error("Error fetching payment methods report:", error);
      res.status(500).json({ message: "Error fetching payment methods report" });
    }
  });

  // Change own password
  app.post("/api/auth/change-password", isAuthenticated, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user!.id;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "كلمة المرور الحالية والجديدة مطلوبتان" });
      }

      const user = await routeStorage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        return res.status(401).json({ message: "كلمة المرور الحالية غير صحيحة" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await routeStorage.updateUser(userId, { password: hashedPassword });

      logAuditEvent({
        userId,
        entityType: "USER",
        entityId: userId,
        actionType: "UPDATE",
        details: { action: "CHANGE_PASSWORD" },
      });

      res.json({ success: true, message: "تم تغيير كلمة المرور بنجاح" });
    } catch (error) {
      res.status(500).json({ message: "Error changing password" });
    }
  });
}
