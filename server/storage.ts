import { eq, desc, and, sql, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  users,
  suppliers,
  productTypes,
  products,
  shipments,
  shipmentItems,
  shipmentShippingDetails,
  shipmentCustomsDetails,
  exchangeRates,
  shipmentPayments,
  inventoryMovements,
  auditLogs,
  type User,
  type UpsertUser,
  type Supplier,
  type InsertSupplier,
  type ProductType,
  type InsertProductType,
  type Product,
  type InsertProduct,
  type Shipment,
  type InsertShipment,
  type ShipmentItem,
  type InsertShipmentItem,
  type ShipmentShippingDetails,
  type InsertShipmentShippingDetails,
  type ShipmentCustomsDetails,
  type InsertShipmentCustomsDetails,
  type ExchangeRate,
  type InsertExchangeRate,
  type ShipmentPayment,
  type InsertShipmentPayment,
  type InventoryMovement,
  type InsertInventoryMovement,
  type AuditLog,
  type InsertAuditLog,
} from "@shared/schema";
import { normalizePaymentAmounts, roundAmount } from "./services/currency";
import {
  calculatePaymentSnapshot,
  parseAmountOrZero,
} from "./services/paymentCalculations";
import { ApiError } from "./errors";

const RMB_TO_EGP_FALLBACK_RATE = 7.15;

const parseAmount = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : parseFloat(value as any);
  return Number.isFinite(parsed) ? parsed : 0;
};

const computeKnownTotal = (shipment: Shipment): number => {
  const purchase = parseAmount(shipment.purchaseCostEgp);
  const commission = parseAmount(shipment.commissionCostEgp);
  const shipping = parseAmount(shipment.shippingCostEgp);
  const customs = parseAmount(shipment.customsCostEgp);
  const takhreeg = parseAmount(shipment.takhreegCostEgp);

  return purchase + commission + shipping + customs + takhreeg;
};

async function recoverKnownTotalFromItems(
  shipmentId: number,
  executor: typeof db | any,
): Promise<{
  recoveredTotal: number;
  purchaseCostRmb: number;
  purchaseCostEgp: number;
  customsCostEgp: number;
  takhreegCostEgp: number;
}> {
  const itemsList = await executor
    .select()
    .from(shipmentItems)
    .where(eq(shipmentItems.shipmentId, shipmentId));

  if (itemsList.length === 0) {
    return {
      recoveredTotal: 0,
      purchaseCostRmb: 0,
      purchaseCostEgp: 0,
      customsCostEgp: 0,
      takhreegCostEgp: 0,
    };
  }

  const totalPurchaseCostRmb = itemsList.reduce(
    (sum: number, item: any) => sum + parseAmount(item.totalPurchaseCostRmb),
    0,
  );

  const totalCustomsCostEgp = itemsList.reduce((sum: number, item: any) => {
    return sum + (item.cartonsCtn || 0) * parseAmount(item.customsCostPerCartonEgp);
  }, 0);

  const totalTakhreegCostEgp = itemsList.reduce((sum: number, item: any) => {
    return sum + (item.cartonsCtn || 0) * parseAmount(item.takhreegCostPerCartonEgp);
  }, 0);

  const rateResult = await executor
    .select()
    .from(exchangeRates)
    .where(
      and(eq(exchangeRates.fromCurrency, "RMB"), eq(exchangeRates.toCurrency, "EGP")),
    )
    .orderBy(desc(exchangeRates.rateDate))
    .limit(1);

  const rmbToEgpRate =
    rateResult.length > 0 ? parseAmount(rateResult[0].rateValue) : RMB_TO_EGP_FALLBACK_RATE;
  const purchaseCostEgp = totalPurchaseCostRmb * rmbToEgpRate;
  const recoveredTotal = purchaseCostEgp + totalCustomsCostEgp + totalTakhreegCostEgp;

  return {
    recoveredTotal,
    purchaseCostRmb: totalPurchaseCostRmb,
    purchaseCostEgp,
    customsCostEgp: totalCustomsCostEgp,
    takhreegCostEgp: totalTakhreegCostEgp,
  };
}
export class MissingRmbRateError extends Error {
  constructor() {
    super("RMB_RATE_MISSING");
  }
}

type KnownTotalContext = {
  shipment: Shipment;
  shippingDetails?: ShipmentShippingDetails | null;
  customsDetails?: ShipmentCustomsDetails | null;
  items?: ShipmentItem[];
  latestRmbToEgpRate?: number | null;
  paymentRmbToEgpRate?: number | null;
  defaultRmbToEgpRate?: number | null;
};

export const computeShipmentKnownTotal = (context: KnownTotalContext): number => {
  const {
    shipment,
    shippingDetails,
    customsDetails,
    items = [],
    latestRmbToEgpRate,
    paymentRmbToEgpRate,
    defaultRmbToEgpRate,
  } = context;

  const rateCandidates = [
    parseAmount(shipment.purchaseRmbToEgpRate),
    parseAmount(latestRmbToEgpRate),
    parseAmount(paymentRmbToEgpRate),
    parseAmount(defaultRmbToEgpRate),
  ];

  let resolvedRate = rateCandidates.find((rate) => rate > 0) ?? null;

  const requireRate = () => {
    if (resolvedRate && resolvedRate > 0) return resolvedRate;
    throw new MissingRmbRateError();
  };

  const pickComponent = (egpCandidates: number[], rmbCandidates: number[]) => {
    const egpValue = egpCandidates.find((value) => value > 0) ?? 0;
    if (egpValue > 0) return egpValue;

    const rmbValue = rmbCandidates.find((value) => value > 0) ?? 0;
    if (rmbValue > 0) {
      return rmbValue * requireRate();
    }

    return 0;
  };

  const itemPurchaseRmb = items.reduce(
    (sum, item) => sum + parseAmount(item.totalPurchaseCostRmb),
    0
  );

  const itemCustomsEgp = items.reduce((sum, item) => {
    const totalCustoms = parseAmount(item.totalCustomsCostEgp);
    if (totalCustoms > 0) return sum + totalCustoms;
    const cartons = parseAmount(item.cartonsCtn);
    const perCarton = parseAmount(item.customsCostPerCartonEgp);
    return sum + cartons * perCarton;
  }, 0);

  const itemTakhreegEgp = items.reduce((sum, item) => {
    const totalTakhreeg = parseAmount(item.totalTakhreegCostEgp);
    if (totalTakhreeg > 0) return sum + totalTakhreeg;
    const cartons = parseAmount(item.cartonsCtn);
    const perCarton = parseAmount(item.takhreegCostPerCartonEgp);
    return sum + cartons * perCarton;
  }, 0);

  const purchaseTotal = pickComponent(
    [parseAmount(shipment.purchaseCostEgp)],
    [
      parseAmount(shipment.purchaseCostRmb),
      parseAmount(shippingDetails?.totalPurchaseCostRmb),
      itemPurchaseRmb,
    ]
  );

  const commissionTotal = pickComponent(
    [parseAmount(shipment.commissionCostEgp), parseAmount(shippingDetails?.commissionValueEgp)],
    [parseAmount(shipment.commissionCostRmb), parseAmount(shippingDetails?.commissionValueRmb)]
  );

  const shippingTotal = pickComponent(
    [parseAmount(shipment.shippingCostEgp), parseAmount(shippingDetails?.totalShippingCostEgp)],
    [parseAmount(shipment.shippingCostRmb), parseAmount(shippingDetails?.totalShippingCostRmb)]
  );

  const customsTotal = pickComponent(
    [parseAmount(shipment.customsCostEgp), parseAmount(customsDetails?.totalCustomsCostEgp), itemCustomsEgp],
    []
  );

  const takhreegTotal = pickComponent(
    [parseAmount(shipment.takhreegCostEgp), parseAmount(customsDetails?.totalTakhreegCostEgp), itemTakhreegEgp],
    []
  );

  const total = purchaseTotal + commissionTotal + shippingTotal + customsTotal + takhreegTotal;
  return roundAmount(total);
};

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, data: Partial<UpsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  getAllUsers(): Promise<User[]>;
  updateUserRole(id: string, role: string): Promise<User | undefined>;

  // Suppliers
  getAllSuppliers(): Promise<Supplier[]>;
  getSupplier(id: number): Promise<Supplier | undefined>;
  createSupplier(data: InsertSupplier): Promise<Supplier>;
  updateSupplier(id: number, data: Partial<InsertSupplier>): Promise<Supplier | undefined>;
  deleteSupplier(id: number): Promise<boolean>;

  // Product Types
  getAllProductTypes(): Promise<ProductType[]>;
  getProductType(id: number): Promise<ProductType | undefined>;
  createProductType(data: InsertProductType): Promise<ProductType>;
  updateProductType(id: number, data: Partial<InsertProductType>): Promise<ProductType | undefined>;
  deleteProductType(id: number): Promise<boolean>;

  // Products
  getAllProducts(): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(data: InsertProduct): Promise<Product>;
  updateProduct(id: number, data: Partial<InsertProduct>): Promise<Product | undefined>;

  // Shipments
  getAllShipments(): Promise<Shipment[]>;
  getShipment(id: number): Promise<Shipment | undefined>;
  getShipmentsByIds(ids: number[]): Promise<Shipment[]>;
  createShipment(data: InsertShipment): Promise<Shipment>;
  updateShipment(id: number, data: Partial<InsertShipment>): Promise<Shipment | undefined>;
  deleteShipment(id: number): Promise<boolean>;

  // Shipment Items
  getShipmentItems(shipmentId: number): Promise<ShipmentItem[]>;
  createShipmentItem(data: InsertShipmentItem): Promise<ShipmentItem>;
  updateShipmentItem(id: number, data: Partial<InsertShipmentItem>): Promise<ShipmentItem | undefined>;
  deleteShipmentItem(id: number): Promise<boolean>;
  deleteShipmentItems(shipmentId: number): Promise<boolean>;

  // Shipping Details
  getShippingDetails(shipmentId: number): Promise<ShipmentShippingDetails | undefined>;
  upsertShippingDetails(data: InsertShipmentShippingDetails): Promise<ShipmentShippingDetails>;

  // Customs Details
  getCustomsDetails(shipmentId: number): Promise<ShipmentCustomsDetails | undefined>;
  upsertCustomsDetails(data: InsertShipmentCustomsDetails): Promise<ShipmentCustomsDetails>;

  // Exchange Rates
  getAllExchangeRates(): Promise<ExchangeRate[]>;
  getLatestRate(from: string, to: string): Promise<ExchangeRate | undefined>;
  createExchangeRate(data: InsertExchangeRate): Promise<ExchangeRate>;

  // Payments
  getAllPayments(): Promise<ShipmentPayment[]>;
  getShipmentPayments(shipmentId: number): Promise<ShipmentPayment[]>;
  createPayment(
    data: InsertShipmentPayment,
    options?: { simulatePostInsertError?: boolean }
  ): Promise<ShipmentPayment>;
  createPayment(data: InsertShipmentPayment): Promise<ShipmentPayment>;
  getPaymentAllowance(
    shipmentId: number,
    options?: { shipment?: Shipment },
  ): Promise<{
    knownTotal: number;
    alreadyPaid: number;
    remainingAllowed: number;
    recoveredFromItems: boolean;
  }>;

  // Inventory
  getAllInventoryMovements(): Promise<InventoryMovement[]>;
  createInventoryMovement(data: InsertInventoryMovement): Promise<InventoryMovement>;

  // Audit
  createAuditLog(data: InsertAuditLog): Promise<AuditLog>;

  // Dashboard Stats
  getDashboardStats(): Promise<{
    totalShipments: number;
    totalCostEgp: string;
    totalPaidEgp: string;
    totalBalanceEgp: string;
    recentShipments: Shipment[];
    pendingShipments: number;
    completedShipments: number;
  }>;

  // Payment Stats
  getPaymentStats(): Promise<{
    totalCostEgp: string;
    totalPaidEgp: string;
    totalBalanceEgp: string;
    lastPayment: ShipmentPayment | null;
  }>;

  // Inventory Stats
  getInventoryStats(): Promise<{
    totalPieces: number;
    totalCostEgp: string;
    totalItems: number;
    avgUnitCostEgp: string;
  }>;

  // Accounting Methods
  getAccountingDashboard(filters?: {
    dateFrom?: string;
    dateTo?: string;
    supplierId?: number;
    shipmentCode?: string;
    shipmentStatus?: string;
    paymentStatus?: string;
    includeArchived?: boolean;
  }): Promise<{
    totalPurchaseRmb: string;
    totalPurchaseEgp: string;
    totalShippingRmb: string;
    totalShippingEgp: string;
    totalCommissionRmb: string;
    totalCommissionEgp: string;
    totalCustomsEgp: string;
    totalTakhreegEgp: string;
    totalCostEgp: string;
    totalPaidEgp: string;
    totalBalanceEgp: string;
    unsettledShipmentsCount: number;
  }>;

  getSupplierBalances(filters?: {
    dateFrom?: string;
    dateTo?: string;
    supplierId?: number;
    balanceType?: 'owing' | 'credit' | 'all';
  }): Promise<Array<{
    supplierId: number;
    supplierName: string;
    totalCostEgp: string;
    totalPaidEgp: string;
    balanceEgp: string;
    balanceStatus: 'owing' | 'settled' | 'credit';
  }>>;

  getSupplierStatement(supplierId: number, filters?: {
    dateFrom?: string;
    dateTo?: string;
  }): Promise<{
    supplier: Supplier;
    movements: Array<{
      date: Date | string;
      type: 'shipment' | 'payment';
      description: string;
      shipmentCode?: string;
      costEgp?: string;
      paidEgp?: string;
      runningBalance: string;
    }>;
  }>;

  getMovementReport(filters?: {
    dateFrom?: string;
    dateTo?: string;
    shipmentId?: number;
    supplierId?: number;
    movementType?: string;
    costComponent?: string;
    paymentMethod?: string;
    includeArchived?: boolean;
  }): Promise<{
    movements: Array<{
      date: Date | string;
      shipmentCode: string;
      shipmentName: string;
      supplierName?: string;
      supplierId?: number;
      movementType: string;
      costComponent?: string;
      paymentMethod?: string;
      originalCurrency?: string;
      amountOriginal?: string;
      amountEgp: string;
      direction: 'cost' | 'payment';
      userName?: string;
    }>;
    totalCostEgp: string;
    totalPaidEgp: string;
    netMovement: string;
  }>;

  getPaymentMethodsReport(filters?: {
    dateFrom?: string;
    dateTo?: string;
  }): Promise<Array<{
    paymentMethod: string;
    paymentCount: number;
    totalAmountEgp: string;
  }>>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(userData: UpsertUser): Promise<User> {
    const [user] = await db.insert(users).values(userData).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<UpsertUser>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async updateUserRole(id: string, role: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // Suppliers
  async getAllSuppliers(): Promise<Supplier[]> {
    return db.select().from(suppliers).orderBy(desc(suppliers.createdAt));
  }

  async getSupplier(id: number): Promise<Supplier | undefined> {
    const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, id));
    return supplier;
  }

  async createSupplier(data: InsertSupplier): Promise<Supplier> {
    const [supplier] = await db.insert(suppliers).values(data).returning();
    return supplier;
  }

  async updateSupplier(id: number, data: Partial<InsertSupplier>): Promise<Supplier | undefined> {
    const [supplier] = await db
      .update(suppliers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(suppliers.id, id))
      .returning();
    return supplier;
  }

  async deleteSupplier(id: number): Promise<boolean> {
    const result = await db.delete(suppliers).where(eq(suppliers.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Product Types
  async getAllProductTypes(): Promise<ProductType[]> {
    return db.select().from(productTypes).orderBy(desc(productTypes.createdAt));
  }

  async getProductType(id: number): Promise<ProductType | undefined> {
    const [type] = await db.select().from(productTypes).where(eq(productTypes.id, id));
    return type;
  }

  async createProductType(data: InsertProductType): Promise<ProductType> {
    const [type] = await db.insert(productTypes).values(data).returning();
    return type;
  }

  async updateProductType(id: number, data: Partial<InsertProductType>): Promise<ProductType | undefined> {
    const [type] = await db
      .update(productTypes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(productTypes.id, id))
      .returning();
    return type;
  }

  async deleteProductType(id: number): Promise<boolean> {
    const result = await db.delete(productTypes).where(eq(productTypes.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Products
  async getAllProducts(): Promise<Product[]> {
    return db.select().from(products).orderBy(desc(products.createdAt));
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async createProduct(data: InsertProduct): Promise<Product> {
    const [product] = await db.insert(products).values(data).returning();
    return product;
  }

  async updateProduct(id: number, data: Partial<InsertProduct>): Promise<Product | undefined> {
    const [product] = await db
      .update(products)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    return product;
  }

  // Shipments
  async getAllShipments(): Promise<Shipment[]> {
    return db.select().from(shipments).orderBy(desc(shipments.createdAt));
  }

  async getShipment(id: number): Promise<Shipment | undefined> {
    const [shipment] = await db.select().from(shipments).where(eq(shipments.id, id));
    return shipment;
  }

  async getShipmentsByIds(ids: number[]): Promise<Shipment[]> {
    if (ids.length === 0) return [];
    return db.select().from(shipments).where(inArray(shipments.id, ids));
  }

  async createShipment(data: InsertShipment): Promise<Shipment> {
    const [shipment] = await db.insert(shipments).values(data).returning();
    return shipment;
  }

  async updateShipment(id: number, data: Partial<InsertShipment>): Promise<Shipment | undefined> {
    const [shipment] = await db
      .update(shipments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(shipments.id, id))
      .returning();
    return shipment;
  }

  async deleteShipment(id: number): Promise<boolean> {
    const result = await db.delete(shipments).where(eq(shipments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Shipment Items
  async getShipmentItems(shipmentId: number): Promise<ShipmentItem[]> {
    return db.select().from(shipmentItems).where(eq(shipmentItems.shipmentId, shipmentId));
  }

  async createShipmentItem(data: InsertShipmentItem): Promise<ShipmentItem> {
    const [item] = await db.insert(shipmentItems).values(data).returning();
    return item;
  }

  async updateShipmentItem(id: number, data: Partial<InsertShipmentItem>): Promise<ShipmentItem | undefined> {
    const [item] = await db
      .update(shipmentItems)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(shipmentItems.id, id))
      .returning();
    return item;
  }

  async deleteShipmentItem(id: number): Promise<boolean> {
    const result = await db.delete(shipmentItems).where(eq(shipmentItems.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteShipmentItems(shipmentId: number): Promise<boolean> {
    await db.delete(shipmentItems).where(eq(shipmentItems.shipmentId, shipmentId));
    return true;
  }

  // Shipping Details
  async getShippingDetails(shipmentId: number): Promise<ShipmentShippingDetails | undefined> {
    const [details] = await db
      .select()
      .from(shipmentShippingDetails)
      .where(eq(shipmentShippingDetails.shipmentId, shipmentId));
    return details;
  }

  async upsertShippingDetails(data: InsertShipmentShippingDetails): Promise<ShipmentShippingDetails> {
    // Ensure date fields are properly handled (can be null, string, or Date)
    const cleanedData = {
      ...data,
      shippingDate: data.shippingDate || null,
    };
    const [details] = await db
      .insert(shipmentShippingDetails)
      .values(cleanedData)
      .onConflictDoUpdate({
        target: shipmentShippingDetails.shipmentId,
        set: { ...cleanedData, updatedAt: new Date() },
      })
      .returning();
    return details;
  }

  // Customs Details
  async getCustomsDetails(shipmentId: number): Promise<ShipmentCustomsDetails | undefined> {
    const [details] = await db
      .select()
      .from(shipmentCustomsDetails)
      .where(eq(shipmentCustomsDetails.shipmentId, shipmentId));
    return details;
  }

  async upsertCustomsDetails(data: InsertShipmentCustomsDetails): Promise<ShipmentCustomsDetails> {
    // Ensure date fields are properly handled (can be null, string, or Date)
    const cleanedData = {
      ...data,
      customsInvoiceDate: data.customsInvoiceDate || null,
    };
    const [details] = await db
      .insert(shipmentCustomsDetails)
      .values(cleanedData)
      .onConflictDoUpdate({
        target: shipmentCustomsDetails.shipmentId,
        set: { ...cleanedData, updatedAt: new Date() },
      })
      .returning();
    return details;
  }

  // Exchange Rates
  async getAllExchangeRates(): Promise<ExchangeRate[]> {
    return db.select().from(exchangeRates).orderBy(desc(exchangeRates.rateDate));
  }

  async getLatestRate(from: string, to: string): Promise<ExchangeRate | undefined> {
    const [rate] = await db
      .select()
      .from(exchangeRates)
      .where(
        and(eq(exchangeRates.fromCurrency, from), eq(exchangeRates.toCurrency, to))
      )
      .orderBy(desc(exchangeRates.rateDate))
      .limit(1);
    return rate;
  }

  async createExchangeRate(data: InsertExchangeRate): Promise<ExchangeRate> {
    const [rate] = await db.insert(exchangeRates).values(data).returning();
    return rate;
  }

  // Payments
  async getAllPayments(): Promise<ShipmentPayment[]> {
    return db.select().from(shipmentPayments).orderBy(desc(shipmentPayments.paymentDate));
  }

  async getShipmentPayments(shipmentId: number): Promise<ShipmentPayment[]> {
    return db
      .select()
      .from(shipmentPayments)
      .where(eq(shipmentPayments.shipmentId, shipmentId))
      .orderBy(desc(shipmentPayments.paymentDate));
  }

  async createPayment(
    data: InsertShipmentPayment,
    options?: { simulatePostInsertError?: boolean }
  ): Promise<ShipmentPayment> {
    return db.transaction(async (tx) => {
      const lockedShipment = await tx.execute(sql<Shipment>`SELECT * FROM shipments WHERE id = ${data.shipmentId} FOR UPDATE`);
      const rawRow = lockedShipment.rows?.[0] as Record<string, unknown> | undefined;

      if (!rawRow) {
        throw new ApiError("SHIPMENT_NOT_FOUND", undefined, 404, { shipmentId: data.shipmentId });
      }

      // Convert snake_case raw SQL result to camelCase Shipment type
      const shipment: Shipment = {
        id: rawRow.id as number,
        shipmentCode: rawRow.shipment_code as string,
        shipmentName: rawRow.shipment_name as string,
        purchaseDate: rawRow.purchase_date as string,
        status: rawRow.status as string,
        invoiceCustomsDate: rawRow.invoice_customs_date as string | null,
        createdByUserId: rawRow.created_by_user_id as string | null,
        purchaseCostRmb: rawRow.purchase_cost_rmb as string | null,
        purchaseCostEgp: rawRow.purchase_cost_egp as string | null,
        purchaseRmbToEgpRate: rawRow.purchase_rmb_to_egp_rate as string | null,
        commissionCostRmb: rawRow.commission_cost_rmb as string | null,
        commissionCostEgp: rawRow.commission_cost_egp as string | null,
        shippingCostRmb: rawRow.shipping_cost_rmb as string | null,
        shippingCostEgp: rawRow.shipping_cost_egp as string | null,
        customsCostEgp: rawRow.customs_cost_egp as string | null,
        takhreegCostEgp: rawRow.takhreeg_cost_egp as string | null,
        finalTotalCostEgp: rawRow.final_total_cost_egp as string | null,
        totalPaidEgp: rawRow.total_paid_egp as string | null,
        balanceEgp: rawRow.balance_egp as string | null,
        partialDiscountRmb: rawRow.partial_discount_rmb as string | null,
        discountNotes: rawRow.discount_notes as string | null,
        lastPaymentDate: rawRow.last_payment_date as Date | null,
        createdAt: rawRow.created_at as Date | null,
        updatedAt: rawRow.updated_at as Date | null,
      };

      if (shipment.status === "مؤرشفة") {
        throw new ApiError("SHIPMENT_LOCKED", undefined, 409, { shipmentId: data.shipmentId, status: shipment.status });
      }

      const parseAmount = (value: unknown): number => {
        if (value === null || value === undefined) return 0;
        const parsed = typeof value === "number" ? value : parseFloat(value as any);
        return Number.isFinite(parsed) ? parsed : 0;
      };

      // Compute the "known total" - sum of cost components that are available/entered
      // Uses RMB values (with stored rate) when EGP amounts are missing to avoid losing information
      const computeKnownTotals = (s: Shipment) => {
        const purchaseRate = parseAmount(s.purchaseRmbToEgpRate);

        const purchaseFromRmb = purchaseRate > 0 ? parseAmount(s.purchaseCostRmb) * purchaseRate : 0;
        const purchase = parseAmount(s.purchaseCostEgp) || purchaseFromRmb;

        const commissionFromRmb = purchaseRate > 0 ? parseAmount(s.commissionCostRmb) * purchaseRate : 0;
        const commission = parseAmount(s.commissionCostEgp) || commissionFromRmb;

        const shippingFromRmb = purchaseRate > 0 ? parseAmount(s.shippingCostRmb) * purchaseRate : 0;
        const shipping = parseAmount(s.shippingCostEgp) || shippingFromRmb;

        const customs = parseAmount(s.customsCostEgp);
        const takhreeg = parseAmount(s.takhreegCostEgp);

        const componentTotal = purchase + commission + shipping + customs + takhreeg;
        const existingFinal = parseAmount(s.finalTotalCostEgp);
        const bestKnownTotal = Math.max(componentTotal, existingFinal);

        return {
          bestKnownTotal,
          componentTotal,
          normalizedComponents: {
            purchaseCostEgp: purchase,
            commissionCostEgp: commission,
            shippingCostEgp: shipping,
            customsCostEgp: customs,
            takhreegCostEgp: takhreeg,
          },
        };
      };

      const amountOriginal = parseAmountOrZero(data.amountOriginal as any);
      let exchangeRate = data.exchangeRateToEgp
        ? parseAmountOrZero(data.exchangeRateToEgp as any)
        : null;

      if (data.paymentCurrency === "RMB" && !exchangeRate) {
        const [latestRate] = await tx
          .select()
          .from(exchangeRates)
          .where(
            and(
              eq(exchangeRates.fromCurrency, "RMB"),
              eq(exchangeRates.toCurrency, "EGP"),
            ),
          )
          .orderBy(desc(exchangeRates.rateDate))
          .limit(1);

        if (latestRate?.rateValue) {
          exchangeRate = parseAmount(latestRate.rateValue);
        } else {
          throw new ApiError("PAYMENT_RATE_MISSING", undefined, 400, {
            shipmentId: data.shipmentId,
            currency: data.paymentCurrency,
          });
        }
      }

      let normalizedAmounts;
      try {
        normalizedAmounts = normalizePaymentAmounts({
          paymentCurrency: data.paymentCurrency,
          amountOriginal,
          exchangeRateToEgp: exchangeRate,
        });
      } catch (error) {
        const message = (error as Error)?.message || "";

        if (message.includes("سعر الصرف")) {
          throw new ApiError("PAYMENT_RATE_MISSING", undefined, 400, {
            shipmentId: data.shipmentId,
            currency: data.paymentCurrency,
          });
        }

        if (message.includes("عملة الدفع")) {
          throw new ApiError("PAYMENT_CURRENCY_UNSUPPORTED", undefined, 400, {
            currency: data.paymentCurrency,
          });
        }

        throw new ApiError("PAYMENT_PAYLOAD_INVALID", message, 400);
      }

      const { amountEgp, exchangeRateToEgp } = normalizedAmounts;

      const currentPaid = parseAmount(shipment.totalPaidEgp);
      const { bestKnownTotal, normalizedComponents: computedComponents } = computeKnownTotals(shipment);
      let normalizedComponents = { ...computedComponents };
      let knownTotal = bestKnownTotal;

      const canonicalUpdates: Partial<typeof shipments.$inferInsert> = {};

      // Backfill EGP fields when only RMB values are present so future totals stay consistent
      if (normalizedComponents.purchaseCostEgp > 0 && parseAmount(shipment.purchaseCostEgp) === 0) {
        canonicalUpdates.purchaseCostEgp = roundAmount(normalizedComponents.purchaseCostEgp, 2).toFixed(2);
      }

      if (normalizedComponents.commissionCostEgp > 0 && parseAmount(shipment.commissionCostEgp) === 0) {
        canonicalUpdates.commissionCostEgp = roundAmount(normalizedComponents.commissionCostEgp, 2).toFixed(2);
      }

      if (normalizedComponents.shippingCostEgp > 0 && parseAmount(shipment.shippingCostEgp) === 0) {
        canonicalUpdates.shippingCostEgp = roundAmount(normalizedComponents.shippingCostEgp, 2).toFixed(2);
      }

      const existingPayments = await tx
        .select()
        .from(shipmentPayments)
        .where(eq(shipmentPayments.shipmentId, data.shipmentId));

      const paymentSnapshot = await calculatePaymentSnapshot({
        shipment,
        payments: existingPayments,
        loadRecoveryData: async () => {
          const itemsList = await tx
            .select()
            .from(shipmentItems)
            .where(eq(shipmentItems.shipmentId, data.shipmentId));

          const rateResult = await tx
            .select()
            .from(exchangeRates)
            .where(
              and(
                eq(exchangeRates.fromCurrency, "RMB"),
                eq(exchangeRates.toCurrency, "EGP"),
              ),
            )
            .orderBy(desc(exchangeRates.rateDate))
            .limit(1);

          return {
            items: itemsList,
            rmbToEgpRate:
              rateResult.length > 0
                ? parseAmountOrZero(rateResult[0].rateValue)
                : 7.15,
          };
        },
      });

      if (paymentSnapshot.recoveredTotals) {
        try {
          await tx
            .update(shipments)
            .set({
              purchaseCostRmb: paymentSnapshot.recoveredTotals.purchaseCostRmb.toFixed(2),
              purchaseCostEgp: paymentSnapshot.recoveredTotals.purchaseCostEgp.toFixed(2),
              customsCostEgp: paymentSnapshot.recoveredTotals.customsCostEgp.toFixed(2),
              takhreegCostEgp: paymentSnapshot.recoveredTotals.takhreegCostEgp.toFixed(2),
              finalTotalCostEgp: paymentSnapshot.recoveredTotals.finalTotalCostEgp.toFixed(2),
              balanceEgp: Math.max(
                0,
                paymentSnapshot.recoveredTotals.finalTotalCostEgp -
                  paymentSnapshot.totalPaidEgp,
              ).toFixed(2),
            })
            .where(eq(shipments.id, data.shipmentId));
        } catch (error) {
          console.error(
            `[PAYMENT RECOVERY ERROR] Failed to recover costs for shipment ${data.shipmentId}:`,
            error,
          );
        }
      }

      // Align final total with the best-known calculated total without overwriting higher-confidence values
      if (paymentSnapshot.knownTotalCost > 0 && (parseAmount(shipment.finalTotalCostEgp) === 0 || paymentSnapshot.knownTotalCost > parseAmount(shipment.finalTotalCostEgp))) {
        canonicalUpdates.finalTotalCostEgp = roundAmount(paymentSnapshot.knownTotalCost, 2).toFixed(2);
      }

      // ONLY block if payment exceeds what's currently known/allowed
      if (amountEgp > paymentSnapshot.remainingAllowed + 0.0001) {
        throw new ApiError("PAYMENT_OVERPAY", 
          `لا يمكن دفع هذا المبلغ - الحد المسموح به هو ${paymentSnapshot.remainingAllowed.toFixed(2)} جنيه`, 409, {
          shipmentId: data.shipmentId,
          knownTotal: paymentSnapshot.knownTotalCost,
          alreadyPaid: paymentSnapshot.totalPaidEgp,
          remainingAllowed: paymentSnapshot.remainingAllowed,
          attempted: amountEgp,
        });
      }

      // Ensure paymentDate is a proper Date object
      const paymentDate = data.paymentDate instanceof Date 
        ? data.paymentDate 
        : new Date(data.paymentDate as unknown as string);

      const [payment] = await tx
        .insert(shipmentPayments)
        .values({
          ...data,
          paymentDate,
          amountOriginal: roundAmount(amountOriginal, 2).toFixed(2),
          exchangeRateToEgp: exchangeRateToEgp ? roundAmount(exchangeRateToEgp, 4).toFixed(4) : null,
          amountEgp: roundAmount(amountEgp, 2).toFixed(2),
        })
        .returning();

      if (options?.simulatePostInsertError) {
        throw new Error("Simulated failure after inserting payment");
      }

      const [paymentTotals] = await tx
        .select({
          totalPaid: sql<string>`COALESCE(SUM(${shipmentPayments.amountEgp}), 0)`,
          lastPaymentDate: sql<Date>`MAX(${shipmentPayments.paymentDate})`,
        })
        .from(shipmentPayments)
        .where(eq(shipmentPayments.shipmentId, data.shipmentId));

      const totalPaidNumber = roundAmount(parseFloat(paymentTotals?.totalPaid || "0"));
      // Use known total for balance calculation (allows partial payments)
      const balance = roundAmount(
        Math.max(0, paymentSnapshot.knownTotalCost - totalPaidNumber),
      );
      // Ensure date is a proper Date object (raw SQL may return string)
      const rawLatestDate = paymentTotals?.lastPaymentDate || data.paymentDate || new Date();
      const latestPaymentDate = rawLatestDate instanceof Date 
        ? rawLatestDate 
        : new Date(rawLatestDate as string);

      const finalTotalForShipment = knownTotal > 0 ? roundAmount(knownTotal, 2).toFixed(2) : undefined;
      const computedBalance = balance.toFixed(2);

      const shipmentUpdatePayload: Partial<typeof shipments.$inferInsert> = {
        ...canonicalUpdates,
        totalPaidEgp: totalPaidNumber.toFixed(2),
        balanceEgp: computedBalance,
        lastPaymentDate: latestPaymentDate,
        updatedAt: new Date(),
      };

      if (finalTotalForShipment) {
        shipmentUpdatePayload.finalTotalCostEgp = finalTotalForShipment;
      }

      // Update shipment with new totals atomically
      await tx
        .update(shipments)
        .set(shipmentUpdatePayload)
        .where(eq(shipments.id, data.shipmentId));

      return payment;
    });
  }

  async getPaymentAllowance(
    shipmentId: number,
    options?: { shipment?: Shipment },
  ): Promise<{
    knownTotal: number;
    alreadyPaid: number;
    remainingAllowed: number;
    recoveredFromItems: boolean;
  }> {
    const shipment = options?.shipment ?? (await this.getShipment(shipmentId));

    if (!shipment) {
      throw new ApiError("SHIPMENT_NOT_FOUND", undefined, 404, { shipmentId });
    }

    const alreadyPaid = parseAmount(shipment.totalPaidEgp);
    let knownTotal = computeKnownTotal(shipment);
    let recoveredFromItems = false;

    if (knownTotal === 0) {
      try {
        const recovery = await recoverKnownTotalFromItems(shipmentId, db);
        if (recovery.recoveredTotal > 0) {
          knownTotal = recovery.recoveredTotal;
          recoveredFromItems = true;
        }
      } catch (error) {
        console.error(`[PAYMENT ALLOWANCE] Failed to recover costs for shipment ${shipmentId}:`, error);
      }
    }

    const remainingAllowed = Math.max(0, knownTotal - alreadyPaid);

    return { knownTotal, alreadyPaid, remainingAllowed, recoveredFromItems };
  }

  // Inventory
  async getAllInventoryMovements(): Promise<InventoryMovement[]> {
    return db.select().from(inventoryMovements).orderBy(desc(inventoryMovements.movementDate));
  }

  async createInventoryMovement(data: InsertInventoryMovement): Promise<InventoryMovement> {
    const [movement] = await db.insert(inventoryMovements).values(data).returning();
    return movement;
  }

  // Audit
  async createAuditLog(data: InsertAuditLog): Promise<AuditLog> {
    const [log] = await db.insert(auditLogs).values(data).returning();
    return log;
  }

  // Dashboard Stats
  async getDashboardStats() {
    const allShipments = await this.getAllShipments();

    const totalCostEgp = allShipments.reduce(
      (sum, s) => sum + parseFloat(s.finalTotalCostEgp || "0"),
      0
    );

    const totalPaidEgp = allShipments.reduce(
      (sum, s) => sum + parseFloat(s.totalPaidEgp || "0"),
      0
    );

    // Calculate remaining correctly
    // remaining = max(0, cost - paid) per shipment
    let totalBalanceEgp = 0;

    allShipments.forEach((s) => {
      const cost = parseFloat(s.finalTotalCostEgp || "0");
      const paid = parseFloat(s.totalPaidEgp || "0");
      const remaining = Math.max(0, cost - paid);
      totalBalanceEgp += remaining;
    });

    const pendingShipments = allShipments.filter(
      (s) => s.status !== "مستلمة بنجاح"
    ).length;

    const completedShipments = allShipments.filter(
      (s) => s.status === "مستلمة بنجاح"
    ).length;

    const recentShipments = allShipments.slice(0, 5);

    return {
      totalShipments: allShipments.length,
      totalCostEgp: totalCostEgp.toFixed(2),
      totalPaidEgp: totalPaidEgp.toFixed(2),
      totalBalanceEgp: totalBalanceEgp.toFixed(2),
      recentShipments,
      pendingShipments,
      completedShipments,
    };
  }

  // Payment Stats
  async getPaymentStats() {
    const allShipments = await this.getAllShipments();
    const allPayments = await this.getAllPayments();

    const unsettledShipments = allShipments.filter((s) => {
      const cost = parseFloat(s.finalTotalCostEgp || "0");
      const paid = parseFloat(s.totalPaidEgp || "0");
      return Math.max(0, cost - paid) > 0.0001;
    });

    const totalCostEgp = unsettledShipments.reduce(
      (sum, s) => sum + parseFloat(s.finalTotalCostEgp || "0"),
      0
    );

    const totalPaidEgp = unsettledShipments.reduce(
      (sum, s) => sum + parseFloat(s.totalPaidEgp || "0"),
      0
    );

    const totalBalanceEgp = unsettledShipments.reduce((sum, s) => {
      const cost = parseFloat(s.finalTotalCostEgp || "0");
      const paid = parseFloat(s.totalPaidEgp || "0");
      return sum + Math.max(0, cost - paid);
    }, 0);

    const lastPayment = allPayments.length > 0 ? allPayments[0] : null;

    return {
      totalCostEgp: totalCostEgp.toFixed(2),
      totalPaidEgp: totalPaidEgp.toFixed(2),
      totalBalanceEgp: totalBalanceEgp.toFixed(2),
      lastPayment,
    };
  }

  // Inventory Stats
  async getInventoryStats() {
    const movements = await this.getAllInventoryMovements();

    const totalPieces = movements.reduce(
      (sum, m) => sum + (m.totalPiecesIn || 0),
      0
    );

    const totalCostEgp = movements.reduce(
      (sum, m) => sum + parseFloat(m.totalCostEgp || "0"),
      0
    );

    const avgUnitCostEgp = totalPieces > 0 ? totalCostEgp / totalPieces : 0;

    return {
      totalPieces,
      totalCostEgp: totalCostEgp.toFixed(2),
      totalItems: movements.length,
      avgUnitCostEgp: avgUnitCostEgp.toFixed(4),
    };
  }

  // Accounting Dashboard
  async getAccountingDashboard(filters?: {
    dateFrom?: string;
    dateTo?: string;
    supplierId?: number;
    shipmentCode?: string;
    shipmentStatus?: string;
    paymentStatus?: string;
    includeArchived?: boolean;
  }) {
    const allShipments = await this.getAllShipments();
    const allPayments = await this.getAllPayments();
    const allItems = await Promise.all(
      allShipments.map(s => this.getShipmentItems(s.id))
    );

    let filteredShipments = allShipments;
    
    if (!filters?.includeArchived) {
      filteredShipments = filteredShipments.filter(s => s.status !== "مؤرشفة");
    }

    if (filters?.shipmentCode) {
      filteredShipments = filteredShipments.filter(s => 
        s.shipmentCode?.toLowerCase().includes(filters.shipmentCode!.toLowerCase())
      );
    }

    if (filters?.shipmentStatus && filters.shipmentStatus !== "all") {
      filteredShipments = filteredShipments.filter(s => s.status === filters.shipmentStatus);
    }

    if (filters?.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      filteredShipments = filteredShipments.filter(s => {
        const purchaseDate = s.purchaseDate ? new Date(s.purchaseDate) : null;
        return purchaseDate && purchaseDate >= fromDate;
      });
    }

    if (filters?.dateTo) {
      const toDate = new Date(filters.dateTo);
      filteredShipments = filteredShipments.filter(s => {
        const purchaseDate = s.purchaseDate ? new Date(s.purchaseDate) : null;
        return purchaseDate && purchaseDate <= toDate;
      });
    }

    if (filters?.supplierId) {
      const shipmentItemsForFilter = allItems.flat();
      const shipmentIdsWithSupplier = new Set(
        shipmentItemsForFilter
          .filter(item => item.supplierId === filters.supplierId)
          .map(item => item.shipmentId)
      );
      filteredShipments = filteredShipments.filter(s => shipmentIdsWithSupplier.has(s.id));
    }

    if (filters?.paymentStatus && filters.paymentStatus !== "all") {
      filteredShipments = filteredShipments.filter((s) => {
        const cost = parseFloat(s.finalTotalCostEgp || "0");
        const paid = parseFloat(s.totalPaidEgp || "0");
        const balance = Math.max(0, cost - paid);
        if (filters.paymentStatus === "لم يتم دفع أي مبلغ") return paid <= 0.0001;
        if (filters.paymentStatus === "مسددة بالكامل") return balance <= 0.0001;
        if (filters.paymentStatus === "مدفوعة جزئياً") return paid > 0.0001 && balance > 0.0001;
        return true;
      });
    }

    const filteredShipmentIds = new Set(filteredShipments.map(s => s.id));
    const filteredPayments = allPayments.filter(p => filteredShipmentIds.has(p.shipmentId));

    const totalPurchaseRmb = filteredShipments.reduce(
      (sum, s) => sum + parseFloat(s.purchaseCostRmb || "0"), 0
    );
    const totalPurchaseEgp = filteredShipments.reduce(
      (sum, s) => sum + parseFloat(s.purchaseCostEgp || "0"), 0
    );
    const totalDiscountRmb = filteredShipments.reduce(
      (sum, s) => sum + parseFloat((s as any).purchaseDiscount || "0"), 0
    );
    const totalShippingRmb = filteredShipments.reduce(
      (sum, s) => sum + parseFloat(s.shippingCostRmb || "0"), 0
    );
    const totalShippingEgp = filteredShipments.reduce(
      (sum, s) => sum + parseFloat(s.shippingCostEgp || "0"), 0
    );
    const totalCommissionRmb = filteredShipments.reduce(
      (sum, s) => sum + parseFloat(s.commissionCostRmb || "0"), 0
    );
    const totalCommissionEgp = filteredShipments.reduce(
      (sum, s) => sum + parseFloat(s.commissionCostEgp || "0"), 0
    );
    const totalCustomsEgp = filteredShipments.reduce(
      (sum, s) => sum + parseFloat(s.customsCostEgp || "0"), 0
    );
    const totalTakhreegEgp = filteredShipments.reduce(
      (sum, s) => sum + parseFloat(s.takhreegCostEgp || "0"), 0
    );
    const totalCostEgp = filteredShipments.reduce(
      (sum, s) => sum + parseFloat(s.finalTotalCostEgp || "0"), 0
    );
    const totalPaidEgp = filteredPayments.reduce(
      (sum, p) => sum + parseFloat(p.amountEgp || "0"), 0
    );
    const totalPaidRmb = filteredPayments.reduce(
      (sum, p) => p.paymentCurrency === "RMB" ? sum + parseFloat(p.amountOriginal || "0") : sum, 0
    );
    const totalBalanceEgp = filteredShipments.reduce((sum, s) => {
      const cost = parseFloat(s.finalTotalCostEgp || "0");
      const paid = parseFloat(s.totalPaidEgp || "0");
      return sum + Math.max(0, cost - paid);
    }, 0);

    // Calculate paid and remaining for purchase cost
    const totalPaidPurchaseRmb = filteredPayments
      .filter(p => p.costComponent === "تكلفة البضاعة" && p.paymentCurrency === "RMB")
      .reduce((sum, p) => sum + parseFloat(p.amountOriginal || "0"), 0);
    const totalPaidPurchaseEgp = filteredPayments
      .filter(p => p.costComponent === "تكلفة البضاعة")
      .reduce((sum, p) => sum + parseFloat(p.amountEgp || "0"), 0);
    const totalBalancePurchaseRmb = Math.max(0, totalPurchaseRmb - totalPaidPurchaseRmb);
    const totalBalancePurchaseEgp = Math.max(0, totalPurchaseEgp - totalPaidPurchaseEgp);

    // Calculate paid and remaining for shipping
    const totalPaidShippingRmb = filteredPayments
      .filter(p => p.costComponent === "الشحن" && p.paymentCurrency === "RMB")
      .reduce((sum, p) => sum + parseFloat(p.amountOriginal || "0"), 0);
    const totalPaidShippingEgp = filteredPayments
      .filter(p => p.costComponent === "الشحن")
      .reduce((sum, p) => sum + parseFloat(p.amountEgp || "0"), 0);
    const totalBalanceShippingRmb = Math.max(0, totalShippingRmb - totalPaidShippingRmb);
    const totalBalanceShippingEgp = Math.max(0, totalShippingEgp - totalPaidShippingEgp);

    // Calculate paid and remaining for commission
    const totalPaidCommissionRmb = filteredPayments
      .filter(p => p.costComponent === "العمولة" && p.paymentCurrency === "RMB")
      .reduce((sum, p) => sum + parseFloat(p.amountOriginal || "0"), 0);
    const totalPaidCommissionEgp = filteredPayments
      .filter(p => p.costComponent === "العمولة")
      .reduce((sum, p) => sum + parseFloat(p.amountEgp || "0"), 0);
    const totalBalanceCommissionRmb = Math.max(0, totalCommissionRmb - totalPaidCommissionRmb);
    const totalBalanceCommissionEgp = Math.max(0, totalCommissionEgp - totalPaidCommissionEgp);

    // Calculate paid and remaining for customs
    const totalPaidCustomsEgp = filteredPayments
      .filter(p => p.costComponent === "الجمرك")
      .reduce((sum, p) => sum + parseFloat(p.amountEgp || "0"), 0);
    const totalBalanceCustomsEgp = Math.max(0, totalCustomsEgp - totalPaidCustomsEgp);

    // Calculate paid and remaining for takhreeg
    const totalPaidTakhreegEgp = filteredPayments
      .filter(p => p.costComponent === "التخريج")
      .reduce((sum, p) => sum + parseFloat(p.amountEgp || "0"), 0);
    const totalBalanceTakhreegEgp = Math.max(0, totalTakhreegEgp - totalPaidTakhreegEgp);

    const filteredItems = allItems.flat().filter(item => filteredShipmentIds.has(item.shipmentId));
    const totalCartons = filteredItems.reduce((sum, item) => sum + (item.cartonsCtn || 0), 0);
    const totalPieces = filteredItems.reduce((sum, item) => sum + (item.totalPiecesCou || 0), 0);

    const totalCostRmb = totalPurchaseRmb + totalShippingRmb + totalCommissionRmb - totalDiscountRmb;
    const totalBalanceRmb = Math.max(0, totalCostRmb - totalPaidRmb);

    const unsettledShipmentsCount = filteredShipments.filter(s => {
      const cost = parseFloat(s.finalTotalCostEgp || "0");
      const paid = parseFloat(s.totalPaidEgp || "0");
      return Math.max(0, cost - paid) > 0.0001;
    }).length;

    return {
      totalPurchaseRmb: totalPurchaseRmb.toFixed(2),
      totalPurchaseEgp: totalPurchaseEgp.toFixed(2),
      totalDiscountRmb: totalDiscountRmb.toFixed(2),
      totalShippingRmb: totalShippingRmb.toFixed(2),
      totalShippingEgp: totalShippingEgp.toFixed(2),
      totalCommissionRmb: totalCommissionRmb.toFixed(2),
      totalCommissionEgp: totalCommissionEgp.toFixed(2),
      totalCustomsEgp: totalCustomsEgp.toFixed(2),
      totalTakhreegEgp: totalTakhreegEgp.toFixed(2),
      totalCostEgp: totalCostEgp.toFixed(2),
      totalCostRmb: totalCostRmb.toFixed(2),
      totalPaidEgp: totalPaidEgp.toFixed(2),
      totalPaidRmb: totalPaidRmb.toFixed(2),
      totalBalanceEgp: totalBalanceEgp.toFixed(2),
      totalBalanceRmb: totalBalanceRmb.toFixed(2),
      totalCartons,
      totalPieces,
      unsettledShipmentsCount,
      shipmentsCount: filteredShipments.length,
      totalPaidShippingRmb: totalPaidShippingRmb.toFixed(2),
      totalBalanceShippingRmb: totalBalanceShippingRmb.toFixed(2),
      totalPaidShippingEgp: totalPaidShippingEgp.toFixed(2),
      totalBalanceShippingEgp: totalBalanceShippingEgp.toFixed(2),
      totalPaidCommissionRmb: totalPaidCommissionRmb.toFixed(2),
      totalBalanceCommissionRmb: totalBalanceCommissionRmb.toFixed(2),
      totalPaidCommissionEgp: totalPaidCommissionEgp.toFixed(2),
      totalBalanceCommissionEgp: totalBalanceCommissionEgp.toFixed(2),
      totalPaidPurchaseRmb: totalPaidPurchaseRmb.toFixed(2),
      totalBalancePurchaseRmb: totalBalancePurchaseRmb.toFixed(2),
      totalPaidPurchaseEgp: totalPaidPurchaseEgp.toFixed(2),
      totalBalancePurchaseEgp: totalBalancePurchaseEgp.toFixed(2),
      totalPaidCustomsEgp: totalPaidCustomsEgp.toFixed(2),
      totalBalanceCustomsEgp: totalBalanceCustomsEgp.toFixed(2),
      totalPaidTakhreegEgp: totalPaidTakhreegEgp.toFixed(2),
      totalBalanceTakhreegEgp: totalBalanceTakhreegEgp.toFixed(2),
    };
  }

  // Supplier Balances
  async getSupplierBalances(filters?: {
    dateFrom?: string;
    dateTo?: string;
    supplierId?: number;
    balanceType?: 'owing' | 'credit' | 'all';
  }) {
    const allSuppliers = await this.getAllSuppliers();
    const allShipments = await this.getAllShipments();
    const allPayments = await this.getAllPayments();
    const allItems = await Promise.all(
      allShipments.map(s => this.getShipmentItems(s.id))
    );

    const result: Array<{
      supplierId: number;
      supplierName: string;
      totalCostEgp: string;
      totalPaidEgp: string;
      balanceEgp: string;
      balanceStatus: 'owing' | 'settled' | 'credit';
    }> = [];

    for (const supplier of allSuppliers) {
      if (filters?.supplierId && supplier.id !== filters.supplierId) continue;

      const supplierShipmentIds = new Set<number>();
      allItems.forEach((items, idx) => {
        if (items.some(item => item.supplierId === supplier.id)) {
          supplierShipmentIds.add(allShipments[idx].id);
        }
      });

      let supplierShipments = allShipments.filter(s => supplierShipmentIds.has(s.id));

      if (filters?.dateFrom) {
        const fromDate = new Date(filters.dateFrom);
        supplierShipments = supplierShipments.filter(s => {
          const purchaseDate = s.purchaseDate ? new Date(s.purchaseDate) : null;
          return purchaseDate && purchaseDate >= fromDate;
        });
      }

      if (filters?.dateTo) {
        const toDate = new Date(filters.dateTo);
        supplierShipments = supplierShipments.filter(s => {
          const purchaseDate = s.purchaseDate ? new Date(s.purchaseDate) : null;
          return purchaseDate && purchaseDate <= toDate;
        });
      }

      const supplierShipmentIdsFiltered = new Set(supplierShipments.map(s => s.id));
      const supplierPayments = allPayments.filter(p => supplierShipmentIdsFiltered.has(p.shipmentId));

      const totalCost = supplierShipments.reduce(
        (sum, s) => sum + parseFloat(s.finalTotalCostEgp || "0"), 0
      );
      const totalPaid = supplierPayments.reduce(
        (sum, p) => sum + parseFloat(p.amountEgp || "0"), 0
      );
      const balance = totalCost - totalPaid;

      let balanceStatus: 'owing' | 'settled' | 'credit' = 'settled';
      if (balance > 0.0001) balanceStatus = 'owing';
      else if (balance < -0.0001) balanceStatus = 'credit';

      if (filters?.balanceType && filters.balanceType !== 'all') {
        if (filters.balanceType === 'owing' && balanceStatus !== 'owing') continue;
        if (filters.balanceType === 'credit' && balanceStatus !== 'credit') continue;
      }

      result.push({
        supplierId: supplier.id,
        supplierName: supplier.name,
        totalCostEgp: totalCost.toFixed(2),
        totalPaidEgp: totalPaid.toFixed(2),
        balanceEgp: balance.toFixed(2),
        balanceStatus,
      });
    }

    return result;
  }

  // Supplier Statement
  async getSupplierStatement(supplierId: number, filters?: {
    dateFrom?: string;
    dateTo?: string;
  }) {
    const supplier = await this.getSupplier(supplierId);
    if (!supplier) {
      throw new Error("Supplier not found");
    }

    const allShipments = await this.getAllShipments();
    const allPayments = await this.getAllPayments();
    const allItems = await Promise.all(
      allShipments.map(s => this.getShipmentItems(s.id))
    );

    const supplierShipmentIds = new Set<number>();
    allItems.forEach((items, idx) => {
      if (items.some(item => item.supplierId === supplierId)) {
        supplierShipmentIds.add(allShipments[idx].id);
      }
    });

    let supplierShipments = allShipments.filter(s => supplierShipmentIds.has(s.id));
    let supplierPayments = allPayments.filter(p => supplierShipmentIds.has(p.shipmentId));

    if (filters?.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      supplierShipments = supplierShipments.filter(s => {
        const purchaseDate = s.purchaseDate ? new Date(s.purchaseDate) : null;
        return purchaseDate && purchaseDate >= fromDate;
      });
      supplierPayments = supplierPayments.filter(p => new Date(p.paymentDate) >= fromDate);
    }

    if (filters?.dateTo) {
      const toDate = new Date(filters.dateTo);
      supplierShipments = supplierShipments.filter(s => {
        const purchaseDate = s.purchaseDate ? new Date(s.purchaseDate) : null;
        return purchaseDate && purchaseDate <= toDate;
      });
      supplierPayments = supplierPayments.filter(p => new Date(p.paymentDate) <= toDate);
    }

    const movements: Array<{
      date: Date | string;
      type: 'shipment' | 'payment';
      description: string;
      shipmentCode?: string;
      costEgp?: string;
      paidEgp?: string;
      runningBalance: string;
    }> = [];

    supplierShipments.forEach(s => {
      movements.push({
        date: s.purchaseDate || s.createdAt || new Date(),
        type: 'shipment',
        description: `شحنة: ${s.shipmentName}`,
        shipmentCode: s.shipmentCode,
        costEgp: s.finalTotalCostEgp || "0",
        runningBalance: "0",
      });
    });

    supplierPayments.forEach(p => {
      const shipment = allShipments.find(s => s.id === p.shipmentId);
      movements.push({
        date: p.paymentDate,
        type: 'payment',
        description: `دفعة - ${p.costComponent}`,
        shipmentCode: shipment?.shipmentCode,
        paidEgp: p.amountEgp || "0",
        runningBalance: "0",
      });
    });

    movements.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = 0;
    movements.forEach(m => {
      if (m.type === 'shipment') {
        runningBalance += parseFloat(m.costEgp || "0");
      } else {
        runningBalance -= parseFloat(m.paidEgp || "0");
      }
      m.runningBalance = runningBalance.toFixed(2);
    });

    return { supplier, movements };
  }

  // Movement Report
  async getMovementReport(filters?: {
    dateFrom?: string;
    dateTo?: string;
    shipmentId?: number;
    supplierId?: number;
    movementType?: string;
    costComponent?: string;
    paymentMethod?: string;
    shipmentStatus?: string;
    paymentStatus?: string;
    includeArchived?: boolean;
  }) {
    const allShipments = await this.getAllShipments();
    const allPayments = await this.getAllPayments();
    const allSuppliers = await this.getAllSuppliers();
    const allUsers = await this.getAllUsers();
    const allItems = await Promise.all(
      allShipments.map(s => this.getShipmentItems(s.id))
    );

    const supplierMap = new Map(allSuppliers.map(s => [s.id, s.name]));
    const userMap = new Map(allUsers.map(u => [u.id, u.firstName || u.username]));

    let filteredShipments = allShipments;
    
    if (!filters?.includeArchived) {
      filteredShipments = filteredShipments.filter(s => s.status !== "مؤرشفة");
    }

    if (filters?.shipmentStatus && filters.shipmentStatus !== "all") {
      filteredShipments = filteredShipments.filter((s) => s.status === filters.shipmentStatus);
    }

    if (filters?.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      filteredShipments = filteredShipments.filter(s => {
        const purchaseDate = s.purchaseDate ? new Date(s.purchaseDate) : null;
        return purchaseDate && purchaseDate >= fromDate;
      });
    }

    if (filters?.dateTo) {
      const toDate = new Date(filters.dateTo);
      filteredShipments = filteredShipments.filter(s => {
        const purchaseDate = s.purchaseDate ? new Date(s.purchaseDate) : null;
        return purchaseDate && purchaseDate <= toDate;
      });
    }

    if (filters?.shipmentId) {
      filteredShipments = filteredShipments.filter(s => s.id === filters.shipmentId);
    }

    if (filters?.supplierId) {
      const shipmentIdsWithSupplier = new Set<number>();
      allItems.forEach((items, idx) => {
        if (items.some(item => item.supplierId === filters.supplierId)) {
          shipmentIdsWithSupplier.add(allShipments[idx].id);
        }
      });
      filteredShipments = filteredShipments.filter(s => shipmentIdsWithSupplier.has(s.id));
    }

    if (filters?.paymentStatus && filters.paymentStatus !== "all") {
      filteredShipments = filteredShipments.filter((s) => {
        const cost = parseFloat(s.finalTotalCostEgp || "0");
        const paid = parseFloat(s.totalPaidEgp || "0");
        const balance = Math.max(0, cost - paid);
        if (filters.paymentStatus === "لم يتم دفع أي مبلغ") return paid <= 0.0001;
        if (filters.paymentStatus === "مسددة بالكامل") return balance <= 0.0001;
        if (filters.paymentStatus === "مدفوعة جزئياً") return paid > 0.0001 && balance > 0.0001;
        return true;
      });
    }

    const filteredShipmentIds = new Set(filteredShipments.map(s => s.id));

    const movements: Array<{
      date: Date | string;
      shipmentCode: string;
      shipmentName: string;
      supplierName?: string;
      supplierId?: number;
      movementType: string;
      costComponent?: string;
      paymentMethod?: string;
      originalCurrency?: string;
      amountOriginal?: string;
      amountEgp: string;
      direction: 'cost' | 'payment';
      userName?: string;
    }> = [];

    const shipmentSupplierMap = new Map<number, number | undefined>();
    allItems.forEach((items, idx) => {
      const firstSupplier = items.find(i => i.supplierId)?.supplierId;
      shipmentSupplierMap.set(allShipments[idx].id, firstSupplier ?? undefined);
    });

    for (const s of filteredShipments) {
      const supplierId = shipmentSupplierMap.get(s.id);
      const supplierName = supplierId ? supplierMap.get(supplierId) : undefined;

      const costTypes = [
        { type: "تكلفة بضاعة", rmb: s.purchaseCostRmb, egp: s.purchaseCostEgp },
        { type: "تكلفة شحن", rmb: s.shippingCostRmb, egp: s.shippingCostEgp },
        { type: "عمولة", rmb: s.commissionCostRmb, egp: s.commissionCostEgp },
        { type: "جمرك", rmb: null, egp: s.customsCostEgp },
        { type: "تخريج", rmb: null, egp: s.takhreegCostEgp },
      ];

      for (const ct of costTypes) {
        const egpAmount = parseFloat(ct.egp || "0");
        if (egpAmount <= 0) continue;

        if (filters?.movementType && filters.movementType !== ct.type && filters.movementType !== 'all') {
          continue;
        }

        movements.push({
          date: s.purchaseDate || s.createdAt || new Date(),
          shipmentCode: s.shipmentCode,
          shipmentName: s.shipmentName,
          supplierName,
          supplierId,
          movementType: ct.type,
          originalCurrency: ct.rmb ? "RMB" : "EGP",
          amountOriginal: ct.rmb || ct.egp || "0",
          amountEgp: ct.egp || "0",
          direction: 'cost',
        });
      }
    }

    let filteredPayments = allPayments.filter(p => filteredShipmentIds.has(p.shipmentId));

    if (filters?.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      filteredPayments = filteredPayments.filter(p => new Date(p.paymentDate) >= fromDate);
    }

    if (filters?.dateTo) {
      const toDate = new Date(filters.dateTo);
      filteredPayments = filteredPayments.filter(p => new Date(p.paymentDate) <= toDate);
    }

    if (filters?.costComponent) {
      filteredPayments = filteredPayments.filter(p => p.costComponent === filters.costComponent);
    }

    if (filters?.paymentMethod) {
      filteredPayments = filteredPayments.filter(p => p.paymentMethod === filters.paymentMethod);
    }

    for (const p of filteredPayments) {
      const shipment = allShipments.find(s => s.id === p.shipmentId);
      if (!shipment) continue;

      if (filters?.movementType && filters.movementType !== 'دفعة' && filters.movementType !== 'all') {
        continue;
      }

      const supplierId = shipmentSupplierMap.get(p.shipmentId);
      const supplierName = supplierId ? supplierMap.get(supplierId) : undefined;
      const userName = p.createdByUserId ? userMap.get(p.createdByUserId) : undefined;

      movements.push({
        date: p.paymentDate,
        shipmentCode: shipment.shipmentCode,
        shipmentName: shipment.shipmentName,
        supplierName,
        supplierId,
        movementType: "دفعة",
        costComponent: p.costComponent,
        paymentMethod: p.paymentMethod,
        originalCurrency: p.paymentCurrency,
        amountOriginal: p.amountOriginal || "0",
        amountEgp: p.amountEgp || "0",
        direction: 'payment',
        userName,
      });
    }

    movements.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const totalCostEgp = movements
      .filter(m => m.direction === 'cost')
      .reduce((sum, m) => sum + parseFloat(m.amountEgp), 0);

    const totalPaidEgp = movements
      .filter(m => m.direction === 'payment')
      .reduce((sum, m) => sum + parseFloat(m.amountEgp), 0);

    return {
      movements,
      totalCostEgp: totalCostEgp.toFixed(2),
      totalPaidEgp: totalPaidEgp.toFixed(2),
      netMovement: (totalCostEgp - totalPaidEgp).toFixed(2),
    };
  }

  // Payment Methods Report
  async getPaymentMethodsReport(filters?: {
    dateFrom?: string;
    dateTo?: string;
  }) {
    let allPayments = await this.getAllPayments();

    if (filters?.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      allPayments = allPayments.filter(p => new Date(p.paymentDate) >= fromDate);
    }

    if (filters?.dateTo) {
      const toDate = new Date(filters.dateTo);
      allPayments = allPayments.filter(p => new Date(p.paymentDate) <= toDate);
    }

    const methodStats = new Map<string, { count: number; total: number }>();

    for (const p of allPayments) {
      const method = p.paymentMethod || "أخرى";
      const current = methodStats.get(method) || { count: 0, total: 0 };
      current.count += 1;
      current.total += parseFloat(p.amountEgp || "0");
      methodStats.set(method, current);
    }

    return Array.from(methodStats.entries()).map(([method, stats]) => ({
      paymentMethod: method,
      paymentCount: stats.count,
      totalAmountEgp: stats.total.toFixed(2),
    }));
  }
}

export const storage = new DatabaseStorage();
